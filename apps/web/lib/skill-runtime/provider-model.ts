import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";

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

function collectProviderErrorTextParts(error: unknown, seen = new Set<unknown>()): string[] {
  if (!error || seen.has(error)) return [];
  seen.add(error);
  if (typeof error === "string") return [error];
  if (typeof error !== "object") return [String(error)];

  const raw = error as Record<string, unknown>;
  const parts = [
    raw.name,
    raw.code,
    raw.status,
    raw.statusCode,
    raw.type,
    raw.message,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return [
    ...parts,
    ...collectProviderErrorTextParts(raw.cause, seen),
    ...collectProviderErrorTextParts(raw.error, seen),
    ...collectProviderErrorTextParts(raw.details, seen),
  ];
}
export type ProviderRetryPolicy = {
  retries: number;
  baseMs: number;
  maxMs: number;
  jitterMs: number;
};

export function providerErrorText(error: unknown): string {
  const parts = collectProviderErrorTextParts(error);
  return parts.length > 0 ? parts.join(" | ") : String(error || "").trim();
}

function clipProviderDebugText(value: unknown, maxLength = 500): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function summarizeProviderEnvelope(value: unknown, maxLength = 500): string {
  if (value == null) return "";
  if (typeof value === "string") return clipProviderDebugText(value, maxLength);
  if (typeof value !== "object") return clipProviderDebugText(value, maxLength);
  const raw = value as Record<string, unknown>;
  const summary = {
    keys: Object.keys(raw).slice(0, 12),
    id: raw.id,
    object: raw.object,
    model: raw.model,
    choices: Array.isArray(raw.choices) ? raw.choices.length : undefined,
    error: raw.error,
    status: raw.status,
    statusCode: raw.statusCode,
    type: raw.type,
    message: raw.message,
  };
  try {
    return clipProviderDebugText(JSON.stringify(summary), maxLength);
  } catch {
    return clipProviderDebugText(Object.prototype.toString.call(value), maxLength);
  }
}

function buildProviderOperationError(params: {
  label: string;
  config: Pick<ProviderConfig, "provider" | "modelName">;
  phase: string;
  error: unknown;
  response?: unknown;
}): Error {
  const rawError = (params.error && typeof params.error === "object") ? (params.error as Record<string, unknown>) : undefined;
  const status = rawError?.status ?? rawError?.statusCode ?? rawError?.responseStatus;
  const requestId = rawError?.request_id ?? rawError?.requestId ?? rawError?.["x-request-id"];
  const code = rawError?.code ?? (rawError?.error && typeof rawError.error === "object" ? (rawError.error as any).code : undefined);
  const type = rawError?.type ?? (rawError?.error && typeof rawError.error === "object" ? (rawError.error as any).type : undefined);
  const responseSummary = summarizeProviderEnvelope(params.response);
  const upstreamSummary = summarizeProviderEnvelope(rawError?.error ?? rawError?.response ?? rawError?.body ?? rawError?.data);
  const message = [
    `${params.label}: provider=${params.config.provider} model=${params.config.modelName} phase=${params.phase}`,
    status ? `status=${status}` : "",
    requestId ? `request_id=${requestId}` : "",
    code ? `code=${code}` : "",
    type ? `type=${type}` : "",
    `detail=${clipProviderDebugText(providerErrorText(params.error), 700) || "unknown error"}`,
    upstreamSummary ? `upstream=${upstreamSummary}` : "",
    responseSummary ? `response=${responseSummary}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  const wrapped = new Error(message);
  try {
    (wrapped as any).cause = params.error;
  } catch {}
  return wrapped;
}

export function buildProviderOperationErrorForTesting(params: {
  label: string;
  config: Pick<ProviderConfig, "provider" | "modelName">;
  phase: string;
  error: unknown;
  response?: unknown;
}): string {
  return buildProviderOperationError(params as {
    label: string;
    config: ProviderConfig;
    phase: string;
    error: unknown;
    response?: unknown;
  }).message;
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

function readOpenAiCompatibleText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object" && typeof (value as any).content === "string") {
    return String((value as any).content);
  }
  return "";
}

function stringifyToolArgs(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return "{}";
    }
  }
  return "{}";
}

function baseMessagesToOpenAiCompatibleMessages(messages: BaseMessage[]): any[] {
  const output: any[] = [];
  for (const msg of messages || []) {
    if (msg instanceof SystemMessage) {
      output.push({ role: "system", content: readOpenAiCompatibleText((msg as any)?.content) || "" });
      continue;
    }
    if (msg instanceof HumanMessage) {
      output.push({ role: "user", content: readOpenAiCompatibleText((msg as any)?.content) || "" });
      continue;
    }
    if (msg instanceof ToolMessage) {
      output.push({
        role: "tool",
        content: readOpenAiCompatibleText((msg as any)?.content) || "",
        tool_call_id: String((msg as any)?.tool_call_id || ""),
      });
      continue;
    }
    const toolCalls = Array.isArray((msg as any)?.tool_calls) ? (msg as any).tool_calls : [];
    if (toolCalls.length > 0) {
      output.push({
        role: "assistant",
        content: readOpenAiCompatibleText((msg as any)?.content) || null,
        tool_calls: toolCalls.map((call: any) => ({
          id: String(call?.id || ""),
          type: "function",
          function: {
            name: String(call?.function?.name || call?.name || "").trim(),
            arguments: stringifyToolArgs(call?.function?.arguments ?? call?.args ?? {}),
          },
        })),
      });
      continue;
    }
    output.push({ role: "assistant", content: readOpenAiCompatibleText((msg as any)?.content) || "" });
  }
  return output;
}

function buildAiMessageFromOpenAiCompatibleResponse(rawResponse: unknown, fallbackModelName: string): AIMessage {
  const response =
    typeof rawResponse === "string"
      ? JSON.parse(rawResponse)
      : rawResponse;
  const choice = (response as any)?.choices?.[0]?.message as any;
  if (!choice) {
    throw new Error(`provider_openai_compat_invalid_response: missing choices[0].message for model=${fallbackModelName}`);
  }
  const toolCalls = Array.isArray(choice?.tool_calls) ? choice.tool_calls : [];
  return new AIMessage({
    content: readOpenAiCompatibleText(choice?.content),
    additional_kwargs: toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
    response_metadata: {
      model_name: String((response as any)?.model || fallbackModelName),
      finish_reason: String((response as any)?.choices?.[0]?.finish_reason || ""),
    },
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  } as any);
}

export function buildAiMessageFromOpenAiCompatibleResponseForTesting(
  rawResponse: unknown,
  fallbackModelName: string,
): AIMessage {
  return buildAiMessageFromOpenAiCompatibleResponse(rawResponse, fallbackModelName);
}

export async function invokeOpenAiCompatibleTextModel(params: {
  config: ProviderConfig;
  messages: BaseMessage[];
  timeoutMs: number;
  maxTokens: number;
  temperature?: number;
}): Promise<AIMessage> {
  const client = new OpenAI({
    apiKey: params.config.apiKey,
    baseURL: params.config.baseURL,
    defaultHeaders: params.config.defaultHeaders,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, Math.max(10_000, Number(params.timeoutMs) || 60_000));
  try {
    let rawResponse: unknown;
    try {
      rawResponse = await client.chat.completions.create(
        {
          model: params.config.modelName,
          messages: baseMessagesToOpenAiCompatibleMessages(params.messages),
          temperature: params.temperature ?? 0.2,
          max_tokens: Math.max(256, Number(params.maxTokens) || 8192),
        } as any,
        { signal: controller.signal },
      );
    } catch (error) {
      const wrapped = buildProviderOperationError({
        label: "provider_openai_compat_request_failed",
        config: params.config,
        phase: "text_model.request",
        error,
      });
      console.error(`[provider-model] ${wrapped.message}`);
      throw wrapped;
    }

    try {
      return buildAiMessageFromOpenAiCompatibleResponse(rawResponse, params.config.modelName);
    } catch (error) {
      const wrapped = buildProviderOperationError({
        label: "provider_openai_compat_invalid_response",
        config: params.config,
        phase: "text_model.response",
        error,
        response: rawResponse,
      });
      console.error(`[provider-model] ${wrapped.message}`);
      throw wrapped;
    }
  } finally {
    clearTimeout(timer);
  }
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
