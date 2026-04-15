import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ProjectSchema } from "@industry/schema";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import crypto from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { updateTaskPlan } from "./persistence";
import {
  archiveSiteArtifactsToR2,
  buildContactActionUrl,
  recordDeployment,
  saveProjectState,
  upsertProjectSiteBinding,
} from "./db";
import { getD1Client } from "../d1";
import { getR2Client } from "../r2";
import { injectOrganizationJsonLd, normalizeComponentType, stitchTracks } from "./engine";
import { loadWorkflowSkillContext, type DesignSkillHit } from "./website-workflow";
import { configureUndiciProxyFromEnv, createHttpsProxyAgentFromEnv, isRegionDeniedError } from "./network";
import { CloudflareClient } from "../cloudflare";
import { Bundler } from "../bundler";

// Load environment variables from .env file at project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple possible paths for .env
const envPaths = [
  path.resolve("D:/private/shpitto_tools/.env"), // external shared env (if present)
  path.resolve(__dirname, "../../../../.env"), // From lib/agent/graph.ts to root
  path.resolve(process.cwd(), "../../.env"),    // From apps/web to root
  path.resolve(process.cwd(), ".env.local"),    // apps/web local env
  path.resolve(process.cwd(), ".env"),          // From root to root
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

configureUndiciProxyFromEnv();

type LlmProvider = "openrouter" | "aiberm" | "crazyroute";

type ProviderConfig = {
  provider: LlmProvider;
  apiKey?: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  modelName: string;
  fallbackModelName: string;
};

export type ProviderTraceHit = {
  operation: string;
  provider: LlmProvider;
  modelName: string;
  at: string;
};

const providerTraceState: { hits: ProviderTraceHit[] } = { hits: [] };

type ProviderFailureKind = "timeout" | "rate_limit" | "auth" | "tos" | "server" | "network" | "unknown";

type ProviderRuntimeState = {
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureAt?: number;
  lastFailureKind?: ProviderFailureKind;
  lastFailureMessage?: string;
  lastSuccessAt?: number;
  cooldownUntil?: number;
};

type ProviderRuntimeSnapshot = {
  lastSuccessfulProvider?: LlmProvider;
  providerStates: Record<LlmProvider, ProviderRuntimeState>;
};

const createInitialRuntimeState = (): ProviderRuntimeState => ({
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  cooldownUntil: 0,
});

const providerRuntimeState: ProviderRuntimeSnapshot = {
  lastSuccessfulProvider: undefined,
  providerStates: {
    aiberm: createInitialRuntimeState(),
    crazyroute: createInitialRuntimeState(),
    openrouter: createInitialRuntimeState(),
  },
};

export const resetProviderTrace = () => {
  providerTraceState.hits = [];
};

export const getProviderTraceSnapshot = (): ProviderTraceHit[] => providerTraceState.hits.map((hit) => ({ ...hit }));

export const getProviderRuntimeSnapshot = (): ProviderRuntimeSnapshot => ({
  lastSuccessfulProvider: providerRuntimeState.lastSuccessfulProvider,
  providerStates: {
    aiberm: { ...providerRuntimeState.providerStates.aiberm },
    crazyroute: { ...providerRuntimeState.providerStates.crazyroute },
    openrouter: { ...providerRuntimeState.providerStates.openrouter },
  },
});

export const resetProviderRuntimeState = () => {
  providerRuntimeState.lastSuccessfulProvider = undefined;
  providerRuntimeState.providerStates = {
    aiberm: createInitialRuntimeState(),
    crazyroute: createInitialRuntimeState(),
    openrouter: createInitialRuntimeState(),
  };
  providerRingCursor = 0;
};

const DEFAULT_PROVIDER_ORDER: LlmProvider[] = ["aiberm", "crazyroute", "openrouter"];
let providerRingCursor = 0;

const normalizeProviderToken = (raw: string): LlmProvider | undefined => {
  const token = String(raw || "").trim().toLowerCase();
  if (!token) return undefined;
  if (token === "aiberm") return "aiberm";
  if (token === "crazyroute" || token === "crazyrouter" || token === "crazyreoute") return "crazyroute";
  if (token === "openrouter") return "openrouter";
  return undefined;
};

const resolveLlmProvider = (): LlmProvider => {
  const requested = normalizeProviderToken(process.env.LLM_PROVIDER || "");
  if (requested) return requested;

  if (process.env.AIBERM_API_KEY) return "aiberm";
  if (process.env.CRAZYROUTE_API_KEY || process.env.CRAZYREOUTE_API_KEY || process.env.CRAZYROUTER_API_KEY) {
    return "crazyroute";
  }
  return "openrouter";
};

const getProviderOrder = (): LlmProvider[] => [...DEFAULT_PROVIDER_ORDER];

const getProviderConfig = (providerOverride?: LlmProvider): ProviderConfig => {
  const provider = providerOverride || resolveLlmProvider();

  if (provider === "aiberm") {
    return {
      provider,
      apiKey: process.env.AIBERM_API_KEY,
      baseURL: process.env.AIBERM_BASE_URL || "https://aiberm.com/v1",
      defaultHeaders: {},
      modelName:
        process.env.LLM_MODEL_AIBERM ||
        process.env.AIBERM_MODEL ||
        process.env.LLM_MODEL ||
        "claude-sonnet-4-5-20250929",
      fallbackModelName:
        process.env.LLM_MODEL_FALLBACK_AIBERM ||
        process.env.AIBERM_MODEL_FALLBACK ||
        process.env.LLM_MODEL_FALLBACK ||
        "claude-opus-4-5-20251101",
    };
  }

  if (provider === "crazyroute") {
    return {
      provider,
      apiKey:
        process.env.CRAZYROUTE_API_KEY ||
        process.env.CRAZYREOUTE_API_KEY ||
        process.env.CRAZYROUTER_API_KEY,
      baseURL:
        process.env.CRAZYROUTE_BASE_URL ||
        process.env.CRAZYREOUTE_BASE_URL ||
        process.env.CRAZYROUTER_BASE_URL ||
        "https://crazyrouter.com/v1",
      defaultHeaders: {},
      modelName:
        process.env.LLM_MODEL_CRAZYROUTE ||
        process.env.LLM_MODEL_CRAZYREOUTE ||
        process.env.LLM_MODEL_CRAZYROUTER ||
        process.env.CRAZYROUTE_MODEL ||
        process.env.CRAZYREOUTE_MODEL ||
        process.env.CRAZYROUTER_MODEL ||
        process.env.LLM_MODEL ||
        "claude-sonnet-4-5-20250929",
      fallbackModelName:
        process.env.LLM_MODEL_FALLBACK_CRAZYROUTE ||
        process.env.LLM_MODEL_FALLBACK_CRAZYREOUTE ||
        process.env.LLM_MODEL_FALLBACK_CRAZYROUTER ||
        process.env.CRAZYROUTE_MODEL_FALLBACK ||
        process.env.CRAZYREOUTE_MODEL_FALLBACK ||
        process.env.CRAZYROUTER_MODEL_FALLBACK ||
        process.env.LLM_MODEL_FALLBACK ||
        "claude-opus-4-5-20251101",
    };
  }

  return {
    provider: "openrouter",
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://shpitto.com",
      "X-Title": "Shpitto",
    },
    modelName: process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5",
    fallbackModelName: process.env.LLM_MODEL_FALLBACK || "anthropic/claude-sonnet-4.5",
  };
};

const bootProviderOrder = getProviderOrder();
const bootProvider = getProviderConfig(bootProviderOrder[0]);
const bootAvailableProviders = bootProviderOrder.filter((provider) => !!getProviderConfig(provider).apiKey);
console.log("LLM Configuration:");
console.log("- Provider Order:", bootProviderOrder.join(" -> "));
console.log("- Active Provider:", bootProvider.provider);
console.log("- Active Model:", bootProvider.modelName);
console.log("- Available Providers:", bootAvailableProviders.join(", ") || "none");
console.log("- Current Working Directory:", process.cwd());
console.log("- Scheduler:", "last-success + ring-fallback + cooldown");

// --- Helpers ---

/**
 * Generates a consistent, unique, and short message ID.
 * Uses a base-36 relative timestamp + counter + random suffix.
 */
let msgCounter = 0;
const EPOCH = 1735689600000; // 2025-01-01
const generateMsgId = () => {
    msgCounter++;
    const ts = (Date.now() - EPOCH).toString(36);
    const count = msgCounter.toString(36);
    const rand = crypto.randomBytes(2).toString('hex'); // 4 hex chars
    return `${ts}${count}${rand}`;
};

const parseLLMJson = (content: string) => {
  const tryParse = (raw: string) => JSON.parse(raw);
  const trimmed = content.trim();

  const extractJsonSlice = (raw: string) => {
    const firstObject = raw.indexOf("{");
    const firstArray = raw.indexOf("[");
    let start = -1;
    if (firstObject >= 0 && firstArray >= 0) start = Math.min(firstObject, firstArray);
    else start = Math.max(firstObject, firstArray);
    if (start < 0) return "";

    const lastObject = raw.lastIndexOf("}");
    const lastArray = raw.lastIndexOf("]");
    const end = Math.max(lastObject, lastArray);
    if (end <= start) return "";
    return raw.slice(start, end + 1).trim();
  };

  let json: any;
  try {
    json = tryParse(trimmed);
  } catch {
    const match = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      try {
        json = tryParse(match[1].trim());
      } catch (e2) {
        console.error("Failed to parse JSON from markdown block", e2);
      }
    }

    if (!json) {
      const cleaned = trimmed
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/([{,])\s*([a-zA-Z0-9_]+):/g, '$1"$2":');

      try {
        json = tryParse(cleaned);
      } catch (e3) {
        const sliced = extractJsonSlice(trimmed);
        if (sliced) {
          try {
            json = tryParse(sliced);
          } catch (e4) {
            throw new Error(`JSON Parse Error: ${e4 instanceof Error ? e4.message : String(e4)}`);
          }
        } else {
          throw new Error(`JSON Parse Error: ${e3 instanceof Error ? e3.message : String(e3)}`);
        }
      }
    }
  }

  if (json?.site_config) {
    const siteConfig = json.site_config;
    if (siteConfig.branding) json.branding = { ...json.branding, ...siteConfig.branding };
    if (siteConfig.projectId) json.projectId = siteConfig.projectId;
  }

  if (json?.branding?.colors && json.branding.colors.secondary && !json.branding.colors.accent) {
    json.branding.colors.accent = json.branding.colors.secondary;
  }

  if (Array.isArray(json?.pages)) {
    json.pages = json.pages.map((page: any) => {
      if (page.title && !page.seo?.title) {
        page.seo = { ...page.seo, title: page.title };
      }
      if (page.description && !page.seo?.description) {
        page.seo = { ...page.seo, description: page.description };
      }
      if (page.content && !page.puckData?.content) {
        page.puckData = { ...page.puckData, content: page.content };
      }
      return page;
    });

    json.pages.forEach((page: any) => {
      if (!Array.isArray(page?.puckData?.content)) return;
      page.puckData.content = page.puckData.content.map((comp: any) => {
        if (comp?.type) comp.type = normalizeComponentType(comp.type);
        if (!comp.id) comp.id = comp?.props?.id || generateMsgId();
        if (!comp.props) comp.props = {};
        Object.keys(comp.props).forEach((key) => {
          if (Array.isArray(comp.props[key])) {
            comp.props[key] = comp.props[key].map((item: any, idx: number) => {
              if (item && typeof item === "object" && !item.id) {
                item.id = `item-${idx}-${generateMsgId()}`;
              }
              return item;
            });
          }
        });
        return comp;
      });
    });
  }

  return json;
};
// --- State Definition ---

export interface AgentState {
  messages: BaseMessage[];
  phase: string; 
  project_outline?: string;
  project_json?: any;   // Final Puck JSON (ProjectSchema)
  track_results?: any[];
  sitemap?: any;
  industry?: string;
  theme?: { primaryColor: string; mode: "dark" | "light" } | undefined;
  history?: string[];
  pages_to_expand?: string[]; // 鐎垫澘鎳愰弫鎾诲箣閹邦喗鐣卞銈囨暬濞兼壆鎹勯姘辩獮闂傚啰鍠庨崹?
  current_page_index: number; // 鐟滅増鎸告晶鐘差潰閿濆懏韬璺哄閹﹦绮鈧崵鎴炵▔椤忓牄鈧锟?
  seo_keywords?: string[]; // 闁稿繈鍔庨悵顖炲礂閹惰姤鏆涢悹鍥хФ閻°儵锟?
  critique_feedback?: string;
  validation_error?: string;
  attempt_count: number;
  deployed_url?: string;
  user_id?: string;      // User ID from Supabase
  access_token?: string; // Access Token for Supabase
  db_project_id?: string; // Supabase Project ID
  design_hit?: DesignSkillHit;
  workflow_context?: {
    selectionCriteria?: string;
    sequentialWorkflow?: string;
    workflowGuide?: string;
    rulesSummary?: string;
    designMd?: string;
    preferredLocale?: "zh-CN" | "en";
    generationMode?: "legacy" | "skill-direct";
  };
}

// --- Model Factory ---

const getCrossProviderFallbackMode = () => {
  const mode = (process.env.LLM_CROSS_PROVIDER_FALLBACK || "all").trim().toLowerCase();
  if (mode === "none" || mode === "network_only") return mode;
  return "all";
};

const isNetworkLikeError = (error: any) => {
  const status = Number(error?.status || error?.response?.status || NaN);
  if (Number.isFinite(status)) {
    if (status >= 500) return true;
    if ([408, 409, 425, 429].includes(status)) return true;
  }

  const code = String(error?.code || error?.cause?.code || "").toUpperCase();
  if (
    [
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
    ].includes(code)
  ) {
    return true;
  }

  const msg = String(error?.message || "").toLowerCase();
  return [
    "timeout",
    "timed out",
    "network",
    "socket",
    "fetch failed",
    "temporarily unavailable",
    "service unavailable",
    "connection reset",
    "rate limit",
  ].some((token) => msg.includes(token));
};

const shouldContinueProviderFallback = (error: any) => {
  const mode = getCrossProviderFallbackMode();
  if (mode === "none") return false;
  if (mode === "all") return true;
  return isNetworkLikeError(error) || isRegionDeniedError(error);
};

const PROVIDER_FAILURE_THRESHOLD = Number(process.env.LLM_PROVIDER_FAILURE_THRESHOLD || 2);
const PROVIDER_RECOVERY_PROBE_INTERVAL_MS = Number(process.env.LLM_PROVIDER_RECOVERY_PROBE_INTERVAL_MS || 120000);
const PROVIDER_TIMEOUT_COOLDOWN_MS = Number(process.env.LLM_PROVIDER_TIMEOUT_COOLDOWN_MS || 30000);
const PROVIDER_NETWORK_COOLDOWN_MS = Number(process.env.LLM_PROVIDER_NETWORK_COOLDOWN_MS || 30000);
const PROVIDER_RATE_LIMIT_COOLDOWN_MS = Number(process.env.LLM_PROVIDER_RATE_LIMIT_COOLDOWN_MS || 45000);
const PROVIDER_SERVER_COOLDOWN_MS = Number(process.env.LLM_PROVIDER_SERVER_COOLDOWN_MS || 20000);
const PROVIDER_AUTH_COOLDOWN_MS = Number(process.env.LLM_PROVIDER_AUTH_COOLDOWN_MS || 600000);
const PROVIDER_TOS_COOLDOWN_MS = Number(process.env.LLM_PROVIDER_TOS_COOLDOWN_MS || 900000);
const PROVIDER_UNKNOWN_COOLDOWN_MS = Number(process.env.LLM_PROVIDER_UNKNOWN_COOLDOWN_MS || 15000);
const LLM_TIMEOUT_MIN_MS = Number(process.env.LLM_TIMEOUT_MIN_MS || 8000);
const LLM_TIMEOUT_MAX_MS = Number(process.env.LLM_TIMEOUT_MAX_MS || 45000);
const LLM_OPERATION_TIMEOUT_MIN_MS = Number(process.env.LLM_OPERATION_TIMEOUT_MIN_MS || 15000);
const LLM_OPERATION_TIMEOUT_MAX_MS = Number(process.env.LLM_OPERATION_TIMEOUT_MAX_MS || 90000);
const LLM_OPERATION_TIMEOUT_DEFAULT_MS = Number(process.env.LLM_OPERATION_TOTAL_TIMEOUT_MS || 60000);

let lastRecoveryProbeAt = 0;

const toNumberOrFallback = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clampMs = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const resolvePerRequestTimeoutMs = (overrideMs?: number): number => {
  const raw = toNumberOrFallback(overrideMs, toNumberOrFallback(process.env.LLM_REQUEST_TIMEOUT_MS, 25000));
  return clampMs(raw, LLM_TIMEOUT_MIN_MS, LLM_TIMEOUT_MAX_MS);
};

const resolveOperationTimeoutBudgetMs = (fallbackMs: number): number => {
  const envBudget = toNumberOrFallback(process.env.LLM_OPERATION_TOTAL_TIMEOUT_MS, fallbackMs);
  return clampMs(envBudget, LLM_OPERATION_TIMEOUT_MIN_MS, LLM_OPERATION_TIMEOUT_MAX_MS);
};

const getProviderRuntime = (provider: LlmProvider): ProviderRuntimeState => providerRuntimeState.providerStates[provider];

const isProviderCoolingDown = (provider: LlmProvider, now = Date.now()): boolean => {
  const until = Number(getProviderRuntime(provider).cooldownUntil || 0);
  return until > now;
};

const classifyProviderFailure = (error: any): ProviderFailureKind => {
  const status = Number(error?.status || error?.response?.status || NaN);
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || error?.cause?.code || "").toUpperCase();

  if (msg.includes("terms of service") || msg.includes("prohibited")) return "tos";
  if (status === 401) return "auth";
  if (status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return "timeout";
  }
  if (isNetworkLikeError(error) || isRegionDeniedError(error)) return "network";
  return "unknown";
};

const getFailureCooldownMs = (kind: ProviderFailureKind): number => {
  switch (kind) {
    case "timeout":
      return PROVIDER_TIMEOUT_COOLDOWN_MS;
    case "network":
      return PROVIDER_NETWORK_COOLDOWN_MS;
    case "rate_limit":
      return PROVIDER_RATE_LIMIT_COOLDOWN_MS;
    case "server":
      return PROVIDER_SERVER_COOLDOWN_MS;
    case "auth":
      return PROVIDER_AUTH_COOLDOWN_MS;
    case "tos":
      return PROVIDER_TOS_COOLDOWN_MS;
    default:
      return PROVIDER_UNKNOWN_COOLDOWN_MS;
  }
};

const getFailureThreshold = (kind: ProviderFailureKind): number => {
  if (kind === "auth" || kind === "tos") return 1;
  return Math.max(1, PROVIDER_FAILURE_THRESHOLD);
};

const onProviderSuccess = (provider: LlmProvider) => {
  const now = Date.now();
  const state = getProviderRuntime(provider);
  state.consecutiveFailures = 0;
  state.consecutiveSuccesses += 1;
  state.lastSuccessAt = now;
  state.lastFailureKind = undefined;
  state.lastFailureMessage = undefined;
  state.cooldownUntil = 0;
  providerRuntimeState.lastSuccessfulProvider = provider;
};

const onProviderFailure = (provider: LlmProvider, error: any) => {
  const now = Date.now();
  const state = getProviderRuntime(provider);
  const kind = classifyProviderFailure(error);
  state.consecutiveFailures += 1;
  state.consecutiveSuccesses = 0;
  state.lastFailureAt = now;
  state.lastFailureKind = kind;
  state.lastFailureMessage = String(error?.message || "").slice(0, 240);
  const threshold = getFailureThreshold(kind);
  if (state.consecutiveFailures >= threshold) {
    state.cooldownUntil = now + getFailureCooldownMs(kind);
  }
};

const rotateProviderOrder = (providers: LlmProvider[], start?: LlmProvider): LlmProvider[] => {
  if (!start) return [...providers];
  const idx = providers.indexOf(start);
  if (idx < 0) return [...providers];
  return [...providers.slice(idx), ...providers.slice(0, idx)];
};

const getNextRingStart = (available: LlmProvider[]): LlmProvider | undefined => {
  if (available.length === 0) return undefined;
  const ring = getProviderOrder();
  for (let i = 0; i < ring.length; i += 1) {
    const idx = (providerRingCursor + i) % ring.length;
    const candidate = ring[idx];
    if (available.includes(candidate)) {
      providerRingCursor = (idx + 1) % ring.length;
      return candidate;
    }
  }
  return available[0];
};

const shouldRecoveryProbeProvider = (provider: LlmProvider, now: number): boolean => {
  const state = getProviderRuntime(provider);
  if (isProviderCoolingDown(provider, now)) return false;
  if (!state.lastFailureAt) return false;
  const hadCircuitBreak = Number(state.cooldownUntil || 0) > 0;
  const cooldownExpired = Number(state.cooldownUntil || 0) <= now;
  return hadCircuitBreak && cooldownExpired;
};

const selectProviderAttemptOrder = (operation: string): LlmProvider[] => {
  const configuredOrder = getProviderOrder();
  const available = configuredOrder.filter((provider) => !!getProviderConfig(provider).apiKey);
  if (available.length === 0) return [];

  const now = Date.now();
  let start = providerRuntimeState.lastSuccessfulProvider;
  if (start && (!available.includes(start) || isProviderCoolingDown(start, now))) {
    start = undefined;
  }

  const lastSuccess = providerRuntimeState.lastSuccessfulProvider;
  const canProbeNow = now - lastRecoveryProbeAt >= PROVIDER_RECOVERY_PROBE_INTERVAL_MS || !lastRecoveryProbeAt;
  if ((!start || start === "openrouter") && canProbeNow) {
    const preferredProbe = (["aiberm", "crazyroute"] as LlmProvider[]).find(
      (provider) => available.includes(provider) && shouldRecoveryProbeProvider(provider, now),
    );
    if (preferredProbe) {
      start = preferredProbe;
      lastRecoveryProbeAt = now;
      const recoveryReason =
        lastSuccess && lastSuccess !== preferredProbe ? `${lastSuccess} -> ${preferredProbe}` : `${preferredProbe}`;
      console.log(`[LLM Scheduler] recovery probe for ${operation}: ${recoveryReason}`);
    }
  }

  if (!start) {
    start = getNextRingStart(available);
  }

  const rotated = rotateProviderOrder(available, start || available[0]);
  const ready = rotated.filter((provider) => !isProviderCoolingDown(provider, now));
  if (ready.length > 0) return ready;

  const earliest = [...rotated].sort((a, b) => {
    const aUntil = Number(getProviderRuntime(a).cooldownUntil || 0);
    const bUntil = Number(getProviderRuntime(b).cooldownUntil || 0);
    return aUntil - bUntil;
  });
  const selected = earliest[0];
  if (selected) {
    const until = Number(getProviderRuntime(selected).cooldownUntil || 0);
    const waitMs = Math.max(0, until - now);
    console.warn(
      `[LLM Scheduler] all providers cooling down for ${operation}; probing ${selected} first (remaining ${waitMs}ms)`,
    );
    return [selected];
  }
  return [];
};

const createModelForProvider = (config: ProviderConfig, modelName: string, temperature = 0, timeoutMs = 25000) => {
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error(`${config.provider.toUpperCase()} api key is missing`);
  const httpAgent = createHttpsProxyAgentFromEnv();
  const maxRetries = Number(process.env.LLM_MAX_RETRIES || 1);
  const modelOptions: ConstructorParameters<typeof ChatOpenAI>[0] = {
    modelName,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      ...(httpAgent ? { httpAgent } : {}),
    },
    temperature,
    timeout: timeoutMs,
    maxRetries,
  };
  const model = new ChatOpenAI(modelOptions);

  // aiberm-backed Claude models reject requests containing both temperature and top_p.
  // LangChain defaults top_p=1, so we must clear it explicitly after construction.
  if (config.provider === "aiberm") {
    (model as any).topP = undefined;
  }

  return model;
};

const runWithProviderFallback = async <T>(params: {
  operation: string;
  modelName?: string;
  temperature?: number;
  timeoutMs?: number;
  run: (model: ChatOpenAI, config: ProviderConfig) => Promise<T>;
}): Promise<T> => {
  const requestTimeoutMs = resolvePerRequestTimeoutMs(params.timeoutMs);
  const withTimeout = (promise: Promise<T>, provider: LlmProvider, timeoutMs: number) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `LLM request timeout after ${timeoutMs}ms [operation=${params.operation}, provider=${provider}]`,
          ),
        );
      }, timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });

  const order = selectProviderAttemptOrder(params.operation);
  const failures: string[] = [];

  if (order.length === 0) {
    throw new Error(`No available LLM provider with API key for operation ${params.operation}`);
  }

  const derivedBudget = clampMs(
    requestTimeoutMs * Math.max(2, Math.min(order.length, 3)),
    LLM_OPERATION_TIMEOUT_MIN_MS,
    LLM_OPERATION_TIMEOUT_MAX_MS,
  );
  const operationBudgetMs = resolveOperationTimeoutBudgetMs(derivedBudget || LLM_OPERATION_TIMEOUT_DEFAULT_MS);
  const operationStartedAt = Date.now();
  console.log(
    `[LLM Scheduler] ${params.operation}: order=${order.join(" -> ")}, per_timeout=${requestTimeoutMs}ms, budget=${operationBudgetMs}ms`,
  );

  for (const provider of order) {
    const config = getProviderConfig(provider);
    if (!config.apiKey) {
      failures.push(`${provider}: missing_api_key`);
      continue;
    }

    const resolvedModelName = params.modelName || config.modelName;
    const elapsedMs = Date.now() - operationStartedAt;
    const remainingBudgetMs = operationBudgetMs - elapsedMs;
    if (remainingBudgetMs <= 1500) {
      failures.push(`${provider}: budget_exhausted`);
      break;
    }
    const providerTimeoutMs = clampMs(
      Math.min(requestTimeoutMs, remainingBudgetMs),
      Math.min(3000, LLM_TIMEOUT_MIN_MS),
      LLM_TIMEOUT_MAX_MS,
    );
    try {
      const startedAt = Date.now();
      const model = createModelForProvider(
        config,
        resolvedModelName,
        params.temperature ?? 0,
        providerTimeoutMs,
      );
      const result = await withTimeout(params.run(model, config), config.provider, providerTimeoutMs);
      const durationMs = Date.now() - startedAt;
      onProviderSuccess(config.provider);
      providerTraceState.hits.push({
        operation: params.operation,
        provider: config.provider,
        modelName: resolvedModelName,
        at: new Date().toISOString(),
      });
      console.log(`[LLM] ${params.operation} succeeded on ${config.provider} in ${durationMs}ms`);
      return result;
    } catch (error) {
      onProviderFailure(provider, error);
      const status = Number(error && (error as any).status ? (error as any).status : NaN);
      const kind = classifyProviderFailure(error);
      failures.push(
        `${provider}: ${Number.isFinite(status) ? `status_${status}` : "invoke_error"}:${kind}`,
      );
      console.error(`[LLM Fallback] ${params.operation} failed on ${provider}:`, error);
      if (!shouldContinueProviderFallback(error)) {
        throw error;
      }
    }
  }

  const snapshot = getProviderRuntimeSnapshot();
  throw new Error(
    `All providers failed for ${params.operation}. Details: ${failures.join(" | ")}. budget=${operationBudgetMs}ms. last_success=${
      snapshot.lastSuccessfulProvider || "none"
    }`,
  );
};

const ensureHumanTurn = (messages: BaseMessage[]) => {
  const hasHuman = messages.some((message) => message instanceof HumanMessage);
  if (hasHuman) return messages;
  return [
    ...messages,
    new HumanMessage("Please execute the instructions above and return only the requested output."),
  ];
};

const invokeRawWithProviderFallback = (
  messages: BaseMessage[],
  options: { operation: string; modelName?: string; temperature?: number; timeoutMs?: number }
) =>
  runWithProviderFallback({
    operation: options.operation,
    modelName: options.modelName,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs,
    run: (model) => model.invoke(ensureHumanTurn(messages)),
  });

const invokeStructuredWithProviderFallback = <T>(
  schema: any,
  messages: BaseMessage[],
  options: { operation: string; modelName?: string; temperature?: number; timeoutMs?: number }
) =>
  runWithProviderFallback<T>({
    operation: options.operation,
    modelName: options.modelName,
    temperature: options.temperature,
    timeoutMs: options.timeoutMs,
    run: (model) =>
      model.withStructuredOutput(schema as any).invoke(ensureHumanTurn(messages)) as unknown as Promise<T>,
  });

// --- Constants ---

const jsonSchema = zodToJsonSchema(ProjectSchema as any, "project");
const SCHEMA_STRING = JSON.stringify(jsonSchema, null, 2);

const ConversationIntentSchema = z.object({
  intent: z.enum(["chat", "propose_plan", "confirm_build", "deploy"]).describe("The intent of your response."),
  message: z.string().describe("The conversational response to the user."),
  plan_outline: z.string().optional().describe("The full website plan outline. Required if intent is 'propose_plan'.").nullable()
});

const normalizeRoutePath = (raw: string) => {
  const trimmed = raw.trim().replace(/[，。；、\s]+$/g, "");
  if (!trimmed) return "/";
  if (trimmed === "/") return "/";
  const noQuery = trimmed.split("?")[0].split("#")[0];
  const withLeading = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  const cleaned = withLeading.replace(/\/{2,}/g, "/").replace(/\/+$/g, "");
  return cleaned === "" ? "/" : cleaned.toLowerCase();
};

const extractRequestedPaths = (text: string) => {
  const hits = text.match(/\/[A-Za-z0-9_-]*/g) || [];
  const ordered: string[] = [];
  for (const hit of hits) {
    const normalized = normalizeRoutePath(hit);
    if (normalized.length > 1 && normalized.includes(".")) continue;
    if (!ordered.includes(normalized)) ordered.push(normalized);
  }
  if (ordered.length > 0 && !ordered.includes("/")) ordered.unshift("/");
  return ordered;
};

const extractBrandHint = (text: string) => {
  const hyphenToken = text.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/);
  if (hyphenToken?.[0]) return hyphenToken[0];

  const en = text.match(/for\s+([A-Za-z][A-Za-z0-9-]{1,40})\s+(?:build|create|generate)/i);
  if (en?.[1]) return en[1];

  const explicit = text.match(/\b([A-Za-z][A-Za-z0-9-]{1,40})\bs*(?:website|site|homepage|landing)/i);
  if (explicit?.[1]) return explicit[1];

  return undefined;
};

const countMatches = (text: string, pattern: RegExp) => {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
};

const detectPreferredLocale = (text: string): "zh-CN" | "en" => {
  const cjkCount = countMatches(text, /[\u4e00-\u9fff]/g);
  const latinCount = countMatches(text, /[a-zA-Z]/g);
  return cjkCount > 0 && cjkCount * 1.2 >= latinCount ? "zh-CN" : "en";
};

const getRouteLabel = (routePath: string, locale: "zh-CN" | "en"): string => {
  const zhMap: Record<string, string> = {
    "/": "首页",
    "/company": "公司",
    "/products": "产品",
    "/news": "资讯",
    "/cases": "案例",
    "/contact": "联系",
  };
  const enMap: Record<string, string> = {
    "/": "Home",
    "/company": "Company",
    "/products": "Products",
    "/news": "News",
    "/cases": "Cases",
    "/contact": "Contact",
  };

  const normalized = normalizeRoutePath(routePath);
  if (locale === "zh-CN" && zhMap[normalized]) return zhMap[normalized];
  if (enMap[normalized]) return enMap[normalized];
  return titleFromPath(normalized);
};

const toProjectIdSlug = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "website-project";

const TEXTUAL_FIELD_RE =
  /title|subtitle|description|content|question|answer|label|privacy|cta|name|role|tag|link|href|value|placeholder|text/i;

const toSafeText = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const candidateKeys = ["text", "title", "label", "name", "value", "description", "content"];
    for (const key of candidateKeys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const sanitizeGeneratedValue = (value: unknown, keyHint?: string): unknown => {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeGeneratedValue(entry, keyHint));
  }
  if (typeof value === "object") {
    if (keyHint && TEXTUAL_FIELD_RE.test(keyHint)) return toSafeText(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeGeneratedValue(entry, key),
      ]),
    );
  }
  return value;
};

const sanitizeRenderableProps = (value: unknown): Record<string, unknown> => {
  const sanitized = sanitizeGeneratedValue(value);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return {};
  return sanitized as Record<string, unknown>;
};

const sanitizeGeneratedHtml = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const withoutScripts = trimmed.replace(/<script[\s\S]*?<\/script>/gi, "");
  const withoutMainWrap = withoutScripts
    .replace(/^<main[^>]*>/i, "")
    .replace(/<\/main>\s*$/i, "")
    .trim();
  return withoutMainWrap || undefined;
};

const extractHtmlFromModelResponse = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";

  const fenced = trimmed.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  if (!candidate.includes("<")) return "";
  return candidate;
};

const escapeHtmlAttr = (value: string): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const normalizeTypeKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const extractSkillFilterOptions = (props: Record<string, unknown>): string[] => {
  const directCandidates = [props.options, props.categories, props.tabs, props.values];
  const itemCandidates = Array.isArray(props.items) ? props.items : [];
  const tokens: string[] = [];

  for (const candidate of directCandidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        const text = toSafeText(entry).trim();
        if (text) tokens.push(text);
      }
      continue;
    }
    const text = toSafeText(candidate);
    if (!text) continue;
    tokens.push(
      ...text
        .split(/[|,锛屻€?]/g)
        .map((x) => x.trim())
        .filter(Boolean),
    );
  }

  for (const entry of itemCandidates) {
    if (!entry || typeof entry !== "object") {
      const text = toSafeText(entry).trim();
      if (text) tokens.push(text);
      continue;
    }
    const text = toSafeText(
      (entry as Record<string, unknown>).title ||
        (entry as Record<string, unknown>).label ||
        (entry as Record<string, unknown>).name ||
        (entry as Record<string, unknown>).text ||
        (entry as Record<string, unknown>).value,
    ).trim();
    if (text) tokens.push(text);
  }

  return Array.from(new Set(tokens)).slice(0, 12);
};



type ExpansionNodeResponse = {
  pageContent: Array<{ id?: string; type: string; props: Record<string, unknown> }>;
  seo?: { title?: string; description?: string };
  rawHtml?: string;
  navLabel?: string;
};

const normalizeAppendComponents = (raw: unknown): Array<{ id?: string; type: string; props: Record<string, unknown> }> => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const rawType = String((entry as any).type || "");
      const requestedType = normalizeComponentType(rawType);
      const entryObj = entry as Record<string, unknown>;
      const topLevelProps = sanitizeRenderableProps(
        Object.fromEntries(
          Object.entries(entryObj).filter(([key]) => key !== "id" && key !== "type" && key !== "props"),
        ),
      );
      const nestedProps = sanitizeRenderableProps((entry as any).props || {});
      const safeProps = {
        ...topLevelProps,
        ...nestedProps,
      };
      const requestedId = typeof (entry as any).id === "string" ? (entry as any).id.trim() : "";
      if (!requestedType) return null;

      // Filter-only controls should not leak into static pages as raw text.
      const typeKey = normalizeTypeKey(rawType);
      if (typeKey === "filterbar" || typeKey === "tabfilter") {
        const options = extractSkillFilterOptions(safeProps);
        if (!options.length) return null;
        return {
          ...(requestedId ? { id: requestedId } : {}),
          type: "ValuePropositions",
          props: {
            title: toSafeText((entry as any).title || safeProps.title || "绛涢€夐€夐」"),
            subtitle: toSafeText(safeProps.content || safeProps.description || ""),
            items: options.map((option) => ({ title: option, description: "" })),
          },
        };
      }

      return {
        ...(requestedId ? { id: requestedId } : {}),
        type: requestedType,
        props: safeProps,
      };
    })
    .filter((entry): entry is { id?: string; type: string; props: Record<string, unknown> } => !!entry);
};

const parseExpansionNodeResponse = (raw: string): ExpansionNodeResponse => {
  const parsed = parseLLMJson(raw);
  if (!parsed || typeof parsed !== "object") {
    return { pageContent: [] };
  }

  const appendSource =
    Array.isArray((parsed as any).append_components)
      ? (parsed as any).append_components
      : Array.isArray((parsed as any).appendComponents)
        ? (parsed as any).appendComponents
        : Array.isArray((parsed as any).append)
          ? (parsed as any).append
          : [];

  const pageContentSource =
    Array.isArray((parsed as any).page_content)
      ? (parsed as any).page_content
      : Array.isArray((parsed as any).pageContent)
        ? (parsed as any).pageContent
        : Array.isArray((parsed as any).content)
          ? (parsed as any).content
          : [];

  const pageContent = normalizeAppendComponents([...pageContentSource, ...appendSource]);

  const seoSource =
    (parsed as any).seo && typeof (parsed as any).seo === "object" ? (parsed as any).seo : undefined;
  const seo =
    seoSource
      ? {
          title: typeof seoSource.title === "string" ? seoSource.title : undefined,
          description: typeof seoSource.description === "string" ? seoSource.description : undefined,
        }
      : undefined;

  const htmlCandidates = [
    (parsed as any).raw_html,
    (parsed as any).rawHtml,
    (parsed as any).html_body,
    (parsed as any).htmlBody,
    (parsed as any).body_html,
    (parsed as any).bodyHtml,
  ];
  const rawHtml = htmlCandidates.find((entry) => typeof entry === "string" && entry.trim().length > 0) as
    | string
    | undefined;

  const navLabelSource = (parsed as any).nav_label ?? (parsed as any).navLabel ?? (parsed as any).menu_label;
  const navLabel = typeof navLabelSource === "string" ? navLabelSource.trim() : undefined;

  return {
    pageContent,
    seo,
    rawHtml,
    navLabel,
  };
};

const buildGeneratedComponentId = (type: string, occupiedIds: Set<string>) => {
  const base = type
    .replace(/[A-Z]/g, (m, idx) => (idx === 0 ? m.toLowerCase() : `_${m.toLowerCase()}`))
    .replace(/^_/, "");
  let idx = 1;
  while (true) {
    const candidate = `${base}_${String(idx).padStart(2, "0")}`;
    if (!occupiedIds.has(candidate)) {
      occupiedIds.add(candidate);
      return candidate;
    }
    idx += 1;
  }
};

const resolveComponentId = (candidate: unknown, type: string, occupiedIds: Set<string>) => {
  const raw = typeof candidate === "string" ? candidate.trim() : "";
  if (raw && /^[a-zA-Z0-9_-]{2,80}$/.test(raw) && !occupiedIds.has(raw)) {
    occupiedIds.add(raw);
    return raw;
  }
  return buildGeneratedComponentId(type, occupiedIds);
};

const ExpansionLooseSchema = z
  .object({
    page_content: z
      .array(
        z
          .object({
            id: z.string().optional(),
            type: z.string(),
            props: z.record(z.string(), z.any()).optional(),
          })
          .passthrough(),
      )
      .optional(),
    append_components: z
      .array(
        z
          .object({
            id: z.string().optional(),
            type: z.string(),
            props: z.record(z.string(), z.any()).optional(),
          })
          .passthrough(),
      )
      .optional(),
    seo: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
      })
      .optional(),
    raw_html: z.string().optional(),
    rawHtml: z.string().optional(),
    html_body: z.string().optional(),
    htmlBody: z.string().optional(),
    nav_label: z.string().optional(),
    navLabel: z.string().optional(),
  })
  .passthrough();

// 1. Conversation Node: Gathers requirements and proposes Outline
const conversationNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log(`--- Conversation Node Started (Phase: ${state.phase}) ---`);
  const lastHuman = [...state.messages].reverse().find((m) => m instanceof HumanMessage) as HumanMessage | undefined;
  const lastHumanText = lastHuman?.content?.toString?.() || "";
  const lastHumanLower = lastHumanText.toLowerCase();

  if (state.phase === "end" && state.project_json && lastHumanText) {
    const isDeployRequest =
      lastHumanLower.includes("deploy") ||
      lastHumanLower.includes("publish") ||
      lastHumanLower.includes("閮ㄧ讲") ||
      lastHumanLower.includes("鍙戝竷");

    if (!isDeployRequest) {
      return {
        messages: [
          new AIMessage({
            id: generateMsgId(),
            content: "Received. I will treat this as a fresh generation request and regenerate pages through the full skill workflow.",
          }),
        ],
        phase: "conversation",
      };
    }
  }
  const systemPrompt = `You are an expert Product Manager for Industrial SaaS.
  Your goal is to gather requirements from the user to build or modify a website.
  
  CURRENT PHASE: ${state.phase}
  
  LOGIC RULES:
  1. **CHAT**: Use this to ask clarifying questions. 
     - **Guidance**: You MUST guide the user. Do not just wait for input.
     - **Required Info**: If you don't know the *Industry*, *Target Audience*, or *Visual Style*, ASK for it before proposing a plan.
     - **Modifications**: If the user wants to change details (color, text, layout) at ANY stage (even after build), discuss the change and then use 'PROPOSE_PLAN' to update the blueprint.
  
  2. **PROPOSE_PLAN**: Use this when you have enough information to create or update the website plan. 
     - You MUST provide the full 'plan_outline'.
     - If modifying, reflect the changes in the outline.
  
  3. **CONFIRM_BUILD**: Use this ONLY when the user explicitly approves the plan (e.g., "build it", "looks good", "yes").
  
  4. **DEPLOY**: Use this ONLY when the user explicitly requests deployment (e.g., "deploy", "publish").
  
  CRITICAL: 
  - If the user says "change the color to blue", intent is PROPOSE_PLAN (with updated outline mentioning blue theme).
  - If the user says "remove the hero section", intent is PROPOSE_PLAN (with updated outline).
  - Do NOT auto-deploy.
  
  EXISTING OUTLINE (if any):
  ${state.project_outline || "None"}
  
  USER FEEDBACK:
  If the user asks for changes to the plan, stay in 'propose_plan' and update the outline.
  If the user gives a thumbs up, move to 'confirm_build'.

  **IMAGE ASSETS GATHERING (IMPORTANT):**
  - **Proactively ask the user for images**: Before finalizing the plan, ask the user if they have specific images for:
    - Company Logo
    - Product Photos
    - Team/People Photos
    - Background/Hero Images
  - **Explain the benefit**: Tell them that providing real images now will make the initial preview much more realistic and save them time later.
  - **Instruction**: "You can upload images directly in the chat, or provide URL links. Please specify what each image is for (e.g., 'This is our logo', 'Use this for the Hero section')."
  - **Tracking**: If the user provides images, acknowledge them and mention that they will be incorporated into the design.
  
  PLAN HISTORY:
  ${state.project_outline ? `Current Plan Outline: \n${state.project_outline}` : "No plan proposed yet."}
  `;

  // Filter history to remove tool_calls from previous messages.
  // This is required because Gemini/OpenRouter are strict about tool-call-response pairs.
  // Frontend-only tool calls (like presentActions) don't have responses, so we strip them
  // from the history sent to the LLM to avoid 400 errors.
  const cleanHistory = state.messages.map(msg => {
    // 1. Handle AIMessages: remove tool_calls and associated kwargs
    if (msg instanceof AIMessage) {
      const hasToolCalls = (msg.tool_calls && msg.tool_calls.length > 0) || 
                          (msg.additional_kwargs && msg.additional_kwargs.tool_calls);
      
      if (hasToolCalls) {
        const cleanKwargs = { ...msg.additional_kwargs };
        delete cleanKwargs.tool_calls;
        delete cleanKwargs.actions;

        return new AIMessage({
          content: msg.content,
          additional_kwargs: cleanKwargs,
          id: msg.id
        });
      }
    }
    // 2. Remove any ToolMessages or FunctionMessages entirely
    // Gemini doesn't want to see tool responses if we've removed the calls
    const type = (msg as any)._getType?.() || (msg as any).type;
    if (type === "tool" || type === "function") {
      return null;
    }
    return msg;
  }).filter(msg => msg !== null) as BaseMessage[];

  // Debug: Log message types and tool call presence
  console.log("--- Cleaned History for LLM ---");
  cleanHistory.forEach((m, i) => {
    const type = (m as any)._getType?.() || (m as any).type;
    const toolCount = (m as any).tool_calls?.length || 0;
    const kwargToolCount = (m as any).additional_kwargs?.tool_calls?.length || 0;
    console.log(`[${i}] ${type}: content_len=${m.content.toString().length}, tool_calls=${toolCount}, kwarg_tools=${kwargToolCount}`);
  });

  const messages = [
      new SystemMessage(systemPrompt), 
      ...cleanHistory 
  ];

  console.log("Conversation Node: Invoking Structured LLM...");
  try {
    const result: any = await invokeStructuredWithProviderFallback(ConversationIntentSchema, messages, {
      operation: "conversation-intent",
      temperature: 0,
    });
    
    const intent = result.intent;
    const displayMessage = result.message;
    const outline = result.plan_outline || state.project_outline;

    console.log("Conversation Node: Detected Intent:", intent);

    let nextPhase = state.phase;
    let finalMessage = displayMessage;

    if (intent === "confirm_build") {
        nextPhase = "skeleton";
        console.log("妫ｅ啯锟?[System] User approved plan. Transitioning to Skeleton phase...");
    } else if (intent === "deploy" && state.phase === "end" && !state.deployed_url) {
        nextPhase = "deploy";
        console.log("妫ｅ啯锟?[System] User requested deployment. Transitioning to Deploy phase...");
    } else if (intent === "deploy" && state.phase === "end" && state.deployed_url) {
        // Already deployed, just show the link
        nextPhase = "conversation"; 
        finalMessage = "The website has already been deployed successfully. You can open it from the link above.";
        console.log("妫ｅ啯锟?[System] User requested deployment but site is already live.");
    } else if (intent === "propose_plan") {
        nextPhase = "conversation"; 
        console.log("妫ｅ啯锟?[Planner] Plan Proposed/Updated.");
        // Ensure the outline is visible in the chat if it's not already in the message
        if (outline && !finalMessage.includes(outline)) {
            finalMessage += `\n\n${outline}`;
        }
        finalMessage += "\n\nIf you are satisfied with this plan, tell me to start generating the preview.";
    } else {
        nextPhase = "conversation";
    }

    let actions: any[] | undefined = undefined;

    if (state.phase === "end" && !state.deployed_url) {
         actions = [
             {
                 text: "Deploy to Cloudflare",
                 payload: "deploy",
                 type: "button"
             }
         ];
     } else if (state.deployed_url) {
         actions = [
             {
                 text: "View Live Site",
                 payload: state.deployed_url,
                 type: "url"
             }
         ];
     }

    console.log(`Conversation Node: phase=${state.phase}, intent=${intent}, actions to present:`, actions);

    return {
      messages: [
        new AIMessage({
          id: generateMsgId(),
          content: finalMessage,
          additional_kwargs: {
            outline: intent === "propose_plan" ? outline : undefined,
            actions
          },
          tool_calls: actions ? [{
            id: `call_${generateMsgId()}`,
            name: "presentActions",
            args: { actions }
          }] : undefined
        }),
      ],
      phase: nextPhase,
      project_outline: outline
    };
  } catch (error) {
    console.error("Conversation Node Error:", error);

    const confirmSignals = [
      "confirm",
      "approve",
      "yes",
      "ok",
      "go",
      "generate",
      "start",
      "build",
      "continue",
      "run",
    ];
    const shouldForceBuild = confirmSignals.some((token) => lastHumanLower.includes(token));
    if (shouldForceBuild) {
      const fallbackOutline =
        state.project_outline ||
        [
          "Website Plan (fallback)",
          "- Generate 6 pages with distinct content and shared navigation.",
          "- Keep brand-consistent visual system and SEO metadata.",
          "- Include rich sections per page and contact lead-capture path.",
        ].join("\n");

      return {
        messages: [
          new AIMessage({
            id: generateMsgId(),
            content:
              "Structured intent inference failed. Fallback intent detected user confirmation, proceeding to generation.",
          }),
        ],
        phase: "skeleton",
        project_outline: fallbackOutline,
      };
    }

    return {
      messages: [
        new AIMessage({
          id: generateMsgId(),
          content:
            "Model call failed (possibly due to provider/network restrictions). Please retry later or adjust provider settings.",
        }),
      ],
      phase: "conversation",
    };
  }
};

const renderTemplateValue = (template: string | undefined, brand: string, fallback: string) =>
  (template || fallback).replace(/\{\{\s*brand\s*\}\}/gi, brand).trim() || fallback;

const titleFromPath = (routePath: string) => {
  if (routePath === "/") return "Home";
  return routePath
    .replace(/^\//, "")
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const SkillDirectSiteSchema = z.object({
  site: z.object({
    stylesCss: z.string(),
    scriptJs: z.string(),
    footerHtml: z.string().optional(),
    pages: z
      .array(
        z.object({
          path: z.string(),
          title: z.string(),
          description: z.string(),
          navLabel: z.string().optional(),
          bodyHtml: z.string(),
        }),
      )
      .min(1),
  }),
});

type SkillDirectSiteOutput = z.infer<typeof SkillDirectSiteSchema>;

const hasUnknownToken = (value: unknown): boolean => /<unknown>/i.test(String(value || ""));

const toBundleRoutePath = (routePath: string) =>
  routePath === "/" ? "index.html" : `${routePath.replace(/^\//, "")}/index.html`;

const ensureNavLinks = (paths: string[], locale: "zh-CN" | "en") =>
  paths.map((path) => ({
    path,
    href: `/${toBundleRoutePath(path)}`,
    label: getRouteLabel(path, locale),
  }));

const ensureBodyHtml = (value: string) => {
  const sanitized = sanitizeGeneratedHtml(value);
  if (sanitized) return sanitized;
  return `<section><h1>${escapeHtmlAttr("Generated Page")}</h1><p>${escapeHtmlAttr("Content generation fallback was applied.")}</p></section>`;
};

const composeSkillDirectPageHtml = (input: {
  lang: "zh-CN" | "en";
  title: string;
  description: string;
  pagePath: string;
  brandName: string;
  bodyHtml: string;
  footerHtml?: string;
  navLinks: Array<{ path: string; href: string; label: string }>;
}) => {
  const nav = input.navLinks
    .map((link) => {
      const active = link.path === input.pagePath ? "is-active" : "";
      return `<li><a class="${active}" href="${escapeHtmlAttr(link.href)}">${escapeHtmlAttr(link.label)}</a></li>`;
    })
    .join("");

  const footer =
    input.footerHtml && input.footerHtml.trim()
      ? sanitizeGeneratedHtml(input.footerHtml) || ""
      : `<div class="footer-grid">
  <div><h4>${escapeHtmlAttr(input.brandName)}</h4><p>${escapeHtmlAttr(input.description)}</p></div>
  <div><h4>${escapeHtmlAttr(input.lang === "zh-CN" ? "导航" : "Navigation")}</h4>${input.navLinks
    .map((link) => `<p><a href="${escapeHtmlAttr(link.href)}">${escapeHtmlAttr(link.label)}</a></p>`)
    .join("")}</div>
</div>`;

  return `<!doctype html>
<html lang="${input.lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtmlAttr(input.title)}</title>
  <meta name="description" content="${escapeHtmlAttr(input.description)}">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="topbar">
    <div class="container topbar-inner">
      <a class="brand" href="/index.html">${escapeHtmlAttr(input.brandName)}</a>
      <button class="nav-toggle" data-menu-toggle aria-expanded="false" aria-label="Toggle navigation">Menu</button>
      <nav>
        <ul class="nav-list" data-nav-list>
          ${nav}
        </ul>
      </nav>
      <a class="btn btn-primary" href="/contact/index.html">${escapeHtmlAttr(
        input.lang === "zh-CN" ? "立即咨询" : "Request Quote",
      )}</a>
    </div>
  </header>
  <main>
    ${input.bodyHtml}
  </main>
  <footer class="footer">
    <div class="container">
      ${footer}
    </div>
  </footer>
  <script src="/script.js"></script>
</body>
</html>`;
};

// 2. Skeleton Node: skill-direct static-site generation (opencode-aligned)
const skeletonNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Skeleton Node Started (skill-direct static site mode) ---");

  const requirementParts: string[] = [];
  if (state.project_outline) requirementParts.push(state.project_outline);
  for (const msg of state.messages || []) {
    if (msg instanceof HumanMessage) {
      const text = msg.content?.toString?.().trim();
      if (text) requirementParts.push(text);
    }
  }
  const requirementText = requirementParts.join("\n\n");
  const requestedPaths = extractRequestedPaths(requirementText);
  const brandHint = extractBrandHint(requirementText);
  const preferredLocale = detectPreferredLocale(requirementText);

  let workflowContext;
  try {
    workflowContext = await loadWorkflowSkillContext(requirementText);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      messages: [
        new AIMessage({
          id: generateMsgId(),
          content: `website-generation-workflow assets unavailable: ${reason}. Generation blocked until skill assets are fixed.`,
        }),
      ],
      phase: "conversation",
    };
  }

  const designHit = workflowContext.hit;
  const stylePreset = workflowContext.stylePreset;
  const blueprint = workflowContext.templateBlueprint;

  if (designHit.id === "awesome-index-unavailable") {
    return {
      messages: [
        new AIMessage({
          id: generateMsgId(),
          content:
            "awesome-design index is unavailable, so style selection cannot continue. Ensure local skill assets exist before retry.",
        }),
      ],
      phase: "conversation",
    };
  }

  const routePaths =
    blueprint.routeMode === "fixed"
      ? blueprint.paths
      : requestedPaths.length > 0
        ? requestedPaths
        : blueprint.paths;
  const safePaths = routePaths.length > 0 ? routePaths : ["/"];
  const brandName = brandHint || state.project_json?.branding?.name || "Shpitto";
  const navLinks = ensureNavLinks(safePaths, preferredLocale);

  const clip = (text: string | undefined, max = 3200) => {
    const raw = (text || "").trim();
    if (!raw) return "(none)";
    return raw.length <= max ? raw : `${raw.slice(0, max)}\n...[truncated]`;
  };

  const generationPrompt = `You are the website-generation-workflow execution engine.
Generate a complete static website in opencode-skill style: shared styles.css + shared script.js + route-specific page body HTML.

Output must satisfy the provided JSON schema exactly.
Do not include markdown fences.

Hard requirements:
1) Build pages for EXACT routes: ${safePaths.join(", ")}
2) Return unified design language across all pages (single visual system).
3) Use shared CSS classes from stylesCss; avoid per-page inline style blocks.
4) Each page bodyHtml must be rich, route-specific, and non-repetitive.
5) Contact page must contain a real <form> with at least name/email(or phone)/message/submit.
6) News page categories must be semantic list/tags, never plain pipe text.
7) Main copy language: ${preferredLocale}.
8) Navigation labels should be short and clean.
9) Do not output placeholders.

Brand:
${JSON.stringify(
  {
    name: brandName,
    colors: {
      primary: stylePreset.colors?.primary || "#0052FF",
      accent: stylePreset.colors?.accent || "#22C55E",
    },
    typography: stylePreset.typography,
  },
  null,
  2,
)}

Route map:
${JSON.stringify(navLinks, null, 2)}

Selected style:
${JSON.stringify(
  {
    id: designHit.id,
    name: designHit.name,
    design_desc: designHit.design_desc,
  },
  null,
  2,
)}

Workflow guide:
${clip(workflowContext.workflowGuide, 1000)}

Sequential workflow:
${clip(workflowContext.sequentialWorkflow, 1000)}

Design rules summary:
${clip(workflowContext.rulesSummary, 1000)}

Selected DESIGN.md:
${clip(workflowContext.designMd, 1800)}

Original requirement:
${clip(requirementText, 1200)}
`;

  const skillDirectTimeoutMs = resolvePerRequestTimeoutMs(
    toNumberOrFallback(process.env.LLM_REQUEST_TIMEOUT_SKILL_DIRECT_MS, 35000),
  );
  let generated: SkillDirectSiteOutput | null = null;
  let generationError = "";
  try {
    generated = await invokeStructuredWithProviderFallback<SkillDirectSiteOutput>(
      SkillDirectSiteSchema,
      [new SystemMessage(generationPrompt)],
      {
        operation: "skill-direct-site",
        temperature: 0.2,
        timeoutMs: skillDirectTimeoutMs,
      },
    );
    const outputLooksUnknown =
      hasUnknownToken(generated?.site?.stylesCss) ||
      hasUnknownToken(generated?.site?.scriptJs) ||
      (generated?.site?.pages || []).some(
        (page) =>
          hasUnknownToken(page?.title) ||
          hasUnknownToken(page?.description) ||
          hasUnknownToken(page?.bodyHtml),
      );
    if (outputLooksUnknown) {
      throw new Error("skill-direct-site returned placeholder <UNKNOWN> payload");
    }
  } catch (error) {
    generationError = error instanceof Error ? error.message : String(error);
    try {
      const retryResponse = await invokeRawWithProviderFallback(
        [
          new SystemMessage(generationPrompt),
          new HumanMessage(
            "Previous output was invalid or contained <UNKNOWN>. Regenerate complete real content for all required routes with real CSS/JS/bodyHtml.",
          ),
        ],
        {
          operation: "skill-direct-site-retry",
          temperature: 0,
          timeoutMs: skillDirectTimeoutMs,
        },
      );
      const parsed = parseLLMJson(retryResponse.content.toString());
      generated = SkillDirectSiteSchema.parse(parsed);
      const retryLooksUnknown =
        hasUnknownToken(generated?.site?.stylesCss) ||
        hasUnknownToken(generated?.site?.scriptJs) ||
        (generated?.site?.pages || []).some(
          (page) =>
            hasUnknownToken(page?.title) ||
            hasUnknownToken(page?.description) ||
            hasUnknownToken(page?.bodyHtml),
        );
      if (retryLooksUnknown) {
        throw new Error("skill-direct-site-retry returned placeholder <UNKNOWN> payload");
      }
      generationError = "";
    } catch (retryError) {
      const reason = retryError instanceof Error ? retryError.message : String(retryError);
      generationError = `${generationError}; retry failed: ${reason}`;
    }
  }

  if (!generated) {
    return {
      messages: [
        new AIMessage({
          id: generateMsgId(),
          content: `Skill-direct generation failed: ${generationError || "unknown error"}.`,
        }),
      ],
      phase: "conversation",
    };
  }

  const pageByPath = new Map(
    (generated.site.pages || []).map((page) => [normalizeRoutePath(String(page.path || "/")), page]),
  );

  const fallbackStylesCss = `
:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --ink: #0f172a;
  --muted: #475569;
  --brand: ${stylePreset.colors?.primary || "#0052FF"};
  --accent: ${stylePreset.colors?.accent || "#22C55E"};
  --line: #e2e8f0;
  --container: 1160px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: ${stylePreset.typography || "Inter, system-ui, -apple-system, sans-serif"}; background: var(--bg); color: var(--ink); line-height: 1.6; }
.container { width: min(var(--container), calc(100% - 2rem)); margin: 0 auto; }
.topbar { position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,.94); border-bottom: 1px solid var(--line); backdrop-filter: blur(8px); }
.topbar-inner { min-height: 70px; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.brand { font-weight: 700; text-decoration: none; color: var(--ink); }
.nav-toggle { display: none; }
.nav-list { display: flex; list-style: none; margin: 0; padding: 0; gap: 1rem; }
.nav-list a { text-decoration: none; color: var(--muted); font-weight: 600; }
.nav-list a.is-active, .nav-list a:hover { color: var(--brand); }
.btn { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: .65rem 1.15rem; text-decoration: none; font-weight: 700; }
.btn-primary { background: var(--brand); color: #fff; }
.footer { border-top: 1px solid var(--line); background: #fff; padding: 2rem 0; margin-top: 4rem; color: var(--muted); }
.footer-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
@media (max-width: 880px) {
  .nav-toggle { display: inline-flex; border: 1px solid var(--line); background: #fff; border-radius: 8px; padding: .45rem .7rem; }
  .nav-list { display: none; position: absolute; top: 100%; left: 0; right: 0; background: #fff; border-bottom: 1px solid var(--line); padding: .8rem 1rem; flex-direction: column; }
  .nav-list.is-open { display: flex; }
}
`.trim();

  const fallbackScriptJs = `
(() => {
  const toggle = document.querySelector("[data-menu-toggle]");
  const list = document.querySelector("[data-nav-list]");
  if (toggle && list) {
    toggle.addEventListener("click", () => {
      const open = list.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
})();
`.trim();

  const stylesCss =
    typeof generated.site.stylesCss === "string" && generated.site.stylesCss.trim().length >= 200
      ? generated.site.stylesCss.trim()
      : fallbackStylesCss;
  const scriptJs =
    typeof generated.site.scriptJs === "string" && generated.site.scriptJs.trim().length >= 20
      ? generated.site.scriptJs.trim()
      : fallbackScriptJs;

  const pages = safePaths.map((routePath) => {
    const normalizedPath = normalizeRoutePath(routePath);
    const source = pageByPath.get(normalizedPath);
    const routeLabel = getRouteLabel(normalizedPath, preferredLocale);
    const cfg = blueprint.pages[normalizedPath] || blueprint.pages["/"];
    const fallbackTitle = `${routeLabel} | ${brandName}`;
    const fallbackDescription =
      preferredLocale === "zh-CN" ? `${brandName}${routeLabel}页面。` : `${brandName} ${routeLabel} page.`;
    const title = toSafeText(source?.title || renderTemplateValue(cfg?.seoTitleTemplate, brandName, fallbackTitle)).trim();
    const description = toSafeText(
      source?.description || renderTemplateValue(cfg?.seoDescriptionTemplate, brandName, fallbackDescription),
    ).trim();
    const bodyHtml = ensureBodyHtml(toSafeText(source?.bodyHtml || ""));

    return {
      path: normalizedPath,
      seo: {
        title: title || fallbackTitle,
        description: description || fallbackDescription,
        menuLabel: toSafeText(source?.navLabel || routeLabel).trim() || routeLabel,
        navLabel: toSafeText(source?.navLabel || routeLabel).trim() || routeLabel,
      },
      puckData: {
        root: {
          props: {
            stylePreset,
            rawHtml: bodyHtml,
          },
        },
        content: [],
      },
    };
  });

  const staticFiles = [
    { path: "/styles.css", content: stylesCss, type: "text/css" },
    { path: "/script.js", content: scriptJs, type: "application/javascript" },
    ...pages.map((page) => {
      const fullHtml = composeSkillDirectPageHtml({
        lang: preferredLocale,
        title: page.seo.title,
        description: page.seo.description,
        pagePath: page.path,
        brandName,
        bodyHtml: String(page.puckData?.root?.props?.rawHtml || ""),
        footerHtml: generated?.site?.footerHtml,
        navLinks,
      });
      return { path: `/${toBundleRoutePath(page.path)}`, content: fullHtml, type: "text/html" };
    }),
  ];

  const projectJson = {
    projectId: toProjectIdSlug(brandName),
    branding: {
      name: brandName,
      colors: {
        primary: stylePreset.colors?.primary || "#0052FF",
        accent: stylePreset.colors?.accent || "#22C55E",
      },
      style: {
        borderRadius: stylePreset.borderRadius || "sm",
        typography: stylePreset.typography || "Inter, system-ui, -apple-system, sans-serif",
      },
    },
    pages,
    skillHit: {
      id: designHit.id,
      name: designHit.name,
      design_desc: designHit.design_desc,
      score: designHit.score,
      matched_keywords: designHit.matched_keywords,
      source: designHit.source,
      category: designHit.category,
      design_md_url: designHit.design_md_url,
      index_generated_at: designHit.index_generated_at,
      selection_candidates: designHit.selection_candidates,
      style_preset: stylePreset,
    },
    staticSite: {
      mode: "skill-direct",
      generatedAt: new Date().toISOString(),
      routeToFile: Object.fromEntries(safePaths.map((route) => [route, `/${toBundleRoutePath(route)}`])),
      files: staticFiles,
    },
  };

  await updateTaskPlan(`
## Skill-Direct Static Site
- Workflow Skill: website-generation-workflow
- Mode: skill-direct (opencode-aligned)
- Selected Style: ${designHit.id} (${designHit.name})
- Paths: ${safePaths.join(", ")}
- Shared Assets: /styles.css, /script.js
- File Count: ${staticFiles.length}
`);

  return {
    messages: [
      new AIMessage({
        id: generateMsgId(),
        content: "Skill-direct static site generated with shared CSS/JS and route-specific HTML pages.",
      }),
    ],
    project_json: projectJson,
    pages_to_expand: [],
    current_page_index: 0,
    sitemap: safePaths,
    design_hit: designHit,
    workflow_context: {
      selectionCriteria: workflowContext.selectionCriteria,
      sequentialWorkflow: workflowContext.sequentialWorkflow,
      workflowGuide: workflowContext.workflowGuide,
      rulesSummary: workflowContext.rulesSummary,
      designMd: workflowContext.designMd,
      preferredLocale,
      generationMode: "skill-direct",
    },
    history: [],
    phase: "linter",
  };
};
const parallelNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Parallel Node Started (3-track stitching) ---");
  const skeleton = state.project_json;
  if (!skeleton) {
    return { phase: "conversation" };
  }

  const architectModelName = process.env.LLM_MODEL_ARCHITECT || process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5";
  const copyModelName = process.env.LLM_MODEL_COPYWRITER || process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5";
  const styleModelName = process.env.LLM_MODEL_STYLIST || process.env.LLM_MODEL || "anthropic/claude-sonnet-4.5";

  const skeletonJson = JSON.stringify(skeleton, null, 2);

  const architectPrompt = `濞达絿濮靛Σ?Track A: Architect闁靛棗鍊风紞姗€鎯冮崟顏呭床闁告柡鍓濆Σ鎼佸捶閵娿倗鐟濋柡鈧悷鏉跨秮濡炪倗鏁诲?path 濞戞挸娴风划宥嗙?id 闁汇劌瀚晶鐘诲箵閹邦亞鐟撻柨娑樼灱閺佹捇锟?100% 闁告艾鐗婄涵鍫曟儍?ProjectSchema JSON锟?

缂佹拝闄勫顐︽晬?
- 闊洤鎳橀妴蹇旂┍濠靛牊娈屾鐐舵硾椤︽煡鎮介妸銊х炕锟?skeleton 闂佹彃鐬煎▓?projectId闁靛棔鏀籸anding闁靛棔鍨ges/path闁靛棔妞掓禍鎺楀矗婵犲啰妲ㄥ☉鎿冧簽缁秵绂掗崜浣圭暠 id锟?
- 濞戞挸绉烽々锕傚棘閺夋鏉婚柟瀛樼墪閸ㄥ綊姊介妶鍥╃煁濞寸姾顔愮槐杈ㄧ┍濠靛洤锟?skeleton 濞戞搩鍘剧划宥嗙閸撲焦鐣遍柡浣峰嵆閸ｆ椽濡存笟鈧妴搴㈡償韫囨挻锟?type 濞戞挸绉磋ぐ澶愬Υ?
- 缂備礁瀚▎?type 闊洤鎳橀妴蹇旂▔閵夛妇澹愬ù锝堟硶閺併倖绂掗妷銈囩憮闂傚棗妫楅幃搴ㄦ晬濞嗙暴ro, Stats, Testimonials, ValuePropositions, ProductPreview, FeatureHighlight, CTASection, FAQ, Logos
- props 閻庢稒顨嗛宀冪疀閸涙番鈧繒绮敃鈧幃?schema闁挎稑鑻悺褍鈻撻棃娑欏€冲ù锝堟硶锟?camelCase闁挎稑鐗呯欢銉︿繆?ctaText/ctaLink闁挎稑濂旂粭澶屾啺娴ｇ儤锟?cta_text/cta_link闁挎稑顦埀?
- 閺夆晜鏌ㄥú鏍偓鐟版湰锟?JSON闁挎稑濂旂粭澶屾啺?Markdown锟?

ProjectSchema:
${SCHEMA_STRING}

閺夊牊鎸搁崣?Skeleton JSON:
${skeletonJson}`;

  const copyPrompt = `濞达絿濮靛Σ?Track B: Copywriter闁靛棗鍊风紞姗€宕ｉ鍥╃炕闁告垹鍎ょ€垫粎绱掗崟顏咁偨 id 閻庝絻顕у鍐儍閸曨剚鐎俊妤€鐗愯棢濞戞挷绶ょ槐婵囩▔瀹ュ牜娲ｉ弶鍫熸尭閸ゎ厾鈧懓鏈弳锝嗐亜閻㈠憡妗ㄧ紓浣规尰閻庮垶锟?

閺夊牊鎸搁崵?JSON 闁哄秶鍘х槐锟犳晬?
{
  "payload": {
    "hero_01": { "title": "...", "subtitle": "...", "description": "...", "ctaText": "..." },
    "value_propositions_01": { "title": "...", "items": [ ... ] }
  }
}

缂佹拝闄勫顐︽晬?
- 闁告瑯浜ｉ崗妯绘綇閹惧啿姣夊☉鎾冲閺嬪啫顩奸崼銏＄ゲ闁稿繐纾▓鎴犫偓娑欘殕椤斿矂鏁嶉崸鐪巘le/subtitle/description/items[*].title/items[*].description/question/answer 缂佹稑顧€缁辨岸锟?
- 濞戞挸绉烽々锔芥綇閹惧啿姣夊Λ鐗堢矎婢瑰﹪濡存稊绯積me闁靛棔韬琭fect闁靛棔宸ign闁靛棔宸﹎age闁靛棔鍕緊go锟?
- 閺夆晜鏌ㄥú?JSON闁挎稑濂旂粭澶屾啺?Markdown锟?

閺夊牊鎸搁崣?Skeleton JSON:
${skeletonJson}`;

  const stylePrompt = `濞达絿濮靛Σ?Track C: Stylist闁靛棗鍊风紞姗€宕ｉ鍥╃炕闁告垹鍎ょ€垫粎绱掗崟顏咁偨 id 閻庝絻顕у鍐儍閸曨噮娼掗悷娆忣槷缁楀矂宕濋妸锔芥珡閻炴稏鍎扮粩鐢告晬鐏炶偐鐟濋悷鏇氭祰缁额參宕欓崫鍕殮闁轰焦鎸抽妴澶愭閵忋垻娉㈤柡瀣锟?

閺夊牊鎸搁崵?JSON 闁哄秶鍘х槐锟犳晬?
{
  "payload": {
    "hero_01": { "theme": "dark", "effect": "retro-grid", "align": "text-center", "image": "https://..." },
    "feature_highlight_01": { "align": "right", "image": "https://..." }
  }
}

缂佹拝闄勫顐︽晬?
- 闁告瑯浜ｉ崗妯绘綇閹惧啿姣夊☉鎾虫唉椤鎲存径灞剧ゲ闁稿繐鍟块悺褍鈻撶喊澶岀theme/effect/align/image/icon/logo 缂佹稑顧€缁辨岸锟?
- 闁哄倸娲﹂、宥団偓娑欘殕椤斿矂鎮惧▎鎴犺埗 Copywriter闁挎稑濂旂粭澶屾啺娴ｇ鏅搁梻鈧幐搴斀闁解偓婵劏锟?
- 閺夆晜鏌ㄥú?JSON闁挎稑濂旂粭澶屾啺?Markdown锟?

閺夊牊鎸搁崣?Skeleton JSON:
${skeletonJson}`;

  const [architectRaw, copyRaw, styleRaw] = await Promise.all([
    invokeRawWithProviderFallback([new SystemMessage(architectPrompt)], {
      operation: "parallel-architect",
      modelName: architectModelName,
      temperature: 0,
    }),
    invokeRawWithProviderFallback([new SystemMessage(copyPrompt)], {
      operation: "parallel-copywriter",
      modelName: copyModelName,
      temperature: 0.2,
    }),
    invokeRawWithProviderFallback([new SystemMessage(stylePrompt)], {
      operation: "parallel-stylist",
      modelName: styleModelName,
      temperature: 0.2,
    }),
  ]);

  let architectJson: any = skeleton;
  let copyJson: any = { payload: {} };
  let styleJson: any = { payload: {} };

  try {
    architectJson = parseLLMJson(architectRaw.content.toString());
  } catch (e) {
    console.error("Architect JSON Parse Error", e);
  }

  try {
    copyJson = parseLLMJson(copyRaw.content.toString());
  } catch (e) {
    console.error("Copywriter JSON Parse Error", e);
  }

  try {
    styleJson = parseLLMJson(styleRaw.content.toString());
  } catch (e) {
    console.error("Stylist JSON Parse Error", e);
  }

  return {
    messages: [new AIMessage({ id: generateMsgId(), content: "妫ｅ唭?婵繐绲藉﹢顏呮交濞戞粠鏀藉☉鎾愁槼閻箖宕¤箛搴ｇ▕闁汇垻鍠愰崹姘▔鎼达絿闂柛?.." })],
    project_json: architectJson,
    track_results: [copyJson, styleJson],
    phase: "stitcher",
  };
};

const stitcherNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Stitcher Node Started ---");
  if (!state.project_json) return { phase: "conversation" };
  const merged = stitchTracks(state.project_json, state.track_results || []);
  return {
    messages: [new AIMessage({ id: generateMsgId(), content: "妫ｅ唭?鐎瑰憡褰冮悾顒勫箣閹邦剛娼ｉ柟顑懐闂柛姘墳缁辨繂顫㈤敐鍛含閺夆晜绋栭、鎴犳嫚椤撴繄鐤呴悗闈涚秺缂嶅牊绋夋惔锝傗偓鏍ㄧ┍椤旂⒈锟?.." })],
    project_json: merged,
    phase: "liner",
  };
};

const linerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Liner Node Started ---");
  if (!state.project_json) return { phase: "conversation" };

  const project = structuredClone(state.project_json);

  if (!project.branding?.style?.typography) {
    project.branding = {
      ...project.branding,
      style: { ...(project.branding?.style || {}), typography: "Inter", borderRadius: project.branding?.style?.borderRadius || "sm" },
    };
  }

  if (!project.branding?.colors?.primary || !/^#[0-9A-F]{6}$/i.test(project.branding.colors.primary)) {
    project.branding = { ...project.branding, colors: { ...(project.branding?.colors || {}), primary: "#0052FF" } };
  }
  if (!project.branding?.colors?.accent || !/^#[0-9A-F]{6}$/i.test(project.branding.colors.accent)) {
    project.branding = { ...project.branding, colors: { ...(project.branding?.colors || {}), accent: "#22C55E" } };
  }

  for (const page of project.pages || []) {
    page.seo = page.seo || { title: `${project.branding?.name || "Website"} | ${page.path}`, description: "A professional website." };
    page.puckData = page.puckData || { root: { props: {} }, content: [] };
    page.puckData.root = page.puckData.root || { props: {} };
    page.puckData.root.props = page.puckData.root.props || {};
    const content = Array.isArray(page.puckData.content) ? page.puckData.content : [];

    page.puckData.content = content.map((comp: any) => {
      const next = { ...comp };
      next.type = normalizeComponentType(next.type);
      next.id = next.id || next.props?.id || generateMsgId();
      next.props = next.props || {};

      if (next.props.cta_text && !next.props.ctaText) next.props.ctaText = next.props.cta_text;
      if (next.props.cta_link && !next.props.ctaLink) next.props.ctaLink = next.props.cta_link;

      if (next.type === "Hero" && !next.props.title) next.props.title = "Welcome";
      if (next.type === "Stats" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ label: "Metric", value: "0", suffix: "" }];
      }
      if (next.type === "Testimonials" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ content: "Great results.", author: "Customer", role: "" }];
      }
      if (next.type === "ValuePropositions" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ title: "Benefit", description: "Description", icon: "Check" }];
      }
      if (next.type === "ProductPreview" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ title: "Item", description: "Description", image: "", tag: "" }];
      }
      if (next.type === "FAQ" && (!Array.isArray(next.props.items) || next.props.items.length === 0)) {
        next.props.items = [{ question: "Question", answer: "Answer" }];
      }

      return next;
    });
  }

  const validation = ProjectSchema.safeParse(project);
  const validationError = validation.success ? undefined : validation.error.message;
  const shouldExpand =
    Array.isArray(state.pages_to_expand) &&
    state.pages_to_expand.length > 0 &&
    state.current_page_index < state.pages_to_expand.length;

  return {
    project_json: project,
    validation_error: validationError,
    phase: shouldExpand ? "expanding" : "seo_optimization",
  };
};

// 3. Page Expansion Node: skill-first page expansion (HTML-first, no JSON section tree)
const pageExpansionNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  if (!state.project_json || !Array.isArray(state.pages_to_expand) || state.pages_to_expand.length === 0) {
    return { phase: "seo_optimization" };
  }

  const currentIndex = state.current_page_index;
  if (currentIndex >= state.pages_to_expand.length) {
    return { phase: "seo_optimization" };
  }

  const routePath = state.pages_to_expand[currentIndex];
  console.log(`--- Page Expansion Node: ${routePath} (${currentIndex + 1}/${state.pages_to_expand.length}) ---`);

  const pageIdx = state.project_json.pages.findIndex((page: any) => page.path === routePath);
  if (pageIdx < 0) {
    return {
      current_page_index: currentIndex + 1,
      phase: currentIndex + 1 >= state.pages_to_expand.length ? "seo_optimization" : "expanding",
    };
  }

  const currentPage = state.project_json.pages[pageIdx];
  const currentContent = Array.isArray(currentPage?.puckData?.content) ? currentPage.puckData.content : [];
  const previousPageSummaries = (state.project_json.pages || [])
    .slice(0, currentIndex)
    .map((page: any) => {
      const hero = (page?.puckData?.content || []).find((item: any) => item?.type === "Hero")?.props || {};
      const valueTitles = ((page?.puckData?.content || []).find((item: any) => item?.type === "ValuePropositions")?.props?.items || [])
        .slice(0, 3)
        .map((item: any) => item?.title)
        .filter(Boolean)
        .join(", ");
      return `${page.path}: ${page?.seo?.title || ""} | Hero=${hero?.title || ""} | Terms=${valueTitles || "(none)"}`;
    })
    .join("\n");
  const stylePreset = currentPage?.puckData?.root?.props?.stylePreset || state.design_hit?.style_preset || {};
  const workflowContext = state.workflow_context || {};
  const preferredLocale: "zh-CN" | "en" = workflowContext.preferredLocale || "en";
  const routeSpecificRule =
    routePath === "/contact"
      ? `- This is the contact page. You MUST include one real <form> element with fields for name, email, message, and a submit button.
- The form must be normal HTML form markup (no pseudo-code).`
      : routePath === "/news"
        ? `- This is the news page. Categories/tags MUST be rendered as semantic HTML list/tags (<ul>/<li> or styled tag container), not plain text separated by pipes.`
        : "- Use route-specific structure and avoid repeating the same section order as other pages.";
  const clip = (text: string | undefined, max = 2400) => {
    const raw = (text || "").trim();
    if (!raw) return "(none)";
    return raw.length <= max ? raw : `${raw.slice(0, max)}\n...[truncated]`;
  };
  const systemPrompt = `You are the page expansion executor in website-generation-workflow.
Task: generate a high-quality page for ONE route by following SKILL instructions as the source of truth.

Output contract (strict):
- Return ONLY HTML fragment for the page body (section/article/div blocks).
- Do NOT output JSON.
- Do NOT output Markdown fences.
- Do NOT output Markdown syntax like **bold**, # headings, or pipe-separated pseudo tables.
- Do NOT explain your answer.

Generation policy:
- Trust SKILL workflow and design rules first; avoid generic boilerplate.
- Return a complete page body that reflects the selected style and route intent.
- Keep this page distinct from previous pages while preserving brand/terminology continuity.
- Never output placeholder text like "Rich page narrative..." or "Next step for...".
- Primary language must be ${preferredLocale}. Do not mix Chinese and English in body copy except unavoidable technical terms (e.g., CNC, ISO, CE).
- Replace any seed placeholders with concrete, route-specific copy. Never return generic placeholders.
- Use semantic HTML only (section/article/div/h1-h4/p/ul/li/form/input/textarea/button etc.), no markdown text formatting.
${routeSpecificRule}

Branding:
${JSON.stringify(state.project_json.branding || {}, null, 2)}

Preferred locale:
${preferredLocale}

Style preset:
${JSON.stringify(stylePreset, null, 2)}

Route:
${routePath}

SEO target:
${JSON.stringify(currentPage?.seo || {}, null, 2)}

Approved outline:
${state.project_outline || "(none)"}

Design workflow rules (from skill):
${clip(workflowContext.sequentialWorkflow)}

Workflow guide (from skill):
${clip(workflowContext.workflowGuide, 1800)}

Design rule summary (from skill):
${clip(workflowContext.rulesSummary, 1800)}

Selection criteria (from skill):
${clip(workflowContext.selectionCriteria, 1200)}

Selected style DESIGN.md (from skill, authoritative visual semantics):
${clip(workflowContext.designMd, 2800)}

Previous page summaries:
${previousPageSummaries || "(none)"}

Current page seed blocks (for context only; you may redesign structure freely):
${JSON.stringify(currentContent.slice(0, 8), null, 2)}
`;

  let rawHtmlPatch: string | undefined;
  let errorMsg: string | undefined;

  try {
    const response = await invokeRawWithProviderFallback([new SystemMessage(systemPrompt)], {
      operation: `page-expansion-html:${routePath}`,
      temperature: 0.2,
    });
    rawHtmlPatch = sanitizeGeneratedHtml(extractHtmlFromModelResponse(response.content.toString()));
  } catch (error) {
    console.error(`Page Expansion Error (${routePath})`, error);
    errorMsg = `Failed to generate HTML for ${routePath}: ${error instanceof Error ? error.message : String(error)}; retrying once.`;
  }

  const needsRetry = !rawHtmlPatch;
  if (needsRetry) {
    const retryPrompt = `Your previous output for route ${routePath} was invalid.
Return ONLY HTML fragment for this route body.
No JSON. No Markdown. No explanations.
`;
    try {
      const retryResp = await invokeRawWithProviderFallback(
        [new SystemMessage(systemPrompt), new HumanMessage(retryPrompt)],
        {
          operation: `page-expansion-html-retry:${routePath}`,
          temperature: 0,
        },
      );
      rawHtmlPatch = sanitizeGeneratedHtml(extractHtmlFromModelResponse(retryResp.content.toString()));
      if (!rawHtmlPatch) {
        errorMsg = `${errorMsg || ""} Retry returned empty HTML.`.trim();
      } else {
        errorMsg = undefined;
      }
    } catch (retryError) {
      const retryReason = retryError instanceof Error ? retryError.message : String(retryError);
      errorMsg = `${errorMsg || ""} Retry failed: ${retryReason}`.trim();
    }
  }
  const nextPageContent = rawHtmlPatch ? [] : currentContent;
  const navLabel = getRouteLabel(routePath, preferredLocale);

  const nextProject = { ...state.project_json };
  nextProject.pages = [...nextProject.pages];
  nextProject.pages[pageIdx] = {
    ...currentPage,
    seo: {
      ...(currentPage.seo || {}),
      navLabel,
      menuLabel: navLabel,
    },
    puckData: {
      ...(currentPage.puckData || {}),
      root: {
        ...(currentPage.puckData?.root || {}),
        props: {
          ...(currentPage.puckData?.root?.props || {}),
          ...(rawHtmlPatch ? { rawHtml: rawHtmlPatch } : {}),
        },
      },
      content: nextPageContent,
    },
  };

  const isLastPage = currentIndex === state.pages_to_expand.length - 1;
  return {
    messages: [
      new AIMessage({
        id: generateMsgId(),
        content: errorMsg
          ? `Expansion for ${routePath} failed to return usable HTML. Kept previous content. ${errorMsg}`
          : rawHtmlPatch
            ? `Expanded ${routePath} with skill code-first HTML (${currentIndex + 1}/${state.pages_to_expand.length}).`
            : `Expanded ${routePath} without changes (empty output returned).`,
      }),
    ],
    project_json: nextProject,
    current_page_index: currentIndex + 1,
    phase: isLastPage ? "seo_optimization" : "expanding",
    validation_error: errorMsg,
  };
};

// 4. SEO Node: deterministic metadata fill (no second-pass LLM rewrite)
const seoNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- SEO Node Started ---");
  if (!state.project_json) return { phase: "linter" };

  const projectJson = structuredClone(state.project_json);
  const brandName = toSafeText(projectJson.branding?.name || "Website").trim() || "Website";
  const preferredLocale: "zh-CN" | "en" = state.workflow_context?.preferredLocale || "en";

  const keywords = new Set<string>();
  const updatedPages = (projectJson.pages || []).map((page: any) => {
    const routePath = normalizeRoutePath(String(page?.path || "/"));
    const routeTitle = getRouteLabel(routePath, preferredLocale);
    const existingTitle = toSafeText(page?.seo?.title).trim();
    const existingDescription = toSafeText(page?.seo?.description).trim();
    const navLabelRaw = toSafeText(page?.seo?.navLabel || page?.seo?.menuLabel).trim();
    const navLabel =
      preferredLocale === "zh-CN" ? getRouteLabel(routePath, "zh-CN") : navLabelRaw || routeTitle;

    const content = Array.isArray(page?.puckData?.content) ? page.puckData.content : [];
    const hero = content.find((item: any) => normalizeComponentType(item?.type) === "Hero");
    const heroTitle = toSafeText(hero?.props?.title).trim();
    const heroDescription = toSafeText(hero?.props?.description || hero?.props?.subtitle).trim();

    const title = existingTitle || `${routeTitle} | ${brandName}`;
    const description =
      existingDescription ||
      (heroDescription ? `${heroDescription}`.slice(0, 155) : `${brandName} ${routeTitle} page.`.slice(0, 155));

    if (routeTitle) keywords.add(routeTitle.toLowerCase());
    if (heroTitle) {
      heroTitle
        .split(/[^a-zA-Z0-9\u4e00-\u9fff]+/)
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 3)
        .slice(0, 8)
        .forEach((token) => keywords.add(token));
    }

    return {
      ...page,
      path: routePath,
      seo: {
        ...(page?.seo || {}),
        title,
        description,
        navLabel,
        menuLabel: navLabel,
      },
    };
  });

  projectJson.pages = updatedPages;
  const injected = injectOrganizationJsonLd(projectJson);
  return {
    messages: [new AIMessage({ id: generateMsgId(), content: "Applied deterministic SEO metadata normalization." })],
    project_json: injected,
    seo_keywords: Array.from(keywords).slice(0, 16),
    phase: "linter",
  };
};
const injectContactFormDeploymentProps = (projectJson: any, actionUrl: string, siteKey: string) => {
  if (!projectJson?.pages || !Array.isArray(projectJson.pages)) return projectJson;

  const cloned = structuredClone(projectJson);
  for (const page of cloned.pages) {
    if (!page?.puckData?.content || !Array.isArray(page.puckData.content)) continue;

    for (const component of page.puckData.content) {
      if (component?.type !== "ContactForm") continue;
      component.props = {
        ...(component.props || {}),
        actionUrl,
        siteKey,
      };
    }

    const rawHtml = page?.puckData?.root?.props?.rawHtml;
    if (typeof rawHtml === "string" && rawHtml.trim() && page.path === "/contact") {
      const safeAction = escapeHtmlAttr(actionUrl);
      const safeSiteKey = escapeHtmlAttr(siteKey);
      let patchedHtml = rawHtml;

      if (/<form\b/i.test(patchedHtml)) {
        patchedHtml = patchedHtml.replace(/<form\b[^>]*>/i, (tag) => {
          const stripped = tag
            .replace(/\saction=(['"]).*?\1/gi, "")
            .replace(/\smethod=(['"]).*?\1/gi, "")
            .replace(/\sdata-sitekey=(['"]).*?\1/gi, "");
          return stripped.replace(
            ">",
            ` method="post" action="${safeAction}" data-sitekey="${safeSiteKey}">`,
          );
        });
      } else {
        patchedHtml += `
<section class="contact-form">
  <h2>Contact Us</h2>
  <form method="post" action="${safeAction}" data-sitekey="${safeSiteKey}">
    <input type="text" name="name" placeholder="Name" required />
    <input type="email" name="email" placeholder="Email" required />
    <textarea name="message" rows="5" placeholder="Message" required></textarea>
    <button type="submit">Send</button>
  </form>
</section>`;
      }

      page.puckData = page.puckData || {};
      page.puckData.root = page.puckData.root || {};
      page.puckData.root.props = page.puckData.root.props || {};
      page.puckData.root.props.rawHtml = patchedHtml;
    }
  }

  return cloned;
};

const hasPlaceholderCopy = (projectJson: any) => {
  if (!projectJson) return false;

  const patterns = [
    /Rich page narrative for\s+\/?/i,
    /Refined SEO metadata for\s+\/?/i,
    /Next step for\s+\/?/i,
    /\[object Object\]/i,
    /\bPlaceholder\b/i,
    /\bCall to Action\b/i,
    /\bImage Placeholder\b/i,
    /\bQuestion\b/i,
    /\bAnswer\b/i,
    /\bBenefit\b/i,
    /\bMetric\b/i,
    /\bTestimonial\b/i,
  ];

  const stack: any[] = [projectJson];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === "string") {
      if (patterns.some((pattern) => pattern.test(current))) return true;
      continue;
    }
    if (!current || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    for (const value of Object.values(current)) stack.push(value);
  }

  return false;
};

const getProjectContentQualityIssues = (projectJson: any) => {
  if (!projectJson?.pages || !Array.isArray(projectJson.pages)) return [] as string[];

  const issues: string[] = [];
  for (const page of projectJson.pages) {
    const routePath = normalizeRoutePath(String(page?.path || "/"));
    const content = Array.isArray(page?.puckData?.content) ? page.puckData.content : [];
    const rawHtml = typeof page?.puckData?.root?.props?.rawHtml === "string" ? page.puckData.root.props.rawHtml : "";

    const textBucket: string[] = [];
    if (rawHtml) textBucket.push(rawHtml);
    const stack: any[] = [page?.seo || {}, ...content];
    while (stack.length > 0) {
      const current = stack.pop();
      if (typeof current === "string") {
        const trimmed = current.trim();
        if (trimmed) textBucket.push(trimmed);
        continue;
      }
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) {
        for (const item of current) stack.push(item);
        continue;
      }
      for (const value of Object.values(current)) stack.push(value);
    }

    const joined = textBucket.join(" ");
    const cjkCount = countMatches(joined, /[\u4e00-\u9fff]/g);
    const latinCount = countMatches(joined, /[a-zA-Z]/g);
    const hasMixedLangHeavy = cjkCount >= 80 && latinCount >= 120;
    const hasPlaceholder = hasPlaceholderCopy({ pages: [page] });
    const tooThin = !rawHtml && (content.length < 2 || joined.length < 220);
    const emptyPage = !rawHtml && content.length === 0;

    if (emptyPage) {
      issues.push(`${routePath}: empty_page`);
      continue;
    }
    if (hasPlaceholder) issues.push(`${routePath}: placeholder_copy`);
    if (tooThin) issues.push(`${routePath}: low_content_density`);
    if (hasMixedLangHeavy) issues.push(`${routePath}: mixed_language`);
  }

  return issues;
};

const deployNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    console.log("--- Deploy Node Started ---");
    
    if (!state.project_json) {
        return {
            messages: [new AIMessage({ 
                id: generateMsgId(),
                content: "Deployment failed: no website configuration found. Please generate a preview first."
            })],
            phase: "end"
        };
    }

    const qualityIssues = getProjectContentQualityIssues(state.project_json);
    if (hasPlaceholderCopy(state.project_json) || qualityIssues.length > 0) {
        return {
            messages: [new AIMessage({
                id: generateMsgId(),
                content: `Detected incomplete generated content. Deployment has been blocked. Issues: ${qualityIssues.join(", ") || "placeholder copy detected"}. Please generate real page content first.`,
            })],
            phase: "conversation",
        };
    }


    if (!state.user_id) {
        return {
            messages: [new AIMessage({
                id: generateMsgId(),
                content: "Please sign in to your Shpitto account before deployment so the site can be bound to your account.",
            })],
            phase: "end"
        };
    }

    const d1 = getD1Client();
    if (!d1.isConfigured()) {
        return {
            messages: [new AIMessage({
                id: generateMsgId(),
                content: "Cloudflare D1 is not configured. Configure CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / CLOUDFLARE_D1_DATABASE_ID first.",
            })],
            phase: "end",
        };
    }

    const r2 = getR2Client();
    if (!r2.isConfigured()) {
        return {
            messages: [new AIMessage({
                id: generateMsgId(),
                content: "Cloudflare R2 is not configured. Configure R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY first.",
            })],
            phase: "end",
        };
    }

    try {
        // Normalize project name
        const rawName = state.project_json.branding?.name?.toLowerCase() || 'site';
        const sanitizedName = rawName
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        
        // Strategy: Consistent Project Name (Req 6)
        // If we have a user_id, use it to namespace the project so it persists across sessions.
        // If anonymous, use a session-unique ID (which means reloading the page might lose it, but that's expected for anon).
        let projectSuffix = "";
        if (state.user_id) {
            // Use first 8 chars of user_id for stability
            projectSuffix = `-${state.user_id.slice(0, 8)}`;
        } else {
            // Fallback for anonymous: Use a hash of the name? No, that collides.
            // Use a random ID, but ideally we want to keep it if we redeploy in same session.
            // We can check if we already have a deployed_url and extract it?
            // Or just generate a new one for now.
            projectSuffix = `-${generateMsgId()}`;
        }
        
        // Ensure name isn't too long (Cloudflare limit 58 chars)
        // Prefix "shpitto-" (9 chars) + suffix (9 chars) = 18 chars reserved.
        // Max name length = 40.
        const safeName = sanitizedName.slice(0, 35);
        const projectName = `shpitto-${safeName}${projectSuffix}`;
        
        console.log(`[Deploy] Target Project: ${projectName}`);
        
        // 1) Persist project in D1 first so we have a stable project_id.
        let dbProjectId: string | undefined = state.db_project_id;
        console.log(`[Deploy] Saving project state to D1 (User: ${state.user_id})...`);
        dbProjectId = await saveProjectState(state.user_id, state.project_json, state.access_token, state.db_project_id);
        console.log(`[Deploy] Project saved. ID: ${dbProjectId}`);
        if (!dbProjectId) {
            throw new Error("Failed to persist project into D1.");
        }

        const url = `https://${projectName}.pages.dev`;
        let deployProjectJson = state.project_json;
        let siteKey: string | undefined;

        // 2) Bind generated site to current account/user (one account -> many sites).
        siteKey = await upsertProjectSiteBinding(dbProjectId, state.user_id, url);
        const contactActionUrl = buildContactActionUrl(siteKey);
        deployProjectJson = injectContactFormDeploymentProps(state.project_json, contactActionUrl, siteKey);
        dbProjectId = await saveProjectState(state.user_id, deployProjectJson, state.access_token, dbProjectId);

        // Notify frontend
        const startMessage = new AIMessage({
            id: generateMsgId(),
            content: "Starting one-click deployment. Please wait...",
            tool_calls: [{
                id: `call_${generateMsgId()}`,
                name: "startDeployment",
                args: {}
            }]
        });

        const bundle = await Bundler.createBundle(deployProjectJson);

        // 3) Archive generated artifacts to R2.
        let r2BundlePrefix: string | undefined;
        const archive = await archiveSiteArtifactsToR2({
            projectId: dbProjectId,
            ownerUserId: state.user_id,
            projectJson: deployProjectJson,
            bundle: {
                manifest: bundle.manifest,
                fileEntries: bundle.fileEntries.map((entry) => ({
                    path: entry.path,
                    content: entry.content,
                    type: entry.type,
                })),
            },
        });
        if (archive?.prefix) r2BundlePrefix = archive.prefix;
        
        console.log(`[Deploy] Uploading to Cloudflare...`);
        const cf = new CloudflareClient();
        
        // 2. Create/Get Cloudflare Project
        await cf.createProject(projectName);
        
        // 3. Upload deployment
        await cf.uploadDeployment(projectName, bundle);

        console.log(`[Deploy] 锟?Deployed to: ${url}`);

        // 4) Record deployment metadata in D1.
        await recordDeployment(dbProjectId, url, "production", state.access_token, r2BundlePrefix);

        const actions = [
            {
                text: "View Live Site",
                payload: url,
                type: "url"
            }
        ];

        const deployedDesignHit = state.design_hit || deployProjectJson?.skillHit;
        const deployedDesignHint = deployedDesignHit
            ? `\nDesign Skill: ${deployedDesignHit.id}\nDesign Desc: ${deployedDesignHit.design_desc}`
            : "";

        return {
            messages: [
                startMessage,
                new AIMessage({ 
                    id: generateMsgId(), 
                    content: `Deployment successful: ${url}${siteKey ? `\nSite Key: ${siteKey}` : ""}${deployedDesignHint}`,
                    additional_kwargs: {
                        actions
                    },
                    tool_calls: [{
                        id: `call_${generateMsgId()}`,
                        name: "presentActions",
                        args: { actions }
                    }]
                }),
                new AIMessage({
                    id: generateMsgId(),
                    content: "",
                    tool_calls: [{
                        id: `call_${generateMsgId()}`,
                        name: "notifyDeploymentStatus",
                        args: { 
                            status: "success", 
                            url: url, 
                            message: "Deployment successful!" 
                        }
                    }]
                })
            ],
            deployed_url: url,
            phase: "end",
            db_project_id: dbProjectId,
            project_json: deployProjectJson
        };
    } catch (error: any) {
        console.error("Deploy Node Error:", error);
        return {
            messages: [new AIMessage({
                id: generateMsgId(),
                content: `Deployment failed: ${error?.message || "unknown error"}`
            })],
            phase: "end"
        };
    }
};

const linterNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- Linter Node Started ---");
  if (!state.project_json) {
    return {
      messages: [new AIMessage({ id: generateMsgId(), content: "No preview data found. Please generate the website first." })],
      phase: "conversation",
    };
  }

  const projectWithSkillHit =
    state.design_hit && !state.project_json?.skillHit
      ? { ...state.project_json, skillHit: state.design_hit }
      : state.project_json;

  const validation = ProjectSchema.safeParse(projectWithSkillHit);
  const validationError = validation.success ? undefined : validation.error.message;
  const qualityIssues = getProjectContentQualityIssues(projectWithSkillHit);
  const hasQualityIssues = qualityIssues.length > 0;
  const designHit = state.design_hit || projectWithSkillHit?.skillHit;
  const designHitText = designHit
    ? `\n\nDesign Skill Hit\n- ID: ${designHit.id}\n- Name: ${designHit.name}\n- Design_Desc: ${designHit.design_desc}`
    : "";
  const projectForOutput = validation.success ? validation.data : projectWithSkillHit;
  const currentAttempt = Number(state.attempt_count || 0);
  const maxAutoReexpandPasses = Number(process.env.LLM_AUTO_REEXPAND_MAX_PASSES || 1);
  const isSkillDirect = state.workflow_context?.generationMode === "skill-direct";
  const canAutoReexpand =
    !isSkillDirect && hasQualityIssues && currentAttempt < Math.max(0, maxAutoReexpandPasses);

  if (canAutoReexpand) {
    const issueRoutes = Array.from(
      new Set(
        qualityIssues
          .map((issue) => issue.split(":")[0]?.trim())
          .filter((route) => typeof route === "string" && route.length > 0),
      ),
    );
    if (issueRoutes.length > 0) {
      return {
        messages: [
          new AIMessage({
            id: generateMsgId(),
            content: `Detected low-quality generated pages (${qualityIssues.join(", ")}). Running one additional expansion pass for affected routes.`,
          }),
        ],
        project_json: projectForOutput,
        pages_to_expand: issueRoutes,
        current_page_index: 0,
        attempt_count: currentAttempt + 1,
        validation_error: validationError || qualityIssues.join("; "),
        phase: "expanding",
      };
    }
  }

  const actions = [
    {
      text: "Deploy to Cloudflare",
      payload: "deploy",
      type: "button",
    },
  ];

  return {
    messages: [
      new AIMessage({
        id: generateMsgId(),
        content: validationError
          ? `Preview generated, but schema validation still reports issues. You can review the result and continue refining.${designHitText}`
          : hasQualityIssues
            ? `Preview generated, but content quality checks found issues (${qualityIssues.join(", ")}). Please regenerate or refine before deployment.${designHitText}`
            : `Preview generated successfully. You can request edits or deploy directly.${designHitText}`
          ,
        additional_kwargs: { actions },
        tool_calls: [{ id: `call_actions_${generateMsgId()}`, name: "presentActions", args: { actions } }],
      }),
      new AIMessage({
        id: generateMsgId(),
        content: "",
        additional_kwargs: { projectJson: projectForOutput },
        tool_calls: [
          { id: `call_preview_${generateMsgId()}`, name: "showWebsitePreview", args: { projectJson: projectForOutput } },
        ],
      }),
    ],
    project_json: projectForOutput,
    validation_error: validationError || (hasQualityIssues ? qualityIssues.join("; ") : undefined),
    phase: "end",
  };
};
// 6. Image Update Node: Scans for image placeholders and requests updates
const imageUpdateNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    console.log("--- Image Update Node Started ---");
    if (!state.project_json) return { phase: "end" };

    // Scan all pages for components with image props
    const imageSlots: any[] = [];
    state.project_json.pages.forEach((page: any) => {
        page.puckData?.content?.forEach((comp: any) => {
            if (comp.props?.image) {
                imageSlots.push({
                    id: comp.id || `${comp.type}-${Math.random().toString(36).substr(2, 9)}`,
                    page: page.path,
                    section: comp.props.title || comp.type,
                    currentUrl: comp.props.image,
                    type: "single"
                });
            }
            if (comp.props?.items) {
                comp.props.items.forEach((item: any, idx: number) => {
                    if (item.image) {
                        imageSlots.push({
                            id: `${comp.id}-item-${idx}`,
                            page: page.path,
                            section: `${comp.props.title || comp.type} - Item ${idx + 1}`,
                            currentUrl: item.image,
                            type: "item"
                        });
                    }
                    if (item.logo) {
                        imageSlots.push({
                            id: `${comp.id}-logo-${idx}`,
                            page: page.path,
                            section: `${comp.props.title || comp.type} - Logo ${idx + 1}`,
                            currentUrl: item.logo,
                            type: "logo"
                        });
                    }
                });
            }
        });
    });

    if (imageSlots.length === 0) return { phase: "end" };

    const actions = [
        {
            text: "妫ｅ啯鐓犻柨?Update Website Images",
            payload: {
                type: "image_update",
                slots: imageSlots
            },
            type: "form"
        }
    ];

    console.log(`[Image Update] Found ${imageSlots.length} image slots.`);

    return {
        messages: [
            new AIMessage({
                id: generateMsgId(),
                content: `Website content is ready. I found ${imageSlots.length} image slots that can be replaced with your assets.`,
                tool_calls: [{
                    id: `call_${generateMsgId()}`,
                    name: "presentActions",
                    args: { actions }
                }]
            })
        ],
        phase: "end"
    };
};

// --- Graph Construction ---

const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => [],
    },
    phase: {
        value: (x: string, y: string) => y ?? x,
        default: () => "conversation",
    },
    project_outline: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => "",
    },
    project_json: {
        value: (x?: any, y?: any) => y ?? x,
        default: () => null,
    },
    track_results: {
        value: (x?: any[], y?: any[]) => y ?? x,
        default: () => [],
    },
    sitemap: {
        value: (x?: any, y?: any) => y ?? x,
        default: () => undefined,
    },
    industry: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    },
    theme: {
        value: (x?: any, y?: any) => y ?? x,
        default: () => undefined,
    },
    history: {
        value: (x?: string[], y?: string[]) => y ?? x,
        default: () => [],
    },
    pages_to_expand: {
        value: (x?: string[], y?: string[]) => y ?? x,
        default: () => [],
    },
    current_page_index: {
        value: (x: number, y: number) => y,
        default: () => 0,
    },
    seo_keywords: {
        value: (x?: string[], y?: string[]) => y ?? x,
        default: () => [],
    },
    validation_error: {
        value: (x?: string, y?: string) => y,
        default: () => undefined,
    },
    attempt_count: {
        value: (x: number, y: number) => y,
        default: () => 0,
    },
    deployed_url: {
        value: (x?: string, y?: string) => y,
        default: () => undefined,
    },
    user_id: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    },
    access_token: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    },
    db_project_id: {
        value: (x?: string, y?: string) => y ?? x,
        default: () => undefined,
    },
    design_hit: {
        value: (x?: DesignSkillHit, y?: DesignSkillHit) => y ?? x,
        default: () => undefined,
    },
    workflow_context: {
        value: (x?: AgentState["workflow_context"], y?: AgentState["workflow_context"]) => y ?? x,
        default: () => undefined,
    }
  }
})
  .addNode("conversation", conversationNode)
  .addNode("skeleton", skeletonNode)
  .addNode("expanding", pageExpansionNode)
  .addNode("seo_optimization", seoNode)
  .addNode("linter", linterNode)
  .addNode("deploy", deployNode);

workflow.addEdge(START, "conversation");

workflow.addConditionalEdges(
  "conversation",
  (state) => {
      if (state.phase === "skeleton") return "skeleton";
      if (state.phase === "deploy") return "deploy";
      return END;
  }
);

workflow.addConditionalEdges("skeleton", (state) => {
  if (!state.project_json || state.phase === "conversation") return "conversation";
  if (state.phase === "expanding") return "expanding";
  if (state.phase === "seo_optimization") return "seo_optimization";
  return "linter";
});
workflow.addConditionalEdges("expanding", (state) =>
  state.phase === "expanding" ? "expanding" : "seo_optimization"
);

workflow.addEdge("seo_optimization", "linter");
workflow.addEdge("deploy", END);
workflow.addConditionalEdges("linter", (state) =>
  state.phase === "expanding" ? "expanding" : END
);

export const graph = workflow.compile();


