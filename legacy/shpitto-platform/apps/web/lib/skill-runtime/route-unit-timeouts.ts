import {
  resolveProviderRetryPolicy,
} from "./provider-model.ts";

function clampTimeout(taskTimeoutMs: number, candidateMs: number, minMs: number) {
  const safeCandidate = Number.isFinite(candidateMs) && candidateMs > 0 ? Math.max(minMs, candidateMs) : minMs;
  const safeTask = Number.isFinite(taskTimeoutMs) && taskTimeoutMs > 0 ? Math.max(minMs, taskTimeoutMs) : safeCandidate;
  return Math.min(safeCandidate, safeTask);
}

function resolveExecutionBudgetFromTargetFiles(targetFileCount: number) {
  const fileCount = Math.max(1, Number(targetFileCount || 0));
  const baseMs = Math.max(1_000, Number(process.env.ROUTE_UNIT_EXECUTION_TIMEOUT_BASE_MS || 60_000));
  const perFileMs = Math.max(0, Number(process.env.ROUTE_UNIT_EXECUTION_TIMEOUT_PER_FILE_MS || 30_000));
  const maxMs = Math.max(baseMs, Number(process.env.ROUTE_UNIT_EXECUTION_TIMEOUT_MAX_MS || 240_000));
  const candidateMs = Math.min(maxMs, baseMs + Math.max(0, fileCount - 1) * perFileMs);
  return { baseMs, maxMs, candidateMs };
}

function resolveProviderRetryBackoffCeilingMs(attempt: number) {
  const retryPolicy = resolveProviderRetryPolicy("route-unit");
  const exp = retryPolicy.baseMs * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(retryPolicy.maxMs, exp + retryPolicy.jitterMs);
}

export function resolveRouteUnitProviderTimeoutMs(params: {
  taskTimeoutMs: number;
  targetFileCount: number;
}) {
  const fileCount = Math.max(1, Number(params.targetFileCount || 0));
  const baseMs = Math.max(1_000, Number(process.env.ROUTE_UNIT_PROVIDER_TIMEOUT_BASE_MS || 30_000));
  const perFileMs = Math.max(0, Number(process.env.ROUTE_UNIT_PROVIDER_TIMEOUT_PER_FILE_MS || 20_000));
  const maxMs = Math.max(baseMs, Number(process.env.ROUTE_UNIT_PROVIDER_TIMEOUT_MAX_MS || 120_000));
  const candidateMs = Math.min(maxMs, baseMs + Math.max(0, fileCount - 1) * perFileMs);
  return clampTimeout(params.taskTimeoutMs, candidateMs, 1_000);
}

export function resolveRouteUnitExecutionTimeoutMs(params: {
  taskTimeoutMs: number;
  targetFileCount: number;
}) {
  const executionBudget = resolveExecutionBudgetFromTargetFiles(params.targetFileCount);
  const providerTimeoutMs = resolveRouteUnitProviderTimeoutMs(params);
  const retryPolicy = resolveProviderRetryPolicy("route-unit");
  const providerAttemptBudget = providerTimeoutMs * Math.max(1, retryPolicy.retries + 1);
  let retryBackoffBudget = 0;
  for (let retryAttempt = 1; retryAttempt <= retryPolicy.retries; retryAttempt += 1) {
    retryBackoffBudget += resolveProviderRetryBackoffCeilingMs(retryAttempt);
  }
  const verificationGraceMs = Math.max(1_000, Number(process.env.ROUTE_UNIT_EXECUTION_TIMEOUT_GRACE_MS || 15_000));
  const sameProviderRetryFloorMs = providerAttemptBudget + retryBackoffBudget + verificationGraceMs;
  const candidateMs = Math.max(executionBudget.candidateMs, Math.min(executionBudget.maxMs, sameProviderRetryFloorMs));
  return clampTimeout(params.taskTimeoutMs, candidateMs, 1_000);
}
