import {randomUUID} from 'node:crypto';

import {and, eq, inArray} from 'drizzle-orm';

import {parseIdempotencyKey} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {commandResults} from '../../db/schema/commands.ts';
import {billingAccounts, billingCheckoutAttempts, billingSubscriptions} from '../../db/schema/billing.ts';
import {createFakeBillingProvider, type BillingCheckoutInput, type BillingCheckoutObservation, type BillingCheckoutProvider} from '../../adapters/billing/fake.ts';
import {parseBillingCatalogSnapshot, parseCheckoutRequest, type BillingCatalogSnapshot, type BillingProfile, type BillingProvider} from './contracts.ts';
import {snapshotBillingProduct} from '../../config/plans.ts';
import {executeDurableCommand} from '../shared/commands.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {requireCurrentOwner, type WorkspaceActor} from '../workspaces/policy.ts';
import {ensureCurrentCustomer, provisionStripeCustomer} from './customer-history.ts';
import {getServerEnv} from '../../config/env.ts';

const ACTIVE_SUBSCRIPTION_STATUSES = ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'] as const;
const CHECKOUT_ATTEMPT_TTL_MS = 60 * 60 * 1000;
const PROVIDER_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

export type CheckoutCommandInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  idempotencyKey: string;
  catalogProductKey: unknown;
  profile: BillingProfile;
  provider?: BillingCheckoutProvider;
  /** Trusted server catalog getter; never a browser-controlled snapshot. */
  snapshotBillingProduct?: (productKey: string, profile: BillingProfile) => BillingCatalogSnapshot;
  now?: Date;
}>;

export type CheckoutResult = Readonly<{
  attemptId: string;
  status: 'creating' | 'open' | 'unknown' | 'paid' | 'expired' | 'canceled';
  provider: BillingProvider;
  sessionId: string | null;
  checkoutUrl: string | null;
  /** Stripe.js Embedded Checkout client secret. Null for fixture redirects and non-open sessions. */
  clientSecret: string | null;
  idempotencyKey: string;
  replayed?: boolean;
}>;

/** HTTP presentation. The publishable key is not stored on the durable command result. */
export function presentCheckoutResult(result: CheckoutResult, publishableKey?: string | null): Readonly<CheckoutResult & {publishableKey: string | null}> {
  const key = typeof publishableKey === 'string' && /^pk_test_[A-Za-z0-9]+$/.test(publishableKey) ? publishableKey : null;
  return Object.freeze({...result, publishableKey: result.clientSecret ? key : null});
}

export function checkoutClientFields(input: Readonly<{
  status: CheckoutResult['status'];
  observation: BillingCheckoutObservation;
  previous?: Readonly<{checkoutUrl: string | null; clientSecret?: string | null}>;
}>): Readonly<{checkoutUrl: string | null; clientSecret: string | null}> {
  if (terminal(input.status)) return {checkoutUrl: null, clientSecret: null};
  if ('unknown' in input.observation) return {checkoutUrl: input.previous?.checkoutUrl ?? null, clientSecret: input.previous?.clientSecret ?? null};
  const reusable = input.observation.status === undefined || input.observation.status === 'open';
  return {checkoutUrl: reusable ? input.observation.url : null, clientSecret: reusable ? input.observation.clientSecret ?? null : null};
}

export type PortalCommandInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  idempotencyKey: string;
  profile: BillingProfile;
  appUrl: string;
  provider?: BillingCheckoutProvider;
  now?: Date;
}>;

export type PortalResult = Readonly<{provider: BillingProvider; portalUrl: string; customerId: string; replayed?: boolean}>;
type Attempt = typeof billingCheckoutAttempts.$inferSelect;

function billingAccountRows(tx: TransactionDatabase, workspaceId: string) {
  return tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)).for('update').limit(1);
}

async function assertBillingAccount(tx: TransactionDatabase, workspaceId: string, allowHold: boolean): Promise<void> {
  const rows = await billingAccountRows(tx, workspaceId);
  const account = rows[0];
  if (!account) throw new DomainError('NOT_FOUND', 'Workspace billing is not initialized.');
  if (!allowHold && account.status === 'hold') throw new DomainError('FORBIDDEN', 'Checkout is unavailable while billing is on hold.');
}

async function assertNoActiveSubscription(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  const rows = await tx.select({id: billingSubscriptions.id}).from(billingSubscriptions).where(and(
    eq(billingSubscriptions.workspaceId, workspaceId),
    inArray(billingSubscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
  )).limit(1);
  if (rows[0]) throw new DomainError('CONFLICT', 'A nonterminal subscription already exists for this workspace.');
  const attempts = await tx.select({id: billingCheckoutAttempts.id}).from(billingCheckoutAttempts).where(and(
    eq(billingCheckoutAttempts.workspaceId, workspaceId),
    eq(billingCheckoutAttempts.kind, 'subscription'),
    inArray(billingCheckoutAttempts.status, ['creating', 'open', 'unknown']),
  )).limit(1);
  if (attempts[0]) throw new DomainError('CONFLICT', 'A recurring Checkout is already pending for this workspace.');
}

function terminal(status: string): status is 'paid' | 'expired' | 'canceled' {
  return status === 'paid' || status === 'expired' || status === 'canceled';
}

function providerInput(attempt: Attempt): BillingCheckoutInput {
  return {attemptId: attempt.id, workspaceId: attempt.workspaceId, customerId: attempt.customerId,
    idempotencyKey: attempt.idempotencyKey, catalog: parseBillingCatalogSnapshot(attempt.catalogSnapshot)};
}

function mergeObservation(attempt: Attempt, observation: BillingCheckoutObservation, now: Date) {
  if (terminal(attempt.status)) return null;
  if ('unknown' in observation) {
    if (!observation.sessionId) return null;
    if (attempt.stripeSessionId && attempt.stripeSessionId !== observation.sessionId) throw new DomainError('CONFLICT', 'Checkout returned a conflicting provider session.');
    return {status: 'unknown' as const, stripeSessionId: observation.sessionId, updatedAt: now};
  }
  if (attempt.stripeSessionId && attempt.stripeSessionId !== observation.sessionId) throw new DomainError('CONFLICT', 'Checkout returned a conflicting provider session.');
  // Paid purchases must converge through canonical payment/subscription reconciliation.
  const status = observation.status === 'paid' && observation.completed ? 'paid' : observation.status === 'expired' || observation.status === 'canceled' ? observation.status : 'open';
  return {status, stripeSessionId: observation.sessionId, updatedAt: now,
    ...(terminal(status) ? {resolvedAt: now, resolutionReference: `provider:${observation.sessionId}:${status}`} : {})};
}

async function finishCheckout(db: AppDatabase, input: CheckoutCommandInput, attemptId: string, observation: BillingCheckoutObservation, now: Date): Promise<CheckoutResult> {
  return inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    await assertBillingAccount(tx, input.workspaceId, false);
    const [attempt] = await tx.select().from(billingCheckoutAttempts).where(eq(billingCheckoutAttempts.id, attemptId)).for('update').limit(1);
    if (!attempt || attempt.workspaceId !== input.workspaceId) throw new DomainError('NOT_FOUND', 'Checkout attempt was not found.');
    const condition = and(eq(commandResults.scopeKey, `${input.actor.userId}:${input.workspaceId}:billing.checkout`), eq(commandResults.idempotencyKey, input.idempotencyKey));
    const [command] = await tx.select().from(commandResults).where(condition).for('update').limit(1);
    const previous = command?.result as CheckoutResult | undefined;
    const next = mergeObservation(attempt, observation, now) ?? (!attempt.stripeSessionId && !terminal(attempt.status) ? {status: 'unknown' as const, updatedAt: now} : null);
    if (next) await tx.update(billingCheckoutAttempts).set(next).where(eq(billingCheckoutAttempts.id, attempt.id));
    const status = (next?.status ?? attempt.status) as CheckoutResult['status'];
    const fields = checkoutClientFields({status, observation, previous});
    const result: CheckoutResult = {
      attemptId: attempt.id,
      status,
      provider: attempt.provider as BillingProvider,
      sessionId: next && 'stripeSessionId' in next ? next.stripeSessionId : attempt.stripeSessionId,
      checkoutUrl: fields.checkoutUrl,
      clientSecret: fields.clientSecret,
      idempotencyKey: attempt.idempotencyKey,
    };
    await tx.update(commandResults).set({result, committedAt: now}).where(condition);
    return result;
  });
}

function approvedCatalog(input: CheckoutCommandInput, productKey: string, provider: BillingProvider): BillingCatalogSnapshot {
  const getter = provider === 'stripe' ? input.snapshotBillingProduct : snapshotBillingProduct;
  if (!getter) throw new DomainError('CONFLICT', 'Stripe Checkout requires an injected server catalog.');
  const catalog = parseBillingCatalogSnapshot(getter(productKey, input.profile));
  if (catalog.provider !== provider || catalog.productKey !== productKey) throw new DomainError('CONFLICT', 'The server catalog product does not match the Checkout provider or requested product.');
  return catalog;
}

async function observeCheckout(provider: BillingCheckoutProvider, attempt: Attempt, previous: CheckoutResult, now: Date): Promise<BillingCheckoutObservation> {
  if (terminal(attempt.status)) return {unknown: true};
  const input = providerInput(attempt);
  if (attempt.stripeSessionId) {
    if (provider.provider === 'stripe') {
      if (!provider.retrieveCheckout) throw new DomainError('CONFLICT', 'The Stripe provider cannot retrieve the known Checkout session.');
      return provider.retrieveCheckout({...input, sessionId: attempt.stripeSessionId});
    }
    if (previous.checkoutUrl || previous.clientSecret) return {sessionId: attempt.stripeSessionId, url: previous.checkoutUrl, clientSecret: previous.clientSecret ?? null};
    const appUrl = getServerEnv().appUrl || 'http://localhost:3100';
    return {sessionId: attempt.stripeSessionId, url: `${appUrl.replace(/\/$/, '')}/checkout/fixture/${attempt.stripeSessionId.replace('fixture_session_', '')}`};
  }
  if (provider.provider === 'stripe' && now.getTime() - attempt.createdAt.getTime() >= PROVIDER_RETRY_WINDOW_MS) return {unknown: true};
  return provider.createCheckout(input);
}

async function createCheckoutAttempt(tx: TransactionDatabase, input: CheckoutCommandInput, catalog: BillingCatalogSnapshot, now: Date): Promise<CheckoutResult> {
  const provider = catalog.provider;
  const customerId = await ensureCurrentCustomer(tx, {workspaceId: input.workspaceId, provider, now, create: provider === 'fixture'});
  if (catalog.kind === 'subscription') await assertNoActiveSubscription(tx, input.workspaceId);
  const attemptId = randomUUID();
  const providerKey = `checkout:${attemptId}`;
  await tx.insert(billingCheckoutAttempts).values({
    id: attemptId, workspaceId: input.workspaceId, provider, customerId, kind: catalog.kind, catalogSnapshot: catalog,
    stripeSessionId: null, idempotencyKey: providerKey, status: 'creating',
    expiresAt: new Date(now.getTime() + CHECKOUT_ATTEMPT_TTL_MS), resolvedAt: null, resolutionReference: null, createdAt: now, updatedAt: now,
  });
  return {attemptId, status: 'creating', provider, sessionId: null, checkoutUrl: null, clientSecret: null, idempotencyKey: providerKey};
}

export async function openCheckout(db: AppDatabase, input: CheckoutCommandInput): Promise<CheckoutResult> {
  const request = parseCheckoutRequest({catalogProductKey: input.catalogProductKey});
  parseIdempotencyKey(input.idempotencyKey);
  const provider = input.provider ?? createFakeBillingProvider({appUrl: getServerEnv().appUrl});
  if (input.profile === 'production') throw new DomainError('CONFLICT', 'Test billing is unavailable in production.');
  if (provider.provider === 'stripe' && !input.snapshotBillingProduct) throw new DomainError('CONFLICT', 'Stripe Checkout requires an injected server catalog.');
  const now = input.now ?? new Date();
  const commandName = 'billing.checkout';
  const identity = {actorUserId: input.actor.userId, workspaceId: input.workspaceId, commandName, idempotencyKey: input.idempotencyKey,
    payload: {catalogProductKey: request.catalogProductKey, profile: input.profile, ...(provider.provider === 'stripe' ? {provider: 'stripe'} : {})}};
  const initial = await inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    await assertBillingAccount(tx, input.workspaceId, false);
    const [existing] = await tx.select().from(commandResults).where(and(
      eq(commandResults.scopeKey, `${input.actor.userId}:${input.workspaceId}:${commandName}`), eq(commandResults.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    const replay = existing ? await executeDurableCommand<CheckoutResult>(tx, identity, async () => { throw new DomainError('CONFLICT', 'The same Checkout command is already in progress.'); }) : null;
    const catalog = replay ? null : approvedCatalog(input, request.catalogProductKey, provider.provider);
    if (catalog?.kind === 'subscription') await assertNoActiveSubscription(tx, input.workspaceId);
    return {replay, catalog};
  });
  if (!initial.replay && provider.provider === 'stripe') await provisionStripeCustomer(db, {actor: input.actor, workspaceId: input.workspaceId, provider, now});
  const prepared = initial.replay ?? await inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    await assertBillingAccount(tx, input.workspaceId, false);
    return executeDurableCommand(tx, identity, async () => {
      const catalog = initial.catalog;
      if (!catalog) throw new DomainError('CONFLICT', 'The server catalog is missing.');
      return createCheckoutAttempt(tx, input, catalog, now);
    });
  });
  const preparedResult = prepared.value as CheckoutResult;
  const [attempt] = await db.select().from(billingCheckoutAttempts).where(eq(billingCheckoutAttempts.id, preparedResult.attemptId)).limit(1);
  if (!attempt || attempt.provider !== provider.provider || attempt.workspaceId !== input.workspaceId) throw new DomainError('CONFLICT', 'The Checkout attempt does not match the configured provider or workspace.');
  const providerResult = await observeCheckout(provider, attempt, preparedResult, now);
  try {
    const result = await finishCheckout(db, input, attempt.id, providerResult, now);
    return {...result, replayed: prepared.replayed};
  } catch (error) {
    if (provider.expireCheckout && 'sessionId' in providerResult && providerResult.sessionId) {
      try {
        await provider.expireCheckout({...providerInput(attempt), sessionId: providerResult.sessionId});
      } catch {
        // Preserve the durable binding error. The session remains visible for manual reconciliation if expiry also fails.
      }
    }
    throw error;
  }
}

export async function openBillingPortal(db: AppDatabase, input: PortalCommandInput): Promise<PortalResult> {
  if (input.profile === 'production') throw new DomainError('CONFLICT', 'The local billing provider is unavailable in production.');
  const provider = input.provider ?? createFakeBillingProvider({appUrl: getServerEnv().appUrl});
  const now = input.now ?? new Date();
  const commandName = 'billing.portal';
  const commandScope = `${input.actor.userId}:${input.workspaceId}:${commandName}`;
  const prepared = await inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    await assertBillingAccount(tx, input.workspaceId, true);
    return executeDurableCommand(tx, {
      actorUserId: input.actor.userId,
      workspaceId: input.workspaceId,
      commandName,
      idempotencyKey: input.idempotencyKey,
      payload: {destination: 'billing-portal', profile: input.profile, ...(provider.provider === 'stripe' ? {provider: 'stripe'} : {})},
    }, async () => ({customerId: await ensureCurrentCustomer(tx, {workspaceId: input.workspaceId, provider: provider.provider, now, create: false}),
      provider: provider.provider, returnUrl: portalReturnUrl(input.appUrl), createdAt: now.toISOString(), pending: true as const}));
  });
  const pending = prepared.value as Readonly<{customerId: string; pending?: true; portalUrl?: string; returnUrl?: string; createdAt?: string}>;
  if (pending.portalUrl) return {...pending, portalUrl: pending.portalUrl, replayed: prepared.replayed} as PortalResult;
  if (provider.provider === 'stripe' && pending.createdAt && now.getTime() - new Date(pending.createdAt).getTime() >= PROVIDER_RETRY_WINDOW_MS) throw new DomainError('CONFLICT', 'The pending portal requires reconciliation after the idempotency retention window.');
  const returnUrl = pending.returnUrl ?? portalReturnUrl(input.appUrl);
  const providerResult = await provider.createPortal({workspaceId: input.workspaceId, customerId: pending.customerId, idempotencyKey: `portal:${input.actor.userId}:${input.workspaceId}:${input.idempotencyKey}`, returnUrl});
  const result: PortalResult = {provider: provider.provider, portalUrl: providerResult.url, customerId: pending.customerId};
  const accepted = await inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    await assertBillingAccount(tx, input.workspaceId, true);
    const condition = and(eq(commandResults.scopeKey, commandScope), eq(commandResults.idempotencyKey, input.idempotencyKey));
    const [command] = await tx.select().from(commandResults).where(condition).for('update').limit(1);
    const stored = command?.result as PortalResult | undefined;
    if (stored?.portalUrl) return stored;
    await tx.update(commandResults).set({result, committedAt: now}).where(condition);
    return result;
  });
  return {...accepted, replayed: prepared.replayed};
}

function portalReturnUrl(appUrl: string): string {
  try {
    const origin = new URL(appUrl);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('unsafe app origin');
    return new URL('/dashboard', origin).toString();
  } catch {
    throw new DomainError('VALIDATION', 'The configured application origin is invalid.');
  }
}
