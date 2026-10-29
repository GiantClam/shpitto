export type IntegrationHealthInput = Readonly<{
  provider: 'replicate' | 'fal';
  lastSuccessfulAt?: Date | null;
  lastFailureAt?: Date | null;
  unknownOldestAt?: Date | null;
  now?: Date;
}>;

export type IntegrationHealth = Readonly<{
  provider: IntegrationHealthInput['provider'];
  status: 'healthy' | 'degraded' | 'unavailable';
  reason: 'ok' | 'unknown_age' | 'recent_failures' | 'no_success_evidence';
  unknownAgeSeconds: number | null;
}>;

export function evaluateIntegrationHealth(input: IntegrationHealthInput): IntegrationHealth {
  const now = input.now ?? new Date();
  const unknownAgeSeconds = input.unknownOldestAt ? Math.max(0, Math.floor((now.getTime() - input.unknownOldestAt.getTime()) / 1000)) : null;
  if (!input.lastSuccessfulAt) return {provider: input.provider, status: 'unavailable', reason: 'no_success_evidence', unknownAgeSeconds};
  if (unknownAgeSeconds !== null && unknownAgeSeconds >= 1_800) return {provider: input.provider, status: 'degraded', reason: 'unknown_age', unknownAgeSeconds};
  if (input.lastFailureAt && input.lastFailureAt > input.lastSuccessfulAt) return {provider: input.provider, status: 'degraded', reason: 'recent_failures', unknownAgeSeconds};
  return {provider: input.provider, status: 'healthy', reason: 'ok', unknownAgeSeconds};
}

export function aggregateIntegrationHealth(entries: readonly IntegrationHealth[]): Readonly<{status: 'healthy' | 'degraded' | 'unavailable'; providers: readonly IntegrationHealth[]}> {
  const status = entries.some((entry) => entry.status === 'unavailable') ? 'unavailable' : entries.some((entry) => entry.status === 'degraded') ? 'degraded' : 'healthy';
  return Object.freeze({status, providers: Object.freeze([...entries])});
}
