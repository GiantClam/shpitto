import {and, eq, gt, isNull, or, sql} from 'drizzle-orm';

import {assertCurrentServerQuote, type CatalogProfile, type ServerQuote} from '../../config/models.ts';
import {semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../../db/schema/credit.ts';
import {creditAccounts, creditAllocations, creditGrants, creditReservations} from '../../db/schema/workspace.ts';
import {assertCreditProjectionReconciledInTransaction} from './queries.ts';
import {executeDurableCommand} from '../shared/commands.ts';
import {type TransactionDatabase} from '../shared/transaction.ts';
import {randomUUID} from 'node:crypto';

export type ReservationInput = Readonly<{
  actorUserId: string;
  workspaceId: string;
  /** Generation task identity, set before the reservation is inserted. */
  taskId?: string;
  idempotencyKey: string;
  quote: ServerQuote;
  /** Deliberately ignored: the catalog-derived quote is authoritative. */
  clientDisplayedPrice?: string;
  commandName?: string;
  profile?: CatalogProfile;
  now?: Date;
}>;

export type ReservationResult = Readonly<{
  reservationId: string;
  workspaceId: string;
  modelId: string;
  quantity: string;
  totalCost: string;
  allocations: ReadonlyArray<Readonly<{grantId: string; amount: string; sourceExpiry: string | null}>>;
}>;

export type ReservationExecution = Readonly<{value: ReservationResult; replayed: boolean}>;

function retryable(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return code === '40001' || code === '40P01';
}

async function lockAccount(tx: TransactionDatabase, workspaceId: string): Promise<void> {
  const rows = await tx.select({workspaceId: creditAccounts.workspaceId})
    .from(creditAccounts)
    .where(eq(creditAccounts.workspaceId, workspaceId))
    .for('update')
    .limit(1);
  if (!rows[0]) throw new DomainError('CONFLICT', 'The workspace has no credit account.');
}

async function reserveInTransaction(
  tx: TransactionDatabase,
  input: ReservationInput,
): Promise<ReservationResult> {
  const profile = input.profile ?? 'local';
  const now = input.now ?? new Date();
  const quote = input.quote;
  const model = assertCurrentServerQuote(quote, profile);
  await lockAccount(tx, input.workspaceId);
  await assertCreditProjectionReconciledInTransaction(tx, input.workspaceId);

  const totalCost = BigInt(quote.totalCost);
  const grants = await tx.select().from(creditGrants)
    .where(and(
      eq(creditGrants.workspaceId, input.workspaceId),
      gt(creditGrants.available, 0n),
      or(isNull(creditGrants.expiresAt), gt(creditGrants.expiresAt, now)),
    ))
    .orderBy(sql`case when ${creditGrants.expiresAt} is null then 1 else 0 end asc, ${creditGrants.expiresAt} asc nulls last, ${creditGrants.createdAt} asc, ${creditGrants.id} asc`);

  let remaining = totalCost;
  const selected: Array<{grantId: string; amount: bigint; sourceExpiry: Date | null}> = [];
  for (const grant of grants) {
    if (remaining <= 0n) break;
    const amount = grant.available < remaining ? grant.available : remaining;
    selected.push({grantId: grant.id, amount, sourceExpiry: grant.expiresAt});
    remaining -= amount;
  }
  if (remaining > 0n) throw new DomainError('CONFLICT', 'The workspace does not have enough available credits.');

  const reservationId = randomUUID();
  const timestamp = now;
  await tx.insert(creditReservations).values({
    id: reservationId,
    workspaceId: input.workspaceId,
    taskId: input.taskId ?? null,
    actorUserId: input.actorUserId,
    commandName: input.commandName ?? 'credits.reserve',
    idempotencyKey: input.idempotencyKey,
    modelId: model.id,
    catalogVersion: quote.catalogVersion,
    quantity: BigInt(quote.quantity),
    unitCost: model.creditsPerUnit,
    totalCost,
    quoteHash: quote.quoteHash,
    status: 'active',
    createdAt: timestamp,
  });

  for (const allocation of selected) {
    await tx.update(creditGrants).set({
      available: sql`${creditGrants.available} - ${allocation.amount}`,
      reserved: sql`${creditGrants.reserved} + ${allocation.amount}`,
    }).where(and(eq(creditGrants.id, allocation.grantId), eq(creditGrants.workspaceId, input.workspaceId)));
    await tx.insert(creditAllocations).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      reservationId,
      grantId: allocation.grantId,
      amount: allocation.amount,
      sourceExpiry: allocation.sourceExpiry,
      createdAt: timestamp,
    });
    await tx.insert(creditLedgerEntries).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      grantId: allocation.grantId,
      entryType: 'reserve',
      availableDelta: -allocation.amount,
      reservedDelta: allocation.amount,
      consumedDelta: 0n,
      expiredDelta: 0n,
      voidedDelta: 0n,
      businessKey: `${reservationId}:${allocation.grantId}:reserve`,
      createdAt: timestamp,
    });
  }

  const commandName = input.commandName ?? 'credits.reserve';
  await tx.insert(auditEvents).values({
    id: randomUUID(),
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    commandName,
    commandKey: input.idempotencyKey,
    semanticHash: semanticHash(commandName, input.quote),
    payload: serializeJsonValue({quote: input.quote}),
    createdAt: timestamp,
  });
  await tx.insert(outboxEvents).values({
    id: randomUUID(),
    workspaceId: input.workspaceId,
    eventType: input.taskId ? 'generation.dispatch' : 'credit.reservation_created',
    aggregateId: reservationId,
    businessKey: `${reservationId}:dispatch-intent`,
    payload: serializeJsonValue({reservationId, taskId: input.taskId ?? null, workspaceId: input.workspaceId, modelId: model.id, totalCost: quote.totalCost}),
    status: 'pending',
    availableAt: timestamp,
    leaseUntil: null,
    leaseOwner: null,
    leaseToken: null,
    leaseGeneration: 0n,
    attempts: 0,
    createdAt: timestamp,
  });

  return {
    reservationId,
    workspaceId: input.workspaceId,
    modelId: model.id,
    quantity: quote.quantity,
    totalCost: quote.totalCost,
    allocations: selected.map((allocation) => ({
      grantId: allocation.grantId,
      amount: allocation.amount.toString(10),
      sourceExpiry: allocation.sourceExpiry?.toISOString() ?? null,
    })),
  };
}

/** Reserve credits inside a caller-owned transaction, for composite commands such as task creation. */
export async function reserveCreditsInTransaction(
  tx: TransactionDatabase,
  input: ReservationInput,
): Promise<ReservationResult> {
  return reserveInTransaction(tx, input);
}

/** Reserve credits atomically after re-deriving the cost from the current catalog. */
export async function reserveCredits(db: AppDatabase, input: ReservationInput): Promise<ReservationExecution> {
  const commandName = input.commandName ?? 'credits.reserve';
  const payload = {quote: input.quote};
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await db.transaction((tx) => executeDurableCommand(tx, {
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        commandName,
        idempotencyKey: input.idempotencyKey,
        payload,
      }, () => reserveInTransaction(tx, input)));
    } catch (error) {
      if (!retryable(error) || attempt === 3) throw error;
    }
  }
  throw new DomainError('INFRASTRUCTURE', 'Reservation retry limit exceeded.');
}

