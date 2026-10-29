import {and, eq, gte, sql} from 'drizzle-orm';
import {createHash} from 'node:crypto';
import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {operatorRecoveryNotes} from '../../db/schema/operations.ts';
import {workspaces} from '../../db/schema/workspace.ts';
import {validateRecoveryAlert, type RecoveryAlert} from './recovery-alert-delivery.ts';

/** Retain externally delivered evidence in the existing durable operator recovery-note store. */
export async function receiveRecoveryAlert(db: AppDatabase, value: RecoveryAlert): Promise<Readonly<{incidentId: string; received: true; duplicate: boolean}>> {
  const alert = validateRecoveryAlert(value);
  const digest = createHash('sha256').update(JSON.stringify(alert)).digest('hex');
  const reason = `${alert.code}; age=${alert.ageSeconds}s; observed=${alert.observedAt}; last=${alert.lastSweepAt ?? 'never'}; sha256=${digest}. ${alert.action}`;
  return db.transaction(async (tx) => {
    const workspace = (await tx.select().from(workspaces).where(eq(workspaces.id, alert.workspaceId)).for('update').limit(1))[0];
    if (!workspace) throw new DomainError('NOT_FOUND', 'Assigned alert workspace was not found.');
    const existing = (await tx.select().from(operatorRecoveryNotes).where(eq(operatorRecoveryNotes.id, alert.incidentId)).limit(1))[0];
    if (existing) {
      if (existing.workspaceId !== alert.workspaceId || existing.subjectType !== 'sweep_heartbeat' || existing.subjectId !== alert.workerKey || existing.reason !== reason) throw new DomainError('CONFLICT', 'Recovery alert incident was already received with different evidence.');
      return {incidentId: alert.incidentId, received: true, duplicate: true};
    }
    const rawNow = (await tx.execute<{now: string | Date}>(sql`select clock_timestamp() as now`)).rows[0]!.now;
    const now = new Date(rawNow);
    const recent = await tx.select({id: operatorRecoveryNotes.id}).from(operatorRecoveryNotes).where(and(eq(operatorRecoveryNotes.workspaceId, alert.workspaceId), eq(operatorRecoveryNotes.subjectType, 'sweep_heartbeat'), gte(operatorRecoveryNotes.createdAt, new Date(now.getTime() - 60_000)))).limit(3);
    if (recent.length >= 3) throw new DomainError('CONFLICT', 'Recovery alert recipient rate limit was reached.');
    await tx.insert(operatorRecoveryNotes).values({id: alert.incidentId, workspaceId: alert.workspaceId, actorUserId: workspace.createdBy, subjectType: 'sweep_heartbeat', subjectId: alert.workerKey, reason, createdAt: now, status: 'open'});
    return {incidentId: alert.incidentId, received: true, duplicate: false};
  });
}
