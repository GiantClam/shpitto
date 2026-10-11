import {randomUUID} from 'node:crypto';

import {and, eq, inArray} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {commandResults} from '../../db/schema/commands.ts';
import {billingAccounts, billingCheckoutAttempts, billingSubscriptions} from '../../db/schema/billing.ts';
import {createFakeBillingProvider, type BillingCheckoutProvider} from '../../adapters/billing/fake.ts';
import {parseCheckoutRequest, type BillingCatalogSnapshot, type BillingProfile} from './contracts.ts';
import {snapshotBillingProduct} from '../../config/plans.ts';
import {executeDurableCommand} from '../shared/commands.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {requireCurrentOwner, type WorkspaceActor} from '../workspaces/policy.ts';
import {ensureCurrentCustomer} from './customer-history.ts';
import {getServerEnv} from '../../config/env.ts';

const ACTIVE_SUBSCRIPTION_STATUSES = ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'] as const;
const CHECKOUT_ATTEMPT_TTL_MS = 60 * 60 * 1000;

export type CheckoutCommandInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  idempotencyKey: string;
  catalogProductKey: unknown;
  profile: BillingProfile;
  provider?: BillingCheckoutProvider;
  now?: Date;
}>;

export type CheckoutResult = Readonly<{
  attemptId: string;
  status: 'creating' | 'open' | 'unknown' | 'paid' | 'expired' | 'canceled';
  provider: 'fixture';
  sessionId: string | null;
  checkoutUrl: string | null;
  idempotencyKey: string;
  replayed?: boolean;
}>;

export type PortalCommandInput = Readonly<{
  actor: WorkspaceActor;
  workspaceId: string;
  idempotencyKey: string;
  profile: BillingProfile;
  appUrl: string;
  provider?: BillingCheckoutProvider;
  now?: Date;
}>;

export type PortalResult = Readonly<{provider: 'fixture'; portalUrl: string; customerId: string; replayed?: boolean}>;

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

async function finishCheckout(db: AppDatabase, input: Readonly<{attemptId: string; commandScope: string; idempotencyKey: string; providerResult: Readonly<{sessionId: string; url: string}> | {unknown: true}; now: Date}>): Promise<CheckoutResult> {
  return inTransaction(db, async (tx) => {
    const rows = await tx.select().from(billingCheckoutAttempts).where(eq(billingCheckoutAttempts.id, input.attemptId)).for('update').limit(1);
    const attempt = rows[0];
    if (!attempt) throw new DomainError('NOT_FOUND', 'Checkout attempt was not found.');
    const accepted = !('unknown' in input.providerResult);
    if (attempt.status === 'paid' || attempt.status === 'expired' || attempt.status === 'canceled') {
      return {
        attemptId: attempt.id,
        status: attempt.status,
        provider: 'fixture',
        sessionId: attempt.stripeSessionId,
        checkoutUrl: accepted ? input.providerResult.url : null,
        idempotencyKey: attempt.idempotencyKey,
      };
    }
    const next = accepted
      ? {status: 'open' as const, stripeSessionId: input.providerResult.sessionId, updatedAt: input.now}
      : {status: 'unknown' as const, stripeSessionId: null, updatedAt: input.now};
    await tx.update(billingCheckoutAttempts).set(next).where(eq(billingCheckoutAttempts.id, attempt.id));
    const result: CheckoutResult = {
      attemptId: attempt.id,
      status: next.status,
      provider: 'fixture',
      sessionId: next.stripeSessionId,
      checkoutUrl: accepted ? input.providerResult.url : null,
      idempotencyKey: attempt.idempotencyKey,
    };
    await tx.update(commandResults).set({result, committedAt: input.now}).where(and(
      eq(commandResults.scopeKey, input.commandScope),
      eq(commandResults.idempotencyKey, input.idempotencyKey),
    ));
    return result;
  });
}

export async function openCheckout(db: AppDatabase, input: CheckoutCommandInput): Promise<CheckoutResult> {
  const request = parseCheckoutRequest({catalogProductKey: input.catalogProductKey});
  const provider = input.provider ?? createFakeBillingProvider({appUrl: getServerEnv().appUrl});
  if (provider.provider !== 'fixture') throw new DomainError('CONFLICT', 'The configured local billing provider is unavailable.');
  const now = input.now ?? new Date();
  const commandName = 'billing.checkout';
  const commandScope = `${input.actor.userId}:${input.workspaceId}:${commandName}`;
  const prepared = await inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    await assertBillingAccount(tx, input.workspaceId, false);
    const catalog = snapshotBillingProduct(request.catalogProductKey, input.profile);
    const customerId = await ensureCurrentCustomer(tx, {workspaceId: input.workspaceId, provider: provider.provider, now, create: true});
    return executeDurableCommand(tx, {
      actorUserId: input.actor.userId,
      workspaceId: input.workspaceId,
      commandName,
      idempotencyKey: input.idempotencyKey,
      payload: {catalogProductKey: catalog.productKey, profile: input.profile},
    }, async () => {
      if (catalog.kind === 'subscription') await assertNoActiveSubscription(tx, input.workspaceId);
      const attemptId = randomUUID();
      const providerKey = `checkout:${attemptId}`;
      await tx.insert(billingCheckoutAttempts).values({
        id: attemptId,
        workspaceId: input.workspaceId,
        provider: provider.provider,
        customerId,
        kind: catalog.kind,
        catalogSnapshot: catalog,
        stripeSessionId: null,
        idempotencyKey: providerKey,
        status: 'creating',
        expiresAt: new Date(now.getTime() + CHECKOUT_ATTEMPT_TTL_MS),
        resolvedAt: null,
        resolutionReference: null,
        createdAt: now,
        updatedAt: now,
      });
      return {attemptId, status: 'creating' as const, provider: provider.provider, sessionId: null, checkoutUrl: null, idempotencyKey: providerKey};
    });
  });
  const preparedResult = prepared.value as CheckoutResult;
  const attempt = await inTransaction(db, async (tx) => {
    const rows = await tx.select({id: billingCheckoutAttempts.id, status: billingCheckoutAttempts.status, sessionId: billingCheckoutAttempts.stripeSessionId, customerId: billingCheckoutAttempts.customerId, catalog: billingCheckoutAttempts.catalogSnapshot, key: billingCheckoutAttempts.idempotencyKey}).from(billingCheckoutAttempts).where(eq(billingCheckoutAttempts.id, preparedResult.attemptId)).limit(1);
    return rows[0];
  });
  if (!attempt) throw new DomainError('NOT_FOUND', 'Checkout attempt was not found.');
  if (attempt.status === 'open' || attempt.status === 'paid' || attempt.status === 'expired' || attempt.status === 'canceled') {
    const appUrl = getServerEnv().appUrl || 'http://localhost:3100';
    return {...preparedResult, status: attempt.status, sessionId: attempt.sessionId, checkoutUrl: attempt.sessionId ? `${appUrl.replace(/\/$/, '')}/checkout/fixture/${attempt.sessionId.replace('fixture_session_', '')}` : null, replayed: prepared.replayed};
  }
  const providerResult = await provider.createCheckout({attemptId: attempt.id, workspaceId: input.workspaceId, customerId: attempt.customerId, idempotencyKey: attempt.key, catalog: attempt.catalog as BillingCatalogSnapshot});
  const result = await finishCheckout(db, {attemptId: attempt.id, commandScope, idempotencyKey: input.idempotencyKey, providerResult, now});
  return {...result, replayed: prepared.replayed};
}

export async function openBillingPortal(db: AppDatabase, input: PortalCommandInput): Promise<PortalResult> {
  if (input.profile === 'production') throw new DomainError('CONFLICT', 'The local billing provider is unavailable in production.');
  const provider = input.provider ?? createFakeBillingProvider({appUrl: getServerEnv().appUrl});
  if (provider.provider !== 'fixture') throw new DomainError('CONFLICT', 'The configured local billing provider is unavailable.');
  const now = input.now ?? new Date();
  const commandName = 'billing.portal';
  const commandScope = `${input.actor.userId}:${input.workspaceId}:${commandName}`;
  const prepared = await inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    await assertBillingAccount(tx, input.workspaceId, true);
    const customerId = await ensureCurrentCustomer(tx, {workspaceId: input.workspaceId, provider: provider.provider, now, create: false});
    return executeDurableCommand(tx, {
      actorUserId: input.actor.userId,
      workspaceId: input.workspaceId,
      commandName,
      idempotencyKey: input.idempotencyKey,
      payload: {destination: 'billing-portal', profile: input.profile},
    }, async () => ({customerId, pending: true as const}));
  });
  const pending = prepared.value as Readonly<{customerId: string; pending?: true; portalUrl?: string}>;
  if (pending.portalUrl) return {...pending, portalUrl: pending.portalUrl, replayed: prepared.replayed} as PortalResult;
  let returnUrl: string;
  try {
    const appOrigin = new URL(input.appUrl);
    if (!['http:', 'https:'].includes(appOrigin.protocol) || appOrigin.username || appOrigin.password) throw new Error('unsafe app origin');
    returnUrl = new URL('/dashboard', appOrigin).toString();
  } catch {
    throw new DomainError('VALIDATION', 'The configured application origin is invalid.');
  }
  const providerResult = await provider.createPortal({workspaceId: input.workspaceId, customerId: pending.customerId, idempotencyKey: `portal:${input.actor.userId}:${input.workspaceId}:${input.idempotencyKey}`, returnUrl});
  const result: PortalResult = {provider: 'fixture', portalUrl: providerResult.url, customerId: pending.customerId};
  await inTransaction(db, async (tx) => {
    await tx.update(commandResults).set({result, committedAt: now}).where(and(eq(commandResults.scopeKey, commandScope), eq(commandResults.idempotencyKey, input.idempotencyKey)));
  });
  return {...result, replayed: prepared.replayed};
}
