import fs from "node:fs/promises";
import path from "node:path";

import type { ProviderAttempt } from "./provider-model.ts";

export type ProviderHealthStatus = "success" | "retryable_failure" | "fatal_failure";

export type ProviderHealthEntry = {
  provider: string;
  successCount: number;
  retryableFailureCount: number;
  fatalFailureCount: number;
  lastSuccessAt: string | null;
  lastRetryableFailureAt: string | null;
  lastFatalFailureAt: string | null;
};

export type ProviderHealthStore = {
  version: 1;
  updatedAt: string;
  providers: Record<string, ProviderHealthEntry>;
};

function defaultProviderHealthPath() {
  return path.resolve(
    String(process.env.SHPITTO_PROVIDER_HEALTH_PATH || "").trim() || path.resolve(process.cwd(), ".tmp", "provider-health.json"),
  );
}

function createEmptyEntry(provider: string): ProviderHealthEntry {
  return {
    provider,
    successCount: 0,
    retryableFailureCount: 0,
    fatalFailureCount: 0,
    lastSuccessAt: null,
    lastRetryableFailureAt: null,
    lastFatalFailureAt: null,
  };
}

function normalizeStore(value: unknown): ProviderHealthStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      providers: {},
    };
  }
  const record = value as Record<string, unknown>;
  const providersValue =
    record.providers && typeof record.providers === "object" && !Array.isArray(record.providers)
      ? (record.providers as Record<string, unknown>)
      : {};
  const providers: Record<string, ProviderHealthEntry> = {};
  for (const [provider, entryValue] of Object.entries(providersValue)) {
    if (!entryValue || typeof entryValue !== "object" || Array.isArray(entryValue)) continue;
    const entry = entryValue as Record<string, unknown>;
    providers[provider] = {
      provider,
      successCount: Math.max(0, Number(entry.successCount || 0) || 0),
      retryableFailureCount: Math.max(0, Number(entry.retryableFailureCount || 0) || 0),
      fatalFailureCount: Math.max(0, Number(entry.fatalFailureCount || 0) || 0),
      lastSuccessAt: String(entry.lastSuccessAt || "").trim() || null,
      lastRetryableFailureAt: String(entry.lastRetryableFailureAt || "").trim() || null,
      lastFatalFailureAt: String(entry.lastFatalFailureAt || "").trim() || null,
    };
  }
  return {
    version: 1,
    updatedAt: String(record.updatedAt || "").trim() || new Date(0).toISOString(),
    providers,
  };
}

function parseTimestamp(value: string | null) {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function computeProviderHealthScore(
  provider: string,
  entry: ProviderHealthEntry | undefined,
  originalIndex: number,
  reason: string,
) {
  if (!entry) {
    return 0 - originalIndex * 0.01 + (reason === "forced" ? 0.25 : 0);
  }
  const totalFailures = entry.retryableFailureCount + entry.fatalFailureCount;
  const totalAttempts = entry.successCount + totalFailures;
  const successRatio = totalAttempts > 0 ? entry.successCount / totalAttempts : 0;
  const recentSuccessBias = parseTimestamp(entry.lastSuccessAt) > parseTimestamp(entry.lastRetryableFailureAt) ? 0.5 : 0;
  const recentFatalBias = parseTimestamp(entry.lastFatalFailureAt) > parseTimestamp(entry.lastSuccessAt) ? -0.5 : 0;
  const retryPenalty = totalAttempts > 0 ? entry.retryableFailureCount / totalAttempts : 0;
  return (
    successRatio * 4 +
    entry.successCount * 0.1 -
    retryPenalty * 1.5 -
    entry.fatalFailureCount * 0.5 +
    recentSuccessBias +
    recentFatalBias +
    (reason === "forced" ? 0.25 : 0) -
    originalIndex * 0.01
  );
}

export async function readProviderHealthStore(storePath = defaultProviderHealthPath()): Promise<ProviderHealthStore> {
  try {
    const text = await fs.readFile(storePath, "utf8");
    return normalizeStore(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return normalizeStore(null);
    }
    throw error;
  }
}

export async function writeProviderHealthStore(
  store: ProviderHealthStore,
  storePath = defaultProviderHealthPath(),
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}

export async function recordProviderHealthStatus(params: {
  attempt: ProviderAttempt;
  status: ProviderHealthStatus;
  storePath?: string;
}): Promise<void> {
  const store = await readProviderHealthStore(params.storePath);
  const provider = String(params.attempt.config.provider || "").trim();
  const current = store.providers[provider] || createEmptyEntry(provider);
  const now = new Date().toISOString();
  if (params.status === "success") {
    current.successCount += 1;
    current.lastSuccessAt = now;
  } else if (params.status === "retryable_failure") {
    current.retryableFailureCount += 1;
    current.lastRetryableFailureAt = now;
  } else {
    current.fatalFailureCount += 1;
    current.lastFatalFailureAt = now;
  }
  store.providers[provider] = current;
  store.updatedAt = now;
  await writeProviderHealthStore(store, params.storePath);
}

export async function rankProviderAttemptsByHealth(
  attempts: ProviderAttempt[],
  storePath = defaultProviderHealthPath(),
): Promise<ProviderAttempt[]> {
  if (attempts.length <= 1) return attempts;
  const forcedProvider = attempts.find((attempt) => String(attempt.lock.reason || "").trim() === "manual_locked");
  if (forcedProvider) {
    return [forcedProvider];
  }
  const store = await readProviderHealthStore(storePath);
  return attempts
    .map((attempt, index) => ({
      attempt,
      score: computeProviderHealthScore(
        String(attempt.config.provider || "").trim(),
        store.providers[String(attempt.config.provider || "").trim()],
        index,
        String(attempt.lock.reason || "").trim(),
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.attempt);
}
