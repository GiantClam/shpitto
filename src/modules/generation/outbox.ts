import {randomUUID} from 'node:crypto';

import {and, eq, gt, isNull, lte, or} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {outboxEvents} from '../../db/schema/credit.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';

export const OUTBOX_LEASE_MS = 60_000;
export const OUTBOX_HEARTBEAT_INTERVAL_MS = 20_000;

export type OutboxHeartbeatController = Readonly<{
  renew: () => Promise<void>;
  hasLostLease: () => boolean;
  stop: () => Promise<void>;
}>;

export function createOutboxHeartbeatController(
  renewLease: () => Promise<boolean>,
  options: Readonly<{
    intervalMs?: number;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
  }> = {},
): OutboxHeartbeatController {
  const intervalMs = options.intervalMs ?? OUTBOX_HEARTBEAT_INTERVAL_MS;
  const schedule = options.setInterval ?? setInterval;
  const cancel = options.clearInterval ?? clearInterval;
  let stopped = false;
  let lost = false;
  let lastError: Error | null = null;
  let periodicQueued = false;
  let tail: Promise<void> = Promise.resolve();

  const enqueue = (): Promise<void> => {
    const next = tail.then(async () => {
      if (stopped) return;
      if (lost) throw lastError ?? new Error('The local worker no longer owns this lease.');
      if (!await renewLease()) {
        throw new Error('The local worker no longer owns this lease.');
      }
    });
    tail = next.catch((error: unknown) => {
      lost = true;
      lastError = error instanceof Error ? error : new Error(String(error));
      throw lastError;
    });
    return tail;
  };

  const timer = schedule(() => {
    if (stopped || lost || periodicQueued) return;
    periodicQueued = true;
    void enqueue().catch(() => undefined).finally(() => { periodicQueued = false; });
  }, intervalMs);
  timer.unref?.();

  return {
    renew: enqueue,
    hasLostLease: () => lost,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      cancel(timer);
      await tail.catch(() => undefined);
    },
  };
}

export type OutboxLease = Readonly<{
  id: string;
  eventType: string;
  payload: unknown;
  owner: string;
  token: string;
  generation: bigint;
  attempts: number;
}>;

/** Hold the live lease row until the caller's domain transaction commits. */
export async function assertOutboxLeaseInTransaction(tx: TransactionDatabase, lease: OutboxLease | undefined, now = new Date()): Promise<void> {
  if (!lease) return;
  const current = await tx.select({id: outboxEvents.id}).from(outboxEvents).where(and(
    eq(outboxEvents.id, lease.id),
    eq(outboxEvents.status, 'pending'),
    eq(outboxEvents.leaseOwner, lease.owner),
    eq(outboxEvents.leaseToken, lease.token),
    eq(outboxEvents.leaseGeneration, lease.generation),
    gt(outboxEvents.leaseUntil, now),
  )).for('update').limit(1);
  if (!current[0]) throw new DomainError('CONFLICT', 'The worker lease is no longer current.');
}

/** Claim one pending/expired outbox row using SKIP LOCKED and a fenced lease. */
export async function claimOutbox(db: AppDatabase, owner: string, now = new Date(), filter: Readonly<{eventType?: string; workspaceId?: string}> = {}): Promise<OutboxLease | null> {
  const token = randomUUID();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(outboxEvents).where(and(
      eq(outboxEvents.status, 'pending'),
      lte(outboxEvents.availableAt, now),
      or(isNull(outboxEvents.leaseUntil), lte(outboxEvents.leaseUntil, now)),
      filter.eventType ? eq(outboxEvents.eventType, filter.eventType) : undefined,
      filter.workspaceId ? eq(outboxEvents.workspaceId, filter.workspaceId) : undefined,
    )).orderBy(outboxEvents.createdAt).for('update', {skipLocked: true}).limit(1);
    const row = rows[0];
    if (!row) return null;
    const nextGeneration = row.leaseGeneration + 1n;
    const updated = await tx.update(outboxEvents).set({
      leaseUntil: new Date(now.getTime() + OUTBOX_LEASE_MS), leaseOwner: owner, leaseToken: token,
      leaseGeneration: nextGeneration, attempts: row.attempts + 1,
    }).where(and(eq(outboxEvents.id, row.id), eq(outboxEvents.leaseGeneration, row.leaseGeneration))).returning({id: outboxEvents.id});
    if (!updated[0]) return null;
    return {id: row.id, eventType: row.eventType, payload: row.payload, owner, token, generation: nextGeneration, attempts: row.attempts + 1};
  });
}

export async function acknowledgeOutbox(db: AppDatabase, lease: OutboxLease, now = new Date()): Promise<boolean> {
  const result = await db.update(outboxEvents).set({status: 'published', leaseUntil: null, leaseOwner: null, leaseToken: null, availableAt: now})
    .where(and(eq(outboxEvents.id, lease.id), eq(outboxEvents.status, 'pending'), eq(outboxEvents.leaseOwner, lease.owner), eq(outboxEvents.leaseToken, lease.token), eq(outboxEvents.leaseGeneration, lease.generation), gt(outboxEvents.leaseUntil, now)));
  return result.rowCount === 1;
}

export async function failOutbox(db: AppDatabase, lease: OutboxLease, now = new Date()): Promise<boolean> {
  const result = await db.update(outboxEvents).set({status: 'failed', leaseUntil: null, leaseOwner: null, leaseToken: null, availableAt: now})
    .where(and(eq(outboxEvents.id, lease.id), eq(outboxEvents.status, 'pending'), eq(outboxEvents.leaseOwner, lease.owner), eq(outboxEvents.leaseToken, lease.token), eq(outboxEvents.leaseGeneration, lease.generation), gt(outboxEvents.leaseUntil, now)));
  return result.rowCount === 1;
}

/** Return a leased event to the pending queue without weakening its fence. */
export async function releaseOutbox(db: AppDatabase, lease: OutboxLease, availableAt: Date, now = new Date()): Promise<boolean> {
  const result = await db.update(outboxEvents).set({status: 'pending', leaseUntil: null, leaseOwner: null, leaseToken: null, availableAt})
    .where(and(eq(outboxEvents.id, lease.id), eq(outboxEvents.status, 'pending'), eq(outboxEvents.leaseOwner, lease.owner), eq(outboxEvents.leaseToken, lease.token), eq(outboxEvents.leaseGeneration, lease.generation), gt(outboxEvents.leaseUntil, now)));
  return result.rowCount === 1;
}

/** Renew only the current, unexpired lease; expiry never resurrects ownership. */
export async function heartbeatOutbox(db: AppDatabase, lease: OutboxLease, now = new Date()): Promise<boolean> {
  const result = await db.update(outboxEvents).set({leaseUntil: new Date(now.getTime() + OUTBOX_LEASE_MS)})
    .where(and(eq(outboxEvents.id, lease.id), eq(outboxEvents.status, 'pending'), eq(outboxEvents.leaseOwner, lease.owner), eq(outboxEvents.leaseToken, lease.token), eq(outboxEvents.leaseGeneration, lease.generation), gt(outboxEvents.leaseUntil, now)));
  return result.rowCount === 1;
}

/** Serialize lease heartbeats so a slow database call cannot overlap the next renewal. */
export function startOutboxHeartbeat(
  db: AppDatabase,
  lease: OutboxLease,
  options: Readonly<{
    now?: () => Date;
    intervalMs?: number;
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
  }> = {},
): OutboxHeartbeatController {
  const now = options.now ?? (() => new Date());
  return createOutboxHeartbeatController(() => heartbeatOutbox(db, lease, now()), options);
}
