import {and, desc, eq, inArray, sql} from 'drizzle-orm';

import {semanticHash} from '../../contracts/http.ts';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {billingRefundRequests} from '../../db/schema/billing.ts';
import {commandResults} from '../../db/schema/commands.ts';
import {auditEvents} from '../../db/schema/credit.ts';
import {recordTenantAccess, validateOperatorReason} from '../operations/audit.ts';
import {authorizeOperatorCommand} from '../operations/authorize.ts';
import {inTransaction} from '../shared/transaction.ts';
import type {WorkspaceActor} from '../workspaces/policy.ts';

type RetryBody = Readonly<{command: 'refund'; workspaceId: string; orderId: string; amountMinor?: string; reason: string; purpose: string; expectedVersion: number; idempotencyKey: string}>;

function retryBody(workspaceId: string, key: string, expectedHash: string, audit: unknown): RetryBody | null {
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) return null;
  const value = audit as Record<string, unknown>;
  if (typeof value.orderId !== 'string' || typeof value.reason !== 'string' || typeof value.purpose !== 'string' || typeof value.expectedVersion !== 'number' || typeof value.amountMinor !== 'string') return null;
  // Older audits stored the effective amount only. The persisted semantic hash
  // distinguishes the original omitted amount from an explicitly supplied amount.
  for (const amountMinor of [null, value.amountMinor]) {
    const payload = {orderId: value.orderId, amountMinor, expectedVersion: value.expectedVersion, reason: value.reason, purpose: value.purpose};
    if (semanticHash('operator.billing.refund', payload) === expectedHash) return {command: 'refund', workspaceId, ...payload, amountMinor: amountMinor ?? undefined, idempotencyKey: key};
  }
  return null;
}

/** Recover only this actor's exact persisted command; a new body/key cannot release pending cash intent. */
export async function readPendingOperatorRefunds(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string; purpose: string; page?: number; pageSize?: number}>) {
  const purpose = validateOperatorReason(input.purpose);
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new DomainError('VALIDATION', 'Pending-refund pagination is out of bounds.');
  return inTransaction(db, async (tx) => {
    await authorizeOperatorCommand(tx, input.actor, 'operator');
    await recordTenantAccess(tx, {actorUserId: input.actor.userId, workspaceId: input.workspaceId, purpose});
    const rows = await tx.select({command: commandResults, request: billingRefundRequests}).from(commandResults)
      .innerJoin(billingRefundRequests, eq(sql`${commandResults.result}->>'requestId'`, sql`${billingRefundRequests.id}::text`))
      .where(and(eq(commandResults.actorUserId, input.actor.userId), eq(commandResults.workspaceId, input.workspaceId), eq(billingRefundRequests.workspaceId, input.workspaceId), eq(commandResults.commandName, 'operator.billing.refund'), eq(commandResults.status, 'committed'), inArray(billingRefundRequests.status, ['pending', 'unknown'])))
      .orderBy(desc(commandResults.createdAt), desc(commandResults.id)).limit(pageSize + 1).offset((page - 1) * pageSize);
    const visible = rows.slice(0, pageSize);
    const audits = visible.length ? await tx.select({commandKey: auditEvents.commandKey, payload: auditEvents.payload}).from(auditEvents).where(and(eq(auditEvents.actorUserId, input.actor.userId), eq(auditEvents.workspaceId, input.workspaceId), eq(auditEvents.commandName, 'operator.billing.refund'), inArray(auditEvents.commandKey, visible.map((row) => row.command.idempotencyKey)))) : [];
    const auditByKey = new Map(audits.map((row) => [row.commandKey, row.payload]));
    return {page, pageSize, hasMore: rows.length > pageSize, items: visible.map(({command, request}) => ({id: request.id, orderId: request.orderId, status: request.status, amountMinor: request.amountMinor.toString(), currency: request.currency, createdAt: request.createdAt.toISOString(), retry: retryBody(input.workspaceId, command.idempotencyKey, command.semanticHash, auditByKey.get(command.idempotencyKey))}))};
  });
}
