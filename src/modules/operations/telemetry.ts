export type RecoveryTelemetry = Readonly<{
  workspaceId: string;
  taskId: string;
  attemptId: string | null;
  provider: string | null;
  status: string;
  unknownAgeSeconds: number | null;
  outboxLagSeconds: number | null;
  sweepHeartbeatAgeSeconds: number | null;
}>;

/** Only correlation identifiers and bounded classifications are emitted; no prompts, URLs, tokens or bodies. */
export function redactRecoveryTelemetry(input: Readonly<Record<string, unknown>>): RecoveryTelemetry {
  const text = (value: unknown): string | null => typeof value === 'string' && value.length <= 255 ? value : null;
  const seconds = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 31_536_000 ? Math.floor(value) : null;
  const workspaceId = text(input.workspaceId);
  const taskId = text(input.taskId);
  const status = text(input.status);
  if (!workspaceId || !taskId || !status) throw new Error('Recovery telemetry requires bounded correlation identifiers.');
  return Object.freeze({workspaceId, taskId, attemptId: text(input.attemptId), provider: text(input.provider), status, unknownAgeSeconds: seconds(input.unknownAgeSeconds), outboxLagSeconds: seconds(input.outboxLagSeconds), sweepHeartbeatAgeSeconds: seconds(input.sweepHeartbeatAgeSeconds)});
}
