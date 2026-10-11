import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import {canonicalJson, parseIdempotencyKey, semanticHash, serializeJsonValue} from '../../contracts/http.ts';
import type {TransactionDatabase} from './transaction.ts';
import {DomainError} from '../../db/contracts.ts';
import {commandResults} from '../../db/schema/commands.ts';

export type CommandIdentity = Readonly<{
  actorUserId: string;
  workspaceId?: string;
  commandName: string;
  idempotencyKey: string;
  payload: unknown;
}>;

export type CommandExecution<T> = Readonly<{value: T; replayed: boolean}>;

function scopeKey(identity: CommandIdentity): string {
  return `${identity.actorUserId}:${identity.workspaceId ?? 'global'}:${identity.commandName}`;
}

export async function executeDurableCommand<T>(
  tx: TransactionDatabase,
  identity: CommandIdentity,
  work: () => Promise<T>,
): Promise<CommandExecution<T>> {
  parseIdempotencyKey(identity.idempotencyKey);
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(identity.commandName)) {
    throw new DomainError('VALIDATION', 'Command name must be 1-120 URL-safe characters.');
  }
  if (!identity.actorUserId.trim()) throw new DomainError('VALIDATION', 'Command actor is required.');
  const hash = semanticHash(identity.commandName, identity.payload);
  const scope = scopeKey(identity);
  const existing = await tx.select().from(commandResults).where(and(
    eq(commandResults.scopeKey, scope),
    eq(commandResults.idempotencyKey, identity.idempotencyKey),
  )).limit(1);
  if (existing[0]) {
    if (existing[0].semanticHash !== hash) throw new DomainError('CONFLICT', 'Idempotency-Key was already used for a different command payload.');
    if (existing[0].status !== 'committed' || existing[0].result === null) {
      throw new DomainError('CONFLICT', 'The same command is already in progress.');
    }
    return {value: existing[0].result as T, replayed: true};
  }

  await tx.insert(commandResults).values({
    id: randomUUID(),
    actorUserId: identity.actorUserId,
    workspaceId: identity.workspaceId ?? null,
    scopeKey: scope,
    commandName: identity.commandName,
    idempotencyKey: identity.idempotencyKey,
    semanticHash: hash,
    status: 'pending',
    result: null,
    createdAt: new Date(),
    committedAt: null,
  }).onConflictDoNothing({target: [commandResults.scopeKey, commandResults.idempotencyKey]});

  const claimed = await tx.select().from(commandResults).where(and(
    eq(commandResults.scopeKey, scope),
    eq(commandResults.idempotencyKey, identity.idempotencyKey),
  )).limit(1);
  if (!claimed[0]) throw new DomainError('INFRASTRUCTURE', 'Command identity could not be reserved.');
  if (claimed[0].semanticHash !== hash) throw new DomainError('CONFLICT', 'Idempotency-Key was already used for a different command payload.');
  if (claimed[0].status === 'committed' && claimed[0].result !== null) {
    return {value: claimed[0].result as T, replayed: true};
  }
  if (claimed[0].idempotencyKey !== identity.idempotencyKey || claimed[0].actorUserId !== identity.actorUserId) {
    throw new DomainError('CONFLICT', 'The command identity is owned by another actor.');
  }

  const value = await work();
  const stored = serializeJsonValue(value);
  await tx.update(commandResults).set({
    status: 'committed',
    result: stored,
    committedAt: new Date(),
  }).where(eq(commandResults.id, claimed[0].id));
  return {value, replayed: false};
}

export function commandPayload<T extends Readonly<Record<string, unknown>>>(payload: T): T {
  // Validate that the payload is canonicalizable before a transaction starts.
  canonicalJson(payload);
  return payload;
}
