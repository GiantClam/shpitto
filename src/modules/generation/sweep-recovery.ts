import {and, eq, lte, notInArray} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {generationTasks} from '../../db/schema/generation.ts';
import {type WorkspaceActor} from '../workspaces/policy.ts';
import {settleGenerationTask} from './lifecycle.ts';

export type SweepResult = Readonly<{
  scanned: number;
  failed: number;
}>;

export type RecoveryDrainResult = SweepResult & Readonly<{batches: number; drained: boolean}>;

/** A partial/nonprogressing sweep must never authorize resumed provider work. */
export async function drainRecoveryBatches(sweep: () => Promise<SweepResult>, maxBatches = 10): Promise<RecoveryDrainResult> {
  if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100) throw new Error('Recovery batch budget must be between 1 and 100.');
  let scanned = 0;
  let failed = 0;
  for (let batches = 1; batches <= maxBatches; batches++) {
    const result = await sweep();
    scanned += result.scanned;
    failed += result.failed;
    if (result.scanned === 0) return {scanned, failed, batches, drained: true};
    if (result.failed === 0) return {scanned, failed, batches, drained: false};
  }
  return {scanned, failed, batches: maxBatches, drained: false};
}

export function drainOverdueGenerationTasks(db: AppDatabase, now = new Date(), options: Readonly<{workspaceId?: string}> = {}): Promise<RecoveryDrainResult> {
  return drainRecoveryBatches(() => sweepExpiredGenerationTasks(db, now, options));
}

/** Reconcile overdue tasks from the indexed task deadlines, independent of outbox health. */
export async function sweepExpiredGenerationTasks(db: AppDatabase, now = new Date(), options: Readonly<{workspaceId?: string}> = {}): Promise<SweepResult> {
  const due = await db.select({id: generationTasks.id, workspaceId: generationTasks.workspaceId, requestedBy: generationTasks.requestedBy})
    .from(generationTasks)
    .where(and(notInArray(generationTasks.status, ['succeeded', 'failed', 'cancelled']), lte(generationTasks.deadlineAt, now), options.workspaceId ? eq(generationTasks.workspaceId, options.workspaceId) : undefined))
    .orderBy(generationTasks.deadlineAt)
    .limit(100);
  let failed = 0;
  for (const task of due) {
    const actor: WorkspaceActor = {userId: task.requestedBy};
    const result = await settleGenerationTask(db, {
      actor,
      workspaceId: task.workspaceId,
      taskId: task.id,
      idempotencyKey: `generation.deadline.${task.id}`,
      outcome: 'failed',
      failureCode: 'generation.deadline_exceeded',
      providerCostEvidence: {state: 'unknown'},
      internalWorker: true,
      now,
    }).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === 'CONFLICT') return null;
      throw error;
    });
    if (result?.value.status === 'failed') failed += 1;
  }
  return {scanned: due.length, failed};
}
