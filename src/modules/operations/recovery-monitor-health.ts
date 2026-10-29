export type RecoveryMonitorHealth = Readonly<{lastSuccessAt: Date | null; errors: number; deliveryPending: boolean}>;
export function observeRecoveryMonitorHealth(state: RecoveryMonitorHealth, status: string, now: Date): RecoveryMonitorHealth {
  return {lastSuccessAt: now, errors: state.errors + (status === 'retry' ? 1 : 0), deliveryPending: !['healthy', 'delivered', 'already_delivered'].includes(status)};
}
export function recoveryMonitorReady(state: RecoveryMonitorHealth, now = new Date()): boolean {
  const age = state.lastSuccessAt ? now.getTime() - state.lastSuccessAt.getTime() : Infinity;
  return !state.deliveryPending && age >= 0 && age < 120_000;
}
