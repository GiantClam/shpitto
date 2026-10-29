import {randomUUID} from 'node:crypto';

import {and, eq, isNull} from 'drizzle-orm';

import {semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import {DomainError} from '../../db/contracts.ts';
import {auditEvents} from '../../db/schema/credit.ts';
import {operatorTenantAccess} from '../../db/schema/operations.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';

export function validateOperatorReason(reason: string): string {
  const normalized = reason.trim();
  if (normalized.length < 3 || normalized.length > 500 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new DomainError('VALIDATION', 'A reason is required and must be 3-500 characters without control characters.');
  }
  return normalized;
}

export function validateExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > Number.MAX_SAFE_INTEGER) {
    throw new DomainError('VALIDATION', 'expectedVersion must be a nonnegative integer.');
  }
  return value as number;
}

export async function recordOperatorAudit(
  tx: TransactionDatabase,
  input: Readonly<{actorUserId: string; workspaceId?: string; commandName: string; commandKey: string; payload: unknown; now?: Date}>,
): Promise<void> {
  const now = input.now ?? new Date();
  const semantic = semanticHash(input.commandName, input.payload);
  const existing = await tx.select({semanticHash: auditEvents.semanticHash}).from(auditEvents).where(and(
    eq(auditEvents.actorUserId, input.actorUserId),
    input.workspaceId ? eq(auditEvents.workspaceId, input.workspaceId) : isNull(auditEvents.workspaceId),
    eq(auditEvents.commandName, input.commandName),
    eq(auditEvents.commandKey, input.commandKey),
  )).limit(1);
  if (existing[0]) {
    if (existing[0].semanticHash !== semantic) throw new DomainError('CONFLICT', 'The command audit key was already used for another payload.');
    return;
  }
  await tx.insert(auditEvents).values({
    id: randomUUID(),
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId ?? null,
    commandName: input.commandName,
    commandKey: input.commandKey,
    semanticHash: semantic,
    payload: serializeJsonValue(input.payload),
    createdAt: now,
  }).onConflictDoNothing();
}

export async function recordTenantAccess(
  tx: TransactionDatabase,
  input: Readonly<{actorUserId: string; workspaceId: string; purpose: string; now?: Date}>,
): Promise<void> {
  await tx.insert(operatorTenantAccess).values({
    id: randomUUID(),
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    purpose: validateOperatorReason(input.purpose),
    createdAt: input.now ?? new Date(),
  });
}
