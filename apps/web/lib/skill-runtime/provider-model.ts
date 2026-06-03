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

export function providerErrorText(error: unknown): string {
  if (error instanceof Error) return String(error.message || error).trim();
  return String(error || "").trim();
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
    const rawResponse = await client.chat.completions.create(
      {
        model: params.config.modelName,
        messages: baseMessagesToOpenAiCompatibleMessages(params.messages),
        temperature: params.temperature ?? 0.2,
        max_tokens: Math.max(256, Number(params.maxTokens) || 8192),
      } as any,
      { signal: controller.signal },
    );
    return buildAiMessageFromOpenAiCompatibleResponse(rawResponse, params.config.modelName);
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

export function resolveProviderAttempts(preferred?: { provider?: string; model?: string }): ProviderAttempt[] {
  const attempts = resolveRunProviderRunnerLocks(preferred)
    .map((lock) => ({ lock, config: resolveProviderConfig(lock) }))
    .filter((attempt) => !!attempt.config.apiKey);
  if (attempts.length > 0) return attempts;
  const fallbackLock = resolveRunProviderRunnerLock(preferred);
  return [{ lock: fallbackLock, config: resolveProviderConfig(fallbackLock) }];
}
