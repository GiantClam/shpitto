import {randomUUID} from 'node:crypto';

import {and, eq, isNull} from 'drizzle-orm';

import type {BillingCheckoutProvider, BillingCustomerResult} from '../../adapters/billing/fake.ts';
import {semanticHash} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingAccounts, billingCustomerHistory} from '../../db/schema/billing.ts';
import {commandResults} from '../../db/schema/commands.ts';
import {inTransaction, type TransactionDatabase} from '../shared/transaction.ts';
import {requireCurrentOwner, type WorkspaceActor} from '../workspaces/policy.ts';

export type BillingCustomerProvider = 'fixture' | 'stripe';

export type CustomerHistoryEntry = Readonly<{
  provider: BillingCustomerProvider;
  workspaceId: string;
  customerId: string;
  previousCustomerId: string | null;
  validFrom: Date;
  validUntil: Date | null;
  changeReason: string;
}>;

function customerId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/.test(value)) throw new DomainError('VALIDATION', 'The billing customer identifier is invalid.');
  return value;
}

function reason(value: string): string {
  if (value.trim().length < 3 || value.trim().length > 255) throw new DomainError('VALIDATION', 'A billing customer history reason is required.');
  return value.trim();
}

export async function findCurrentCustomer(tx: TransactionDatabase, workspaceId: string, provider: BillingCustomerProvider): Promise<CustomerHistoryEntry | null> {
  const rows = await tx.select().from(billingCustomerHistory).where(and(
    eq(billingCustomerHistory.workspaceId, workspaceId),
    eq(billingCustomerHistory.provider, provider),
    isNull(billingCustomerHistory.validUntil),
  )).limit(1);
  const row = rows[0];
  return row ? {...row, provider: row.provider as BillingCustomerProvider} : null;
}

export async function ensureCurrentCustomer(tx: TransactionDatabase, input: Readonly<{workspaceId: string; provider: BillingCustomerProvider; now: Date; create: boolean}>): Promise<string> {
  const current = await findCurrentCustomer(tx, input.workspaceId, input.provider);
  if (current) return current.customerId;
  if (!input.create) throw new DomainError('CONFLICT', 'A billing customer is not configured for this workspace.');
  if (input.provider !== 'fixture') throw new DomainError('CONFLICT', 'Stripe customers require durable provider provisioning.');
  const generated = customerId(`${input.provider}_customer_${input.workspaceId}`);
  await tx.insert(billingCustomerHistory).values({
    workspaceId: input.workspaceId,
    provider: input.provider,
    customerId: generated,
    previousCustomerId: null,
    validFrom: input.now,
    validUntil: null,
    changeReason: 'Created by local billing Checkout command',
  });
  return generated;
}

type ProvisionInput = Readonly<{actor: WorkspaceActor; workspaceId: string; provider: BillingCheckoutProvider; now: Date}>;
type ProvisionIntent = Readonly<{idempotencyKey: string; customerId: string | null}>;
const CUSTOMER_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

async function authorizeProvisioning(tx: TransactionDatabase, input: ProvisionInput): Promise<void> {
  await requireCurrentOwner(tx, input.workspaceId, input.actor);
  const [account] = await tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, input.workspaceId)).for('update').limit(1);
  if (!account) throw new DomainError('NOT_FOUND', 'Workspace billing is not initialized.');
  if (account.status === 'hold') throw new DomainError('FORBIDDEN', 'Checkout is unavailable while billing is on hold.');
}

async function prepareCustomerIntent(tx: TransactionDatabase, input: ProvisionInput) {
  await authorizeProvisioning(tx, input);
  const current = await findCurrentCustomer(tx, input.workspaceId, 'stripe');
  if (current) return {customerId: current.customerId} as const;
  const scopeKey = `${input.workspaceId}:billing.customer.provision:stripe`;
  const idempotencyKey = `customer:${input.workspaceId}:stripe`;
  const [existing] = await tx.select().from(commandResults).where(and(
    eq(commandResults.scopeKey, scopeKey), eq(commandResults.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (existing) {
    const intent = existing.result as ProvisionIntent;
    if (input.now.getTime() - existing.createdAt.getTime() >= CUSTOMER_RETRY_WINDOW_MS && !intent.customerId) {
      throw new DomainError('CONFLICT', 'Stripe customer provisioning requires reconciliation after the idempotency retention window.');
    }
    return {id: existing.id, ...intent};
  }
  const id = randomUUID();
  const result: ProvisionIntent = {idempotencyKey, customerId: null};
  await tx.insert(commandResults).values({id, actorUserId: input.actor.userId, workspaceId: input.workspaceId,
    scopeKey, commandName: 'billing.customer.provision', idempotencyKey,
    semanticHash: semanticHash('billing.customer.provision', {workspaceId: input.workspaceId, provider: 'stripe'}),
    status: 'committed', result, createdAt: input.now, committedAt: input.now});
  return {id, ...result};
}

async function bindProvisionedCustomer(tx: TransactionDatabase, input: ProvisionInput, intentId: string, result: BillingCustomerResult): Promise<string | null> {
  // Ownership transfer and billing recovery use the same workspace -> billing lock order.
  await authorizeProvisioning(tx, input);
  const current = await findCurrentCustomer(tx, input.workspaceId, 'stripe');
  if (current) return current.customerId;
  if ('unknown' in result) return null;
  const remoteId = customerId(result.customerId);
  if (!/^cus_[A-Za-z0-9]+$/.test(remoteId)) throw new DomainError('VALIDATION', 'The Stripe customer identifier is invalid.');
  const [intent] = await tx.select().from(commandResults).where(eq(commandResults.id, intentId)).for('update').limit(1);
  if (!intent) throw new DomainError('CONFLICT', 'The durable customer provisioning intent is missing.');
  const stored = intent.result as ProvisionIntent;
  if (stored.customerId && stored.customerId !== remoteId) throw new DomainError('CONFLICT', 'Stripe customer provisioning returned conflicting identities.');
  await tx.insert(billingCustomerHistory).values({workspaceId: input.workspaceId, provider: 'stripe', customerId: remoteId,
    previousCustomerId: null, validFrom: input.now, validUntil: null, changeReason: 'Created by durable billing customer provisioning'});
  await tx.update(commandResults).set({result: {...stored, customerId: remoteId}, committedAt: input.now}).where(eq(commandResults.id, intentId));
  return remoteId;
}

/** Remote creation runs after the durable intent commits and before any binding transaction. */
export async function provisionStripeCustomer(db: AppDatabase, input: ProvisionInput): Promise<string> {
  const intent = await inTransaction(db, (tx) => prepareCustomerIntent(tx, input));
  if (intent.customerId) return intent.customerId;
  if (!('id' in intent)) throw new DomainError('CONFLICT', 'The durable customer provisioning intent is missing.');
  const create = input.provider.ensureCustomer ?? input.provider.createCustomer;
  if (!create) throw new DomainError('CONFLICT', 'The Stripe provider cannot provision a customer.');
  const result = await create.call(input.provider, {workspaceId: input.workspaceId, idempotencyKey: intent.idempotencyKey});
  const bound = await inTransaction(db, (tx) => bindProvisionedCustomer(tx, input, intent.id, result));
  if (!bound) throw new DomainError('CONFLICT', 'Stripe customer provisioning outcome is unknown; retry the durable intent.');
  return bound;
}

export async function replaceCustomer(db: AppDatabase, input: Readonly<{workspaceId: string; provider: BillingCustomerProvider; customerId: string; reason: string; now?: Date}>): Promise<CustomerHistoryEntry> {
  const nextCustomerId = customerId(input.customerId);
  const changeReason = reason(input.reason);
  const now = input.now ?? new Date();
  return inTransaction(db, async (tx) => {
    const currentRows = await tx.select().from(billingCustomerHistory).where(and(
      eq(billingCustomerHistory.workspaceId, input.workspaceId),
      eq(billingCustomerHistory.provider, input.provider),
      isNull(billingCustomerHistory.validUntil),
    )).for('update').limit(1);
    const current = currentRows[0];
    if (!current) throw new DomainError('NOT_FOUND', 'A current billing customer is not configured for this workspace.');
    const currentEntry = {...current, provider: current.provider as BillingCustomerProvider};
    if (current.customerId === nextCustomerId) return currentEntry;
    await tx.update(billingCustomerHistory).set({validUntil: now}).where(and(
      eq(billingCustomerHistory.provider, input.provider),
      eq(billingCustomerHistory.customerId, current.customerId),
    ));
    await tx.insert(billingCustomerHistory).values({
      workspaceId: input.workspaceId,
      provider: input.provider,
      customerId: nextCustomerId,
      previousCustomerId: currentEntry.customerId,
      validFrom: now,
      validUntil: null,
      changeReason,
    });
    return {provider: input.provider, workspaceId: input.workspaceId, customerId: nextCustomerId, previousCustomerId: currentEntry.customerId, validFrom: now, validUntil: null, changeReason};
  });
}

export async function listCustomerHistory(db: AppDatabase, input: Readonly<{workspaceId: string; provider: BillingCustomerProvider}>): Promise<readonly CustomerHistoryEntry[]> {
  return inTransaction(db, async (tx) => (await tx.select().from(billingCustomerHistory).where(and(
    eq(billingCustomerHistory.workspaceId, input.workspaceId),
    eq(billingCustomerHistory.provider, input.provider),
  )).orderBy(billingCustomerHistory.validFrom)).map((row) => ({...row, provider: row.provider as BillingCustomerProvider})));
}
