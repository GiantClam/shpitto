import { ChatOpenAI } from "@langchain/openai";

import { resolveRunProviderRunnerLock, resolveRunProviderRunnerLocks, type RunProviderLock } from "./provider-runner.ts";
import { DEFAULT_OPENAI_COMPAT_MODEL, normalizeProviderModelId } from "./provider-model-id.ts";

export type LlmProvider = "pptoken" | "aiberm" | "crazyroute";

export type ProviderConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  modelName: string;
};

export type ProviderAttempt = {
  lock: RunProviderLock;
  config: ProviderConfig;
};

export type ProviderRetryPolicy = {
  retries: number;
  baseMs: number;
  maxMs: number;
  jitterMs: number;
};

export function providerErrorText(error: unknown): string {
  if (error instanceof Error) return String(error.message || error).trim();
  return String(error || "").trim();
}

export function describeProviderConfig(config: Pick<ProviderConfig, "provider" | "modelName" | "baseURL">): string {
  const provider = String(config.provider || "").trim() || "unknown-provider";
  const model = String(config.modelName || "").trim() || "unknown-model";
  const endpoint = String(config.baseURL || "").trim();
  if (!endpoint) return `${provider}/${model}`;
  try {
    const url = new URL(endpoint);
    const basePath = `${url.origin}${url.pathname}`.replace(/\/+$/g, "");
    return `${provider}/${model} @ ${basePath || url.origin}`;
  } catch {
    return `${provider}/${model} @ ${endpoint}`;
  }
}

export function resolveProviderRetryPolicy(scope: "skill-native" | "route-unit" = "skill-native"): ProviderRetryPolicy {
  const prefix = scope === "route-unit" ? "ROUTE_UNIT" : "SKILL_NATIVE";
  const retries = Math.max(
    0,
    Number(process.env[`${prefix}_PROVIDER_RETRIES`] || process.env.SKILL_TOOL_PROVIDER_RETRIES || 2),
  );
  const baseMs = Math.max(
    200,
    Number(process.env[`${prefix}_PROVIDER_RETRY_BASE_MS`] || process.env.SKILL_TOOL_PROVIDER_RETRY_BASE_MS || 1200),
  );
  const maxMs = Math.max(
    baseMs,
    Number(process.env[`${prefix}_PROVIDER_RETRY_MAX_MS`] || process.env.SKILL_TOOL_PROVIDER_RETRY_MAX_MS || 10000),
  );
  const jitterMs = Math.max(
    0,
    Number(process.env[`${prefix}_PROVIDER_RETRY_JITTER_MS`] || process.env.SKILL_TOOL_PROVIDER_RETRY_JITTER_MS || 350),
  );
  return { retries, baseMs, maxMs, jitterMs };
}

export function providerRetryBackoffMs(policy: ProviderRetryPolicy, attempt: number): number {
  const exp = policy.baseMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = policy.jitterMs > 0 ? Math.floor(Math.random() * (policy.jitterMs + 1)) : 0;
  return Math.min(policy.maxMs, exp + jitter);
}

export function isRetryableProviderError(error: unknown): boolean {
  const text = providerErrorText(error).toLowerCase();
  if (!text) return false;
  if (/(401|403|forbidden|unauthorized|invalid api key|authentication failed)/i.test(text)) return false;
  if (/(404|model not found|unsupported model|not supported|bad request|invalid_request_error)/i.test(text)) return false;
  if (
    /cannot read properties of undefined \(reading ['"]message['"]\)|cannot read property ['"]message['"] of undefined/i.test(
      text,
    )
  ) {
    // Some provider-compatible gateways occasionally return malformed error envelopes.
    // The OpenAI/LangChain stack then throws a local TypeError instead of a structured upstream error.
    // Treat that shape as retryable so the route-unit worker can fail over to the next provider.
    return true;
  }
  return /(timeout|timed out|bodytimeouterror|body timeout|und_err_body_timeout|terminated|429|rate limit|503|502|504|service unavailable|connection error|network|socket hang up|econnreset|econnaborted|etimedout|eai_again|enotfound|fetch failed|temporarily unavailable|overloaded|upstream)/i.test(
    text,
  );
}

export function createModelForProvider(
  config: ProviderConfig,
  timeoutMs: number,
  maxTokens: number,
  temperature = 0.2,
): ChatOpenAI {
  const model = new ChatOpenAI({
    modelName: config.modelName,
    openAIApiKey: config.apiKey,
    configuration: {
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
    },
    timeout: timeoutMs,
    maxRetries: Number(process.env.LLM_MAX_RETRIES || 0),
    temperature,
    ...(Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? { maxTokens: Number(maxTokens) } : {}),
  });
  if (config.provider === "aiberm") {
    (model as any).topP = undefined;
  }
  return model;
}

export function resolveProviderConfig(lock: RunProviderLock): ProviderConfig {
  if (lock.provider === "pptoken") {
    return {
      provider: "pptoken",
      apiKey: process.env.PPTOKEN_API_KEY,
      baseURL: process.env.PPTOKEN_BASE_URL || "https://cn.pptoken.cc/v1",
      defaultHeaders: {},
      modelName: normalizeProviderModelId("pptoken", String(
        lock.model || process.env.LLM_MODEL_PPTOKEN || process.env.PPTOKEN_MODEL || process.env.LLM_MODEL || "gpt-5.4-mini",
      ), DEFAULT_OPENAI_COMPAT_MODEL),
    };
  }
  if (lock.provider === "aiberm") {
    return {
      provider: "aiberm",
      apiKey: process.env.AIBERM_API_KEY,
      baseURL: process.env.AIBERM_BASE_URL || "https://aiberm.com/v1",
      defaultHeaders: {},
      modelName: normalizeProviderModelId("aiberm", String(
        lock.model || process.env.LLM_MODEL_AIBERM || process.env.AIBERM_MODEL || process.env.LLM_MODEL || "gpt-5.4-mini",
      ), DEFAULT_OPENAI_COMPAT_MODEL),
    };
  }
  return {
    provider: "crazyroute",
    apiKey: process.env.CRAZYROUTE_API_KEY || process.env.CRAZYROUTER_API_KEY || process.env.CRAZYREOUTE_API_KEY,
    baseURL:
      process.env.CRAZYROUTE_BASE_URL ||
      process.env.CRAZYROUTER_BASE_URL ||
      process.env.CRAZYREOUTE_BASE_URL ||
      "https://crazyrouter.com/v1",
    defaultHeaders: {},
    modelName: normalizeProviderModelId("crazyroute", String(
      lock.model ||
        process.env.LLM_MODEL_CRAZYROUTE ||
        process.env.LLM_MODEL_CRAZYROUTER ||
        process.env.LLM_MODEL_CRAZYREOUTE ||
        process.env.LLM_MODEL ||
        "gpt-5.4-mini",
    ), DEFAULT_OPENAI_COMPAT_MODEL),
  };
}

function normalizePreferredProvider(value: string | undefined): LlmProvider | undefined {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return undefined;
  if (token === "pptoken") return "pptoken";
  if (token === "aiberm") return "aiberm";
  if (token === "crazyroute" || token === "crazyrouter" || token === "crazyreoute") return "crazyroute";
  return undefined;
}

function reorderProviderLocksByPreference(
  locks: RunProviderLock[],
  preferredProvider: LlmProvider | undefined,
): RunProviderLock[] {
  if (!preferredProvider || locks.length <= 1) return locks;
  const preferredIndex = locks.findIndex((lock) => lock.provider === preferredProvider);
  if (preferredIndex <= 0) return locks;
  return [locks[preferredIndex], ...locks.slice(0, preferredIndex), ...locks.slice(preferredIndex + 1)];
}

export function resolveProviderAttempts(preferred?: { provider?: string; model?: string }): ProviderAttempt[] {
  const orderedLocks = reorderProviderLocksByPreference(
    resolveRunProviderRunnerLocks({
      model: preferred?.model,
    }),
    normalizePreferredProvider(preferred?.provider),
  );
  const attempts = orderedLocks
    .map((lock) => ({ lock, config: resolveProviderConfig(lock) }))
    .filter((attempt) => !!attempt.config.apiKey);
  if (attempts.length > 0) return attempts;
  const fallbackLock = orderedLocks[0] || resolveRunProviderRunnerLock(preferred);
  return [{ lock: fallbackLock, config: resolveProviderConfig(fallbackLock) }];
}
