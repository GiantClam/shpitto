import type {AppDatabase} from '../db/client.ts';
import {sweepExpiredGenerationTasks, type SweepResult} from '../modules/generation/sweep-recovery.ts';

export const LOCAL_RECOVERY_INTERVAL_MS = 10_000;
export const PRODUCTION_RECOVERY_INTERVAL_MS = 60_000;

export async function runRecoverySweep(db: AppDatabase, now = new Date()): Promise<SweepResult> {
  return sweepExpiredGenerationTasks(db, now);
}

export function startRecoverySchedule(input: Readonly<{
  db: AppDatabase;
  intervalMs?: number;
  now?: () => Date;
  onResult?: (result: SweepResult) => void;
  onError?: (error: unknown) => void;
}>): () => Promise<void> {
  const now = input.now ?? (() => new Date());
  const onResult = input.onResult ?? (() => undefined);
  const onError = input.onError ?? (() => undefined);
  let stopped = false;
  let pending: Promise<void> = Promise.resolve();
  const tick = (): void => {
    if (stopped) return;
    pending = pending.then(() => runRecoverySweep(input.db, now()).then(onResult).catch(onError));
  };
  const timer = setInterval(tick, input.intervalMs ?? PRODUCTION_RECOVERY_INTERVAL_MS);
  timer.unref?.();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
