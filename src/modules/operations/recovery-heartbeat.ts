import {randomUUID} from 'node:crypto';
import {and, asc, eq, gt, isNull, sql} from 'drizzle-orm';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {recoveryHeartbeats as heartbeats, recoveryHeartbeatIncidents as incidents} from '../../db/schema/recovery-heartbeat.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';

export const RECOVERY_HEARTBEAT_STALE_MS = 180_000;
export const RECOVERY_ALERT_LEASE_MS = 60_000;
export const RECOVERY_ALERT_RETRY_MS = 30_000;
export const RECOVERY_HEARTBEAT_ACTION = 'Restore the assigned worker/database; drain overdue tasks before dispatch. Never reset submission fences.';

export type RecoveryHeartbeatScope = Readonly<{workspaceId: string; workerKey: string; expectedAt: Date}>;
export type RecoveryHeartbeatAlert = Readonly<{
  incidentId: string; workspaceId: string; workerKey: string; expectedAt: string;
  observedAt: string; lastSweepAt: string | null; ageSeconds: number;
  code: 'sweep_heartbeat_missing'; action: typeof RECOVERY_HEARTBEAT_ACTION;
}>;
export type RecoveryHeartbeatClaim = Readonly<{
  status: 'claimed'; incidentId: string; token: string; payload: RecoveryHeartbeatAlert;
}>;
type Observation = Readonly<{status: 'healthy' | 'waiting' | 'already_delivered'}>;
export type RecoveryHeartbeatPort = Readonly<{
  claim(scope: RecoveryHeartbeatScope): Promise<RecoveryHeartbeatClaim | Observation>;
  complete(scope: RecoveryHeartbeatScope, claim: RecoveryHeartbeatClaim, delivered: boolean): Promise<boolean>;
}>;
/** Resolve only after authenticated transport and its matching remote receipt succeed; otherwise throw. */
export type RecoveryHeartbeatDelivery = (payload: RecoveryHeartbeatAlert, options: Readonly<{idempotencyKey: string}>) => Promise<void>;

function validateScope(scope: RecoveryHeartbeatScope): void {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(scope.workspaceId) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(scope.workerKey)) {
    throw new DomainError('VALIDATION', 'A bounded workspace/worker scope is required.');
  }
  if (!(scope.expectedAt instanceof Date) || !Number.isFinite(scope.expectedAt.getTime())) {
    throw new DomainError('VALIDATION', 'An explicit valid expected start is required.');
  }
}

function scopeWhere(table: typeof heartbeats | typeof incidents, scope: RecoveryHeartbeatScope) {
  return and(eq(table.workspaceId, scope.workspaceId), eq(table.workerKey, scope.workerKey));
}

async function databaseTime(tx: TransactionDatabase): Promise<Date> {
  const result = await tx.execute<{now: string | Date}>(sql`select date_trunc('milliseconds', clock_timestamp()) as now`);
  return new Date(result.rows[0]!.now);
}

async function lockHeartbeat(tx: TransactionDatabase, scope: RecoveryHeartbeatScope) {
  // Restart cannot postpone registration; a caller clock ahead of DB time cannot blind monitoring.
  const registeredAt = await databaseTime(tx);
  const expectedAt = new Date(Math.min(scope.expectedAt.getTime(), registeredAt.getTime()));
  await tx.insert(heartbeats).values({workspaceId: scope.workspaceId, workerKey: scope.workerKey, expectedAt}).onConflictDoNothing();
  const [row] = await tx.select().from(heartbeats).where(scopeWhere(heartbeats, scope)).for('update');
  const now = await databaseTime(tx);
  if (row!.expectedAt > now) {
    await tx.update(heartbeats).set({expectedAt: now}).where(scopeWhere(heartbeats, scope));
    return {...row!, expectedAt: now};
  }
  return row!;
}

function freshnessBaseline(lastSuccessAt: Date | null, expectedAt: Date): number {
  return Math.max(lastSuccessAt?.getTime() ?? -Infinity, expectedAt.getTime());
}

export function isRecoveryHeartbeatStale(lastSuccessAt: Date | null, expectedAt: Date, now: Date): boolean {
  return now.getTime() - freshnessBaseline(lastSuccessAt, expectedAt) > RECOVERY_HEARTBEAT_STALE_MS;
}

/** Capture this server timestamp BEFORE the sweep; write it only after that sweep succeeds. */
export async function beginRecoverySweep(db: AppDatabase, scope: RecoveryHeartbeatScope): Promise<Date> {
  validateScope(scope);
  return db.transaction(async (tx) => {
    await lockHeartbeat(tx, scope);
    return databaseTime(tx);
  });
}

/** Freshness describes the successful sweep's start, never a delayed completion's wall clock. */
export async function writeRecoveryHeartbeat(db: AppDatabase, input: RecoveryHeartbeatScope & Readonly<{sweepStartedAt: Date}>): Promise<boolean> {
  validateScope(input);
  if (!(input.sweepStartedAt instanceof Date) || !Number.isFinite(input.sweepStartedAt.getTime())) {
    throw new DomainError('VALIDATION', 'A database sweep start timestamp is required.');
  }
  return db.transaction(async (tx) => {
    const row = await lockHeartbeat(tx, input);
    const now = await databaseTime(tx);
    if (input.sweepStartedAt > now) throw new DomainError('VALIDATION', 'Sweep start cannot be in the future.');
    if (row.lastSuccessAt && input.sweepStartedAt <= row.lastSuccessAt) return false;
    await tx.update(heartbeats).set({lastSuccessAt: input.sweepStartedAt}).where(scopeWhere(heartbeats, input));
    // A sweep already underway at detection cannot erase that alert, even if apparently fresh.
    if (!isRecoveryHeartbeatStale(input.sweepStartedAt, row.expectedAt, now)) {
      // Recovery is independent of external acknowledgement; retain pending evidence and its lease.
      await tx.update(incidents).set({recoveredAt: now}).where(and(
        scopeWhere(incidents, input), isNull(incidents.recoveredAt), gt(sql`${input.sweepStartedAt.toISOString()}::timestamptz`, incidents.openedAt),
      ));
    }
    return true;
  });
}

/** Workspace/instance row locks serialize writers and independent monitor processes. No global scan. */
export function createRecoveryHeartbeatRepository(db: AppDatabase): RecoveryHeartbeatPort {
  return {
    async claim(scope) {
      validateScope(scope);
      return db.transaction(async (tx): Promise<RecoveryHeartbeatClaim | Observation> => {
        const heartbeat = await lockHeartbeat(tx, scope);
        const now = await databaseTime(tx); // After the lock, not the transaction's potentially old start time.
        let [current] = await tx.select().from(incidents).where(and(scopeWhere(incidents, scope), isNull(incidents.recoveredAt)));
        if (!current && isRecoveryHeartbeatStale(heartbeat.lastSuccessAt, heartbeat.expectedAt, now)) {
          [current] = await tx.insert(incidents).values({
            id: randomUUID(), workspaceId: scope.workspaceId, workerKey: scope.workerKey, openedAt: now,
            expectedAt: heartbeat.expectedAt, lastSweepAt: heartbeat.lastSuccessAt,
            // Saturate at the recipient's one-year bound; older outages must remain deliverable.
            ageSeconds: Math.min(31_536_000, Math.floor((now.getTime() - freshnessBaseline(heartbeat.lastSuccessAt, heartbeat.expectedAt)) / 1000)),
            nextAttemptAt: now,
          }).returning();
        }
        // Record new outages independently, but deliver retained evidence in oldest-first order.
        const [incident] = await tx.select().from(incidents).where(and(scopeWhere(incidents, scope), isNull(incidents.deliveredAt)))
          .orderBy(asc(incidents.openedAt), asc(incidents.id)).limit(1);
        if (!incident) return {status: current ? 'already_delivered' : 'healthy'};
        if (incident!.nextAttemptAt > now || (incident!.leaseUntil && incident!.leaseUntil > now)) return {status: 'waiting'};
        const token = randomUUID();
        await tx.update(incidents).set({leaseToken: token, leaseUntil: new Date(now.getTime() + RECOVERY_ALERT_LEASE_MS), attempts: incident!.attempts + 1})
          .where(eq(incidents.id, incident!.id));
        return {status: 'claimed', incidentId: incident!.id, token, payload: {
          incidentId: incident!.id, workspaceId: scope.workspaceId, workerKey: scope.workerKey,
          expectedAt: incident!.expectedAt.toISOString(), observedAt: incident!.openedAt.toISOString(),
          lastSweepAt: incident!.lastSweepAt?.toISOString() ?? null, ageSeconds: incident!.ageSeconds,
          code: 'sweep_heartbeat_missing', action: RECOVERY_HEARTBEAT_ACTION,
        }};
      });
    },
    async complete(scope, claim, delivered) {
      validateScope(scope);
      return db.transaction(async (tx) => {
        await lockHeartbeat(tx, scope);
        const now = await databaseTime(tx);
        const updated = await tx.update(incidents).set({
          deliveredAt: delivered ? now : null, leaseToken: null, leaseUntil: null,
          nextAttemptAt: new Date(now.getTime() + RECOVERY_ALERT_RETRY_MS),
        }).where(and(scopeWhere(incidents, scope), eq(incidents.id, claim.incidentId), eq(incidents.leaseToken, claim.token),
          gt(incidents.leaseUntil, now), isNull(incidents.deliveredAt))).returning({id: incidents.id});
        return updated.length === 1;
      });
    },
  };
}

/** Transport runs outside the claim transaction; crashes retry the same payload/key after lease expiry. */
export async function monitorRecoveryHeartbeatOnce(port: RecoveryHeartbeatPort, scope: RecoveryHeartbeatScope, deliver: RecoveryHeartbeatDelivery) {
  validateScope(scope);
  const claim = await port.claim(scope);
  if (claim.status !== 'claimed') return claim;
  let delivered = false;
  try { await deliver(claim.payload, {idempotencyKey: `recovery-heartbeat:${claim.incidentId}`}); delivered = true; }
  catch { /* Only a bounded retry result crosses the boundary; transport errors may contain credentials. */ }
  const accepted = await port.complete(scope, claim, delivered);
  return {status: accepted ? delivered ? 'delivered' as const : 'retry' as const : 'superseded' as const, incidentId: claim.incidentId};
}

export async function runRecoveryHeartbeatMonitorOnce(db: AppDatabase, input: RecoveryHeartbeatScope & Readonly<{deliver: RecoveryHeartbeatDelivery}>) {
  return monitorRecoveryHeartbeatOnce(createRecoveryHeartbeatRepository(db), input, input.deliver);
}
