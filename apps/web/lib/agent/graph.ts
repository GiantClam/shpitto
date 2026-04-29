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
  syncProjectCustomDomainOrigin,
  upsertProjectSiteBinding,
} from "./db";
import { getD1Client } from "../d1";
import { getR2Client } from "../r2";
import { injectOrganizationJsonLd, normalizeComponentType, stitchTracks } from "./engine";
import { loadWorkflowSkillContext, type DesignSkillHit } from "./website-workflow";
import type { RequirementSpec } from "./chat-orchestrator";
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
        "openai/gpt-5.4-mini",
      fallbackModelName:
        process.env.LLM_MODEL_FALLBACK_AIBERM ||
        process.env.AIBERM_MODEL_FALLBACK ||
        process.env.LLM_MODEL_FALLBACK ||
        "openai/gpt-5.4",
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
  site_artifacts?: any; // Skill-native static site artifacts
  track_results?: any[];
  sitemap?: any;
  industry?: string;
  theme?: { primaryColor: string; mode: "dark" | "light" } | undefined;
  history?: string[];
  pages_to_expand?: string[];
  current_page_index: number;
  seo_keywords?: string[];
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
    generationMode?: "legacy" | "skill-direct" | "skill-native";
    runMode?: "sync" | "async-task";
    genMode?: "skill_native" | "legacy";
    sourceRequirement?: string;
    skillId?: string;
    refineSkillId?: string;
    skillDirective?: string;
    skillMdPath?: string;
    chatTaskId?: string;
    chatId?: string;
    workerId?: string;
    lockedProvider?: string;
    lockedModel?: string;
    stylePreset?: any;
    designSystemId?: string;
    designSystemName?: string;
    designSelectionReason?: string;
    designOverrides?: Record<string, unknown>;
    designConfirmed?: boolean;
    conversationStage?: "drafting" | "previewing" | "deployed" | "deploying";
    executionMode?: "generate" | "refine" | "deploy";
    intent?: string;
    intentConfidence?: number;
    intentReason?: string;
    refineRequested?: boolean;
    refineSourceProjectPath?: string;
    refineSourceTaskId?: string;
    requirementCompletionPercent?: number;
    requirementSlots?: Array<{ key: string; label: string; filled: boolean; evidence?: string }>;
    requirementSpec?: RequirementSpec;
    requirementPatchPlan?: unknown;
    requirementRevision?: number;
    supersededMessages?: string[];
    correctionSummary?: string[];
    canonicalPrompt?: string;
    promptControlManifest?: unknown;
    requirementAggregatedText?: string;
    latestUserText?: string;
    latestUserTextRaw?: string;
    referencedAssets?: string[];
    assumedDefaults?: string[];
    deployRequested?: boolean;
    deploySourceProjectPath?: string;
    deploySourceTaskId?: string;
    checkpointProjectPath?: string;
    smoke?: unknown;
    publishedAssetVersion?: string;
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
  const trimmed = raw.trim().replace(/[\s,.;]+$/g, "");
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
    "/": "\u9996\u9875",
    "/company": "\u516c\u53f8",
    "/products": "\u4ea7\u54c1",
    "/news": "\u8d44\u8baf",
    "/cases": "\u6848\u4f8b",
    "/contact": "\u8054\u7cfb",
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
        .split(/[|,閵嗕緤绱?]/g)
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
            title: toSafeText((entry as any).title || safeProps.title || "Categories"),
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
      lastHumanLower.includes("deploy now") ||
      lastHumanLower.includes("publish now");

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
        nextPhase = "conversation";
        finalMessage =
          "Plan confirmed. Generation is handled by async task runtime (worker), not graph inline execution.";
        console.log("[System] User approved plan. Graph stays orchestration-only.");
    } else if (intent === "deploy" && state.phase === "end" && !state.deployed_url) {
        nextPhase = "deploy";
        console.log("[System] User requested deployment. Transitioning to Deploy phase...");
    } else if (intent === "deploy" && state.phase === "end" && state.deployed_url) {
        // Already deployed, just show the link
        nextPhase = "conversation"; 
        finalMessage = "The website has already been deployed successfully. You can open it from the link above.";
        console.log("[System] User requested deployment but site is already live.");
    } else if (intent === "propose_plan") {
        nextPhase = "conversation"; 
        console.log("[Planner] Plan Proposed/Updated.");
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

const UNKNOWN_TOKEN_RE = /<\s*unknown\s*>/i;

const hasUnknownToken = (value: unknown): boolean => UNKNOWN_TOKEN_RE.test(String(value || ""));

const toBundleRoutePath = (routePath: string) =>
  routePath === "/" ? "index.html" : `${routePath.replace(/^\//, "")}/index.html`;

const ensureNavLinks = (paths: string[], locale: "zh-CN" | "en") =>
  paths.map((path) => ({
    path,
    href: `/${toBundleRoutePath(path)}`,
    label: getRouteLabel(path, locale),
  }));

type SkillDirectValidationResult = {
  pageByPath: Map<string, { path: string; title: string; description: string; navLabel?: string; bodyHtml: string }>;
};

const validateSkillDirectOutput = (
  output: SkillDirectSiteOutput,
  requiredPaths: string[],
): SkillDirectValidationResult => {
  const pageByPath = new Map(
    (output.site.pages || []).map((page) => [normalizeRoutePath(String(page.path || "/")), page]),
  );

  const missing = requiredPaths
    .map((routePath) => normalizeRoutePath(routePath))
    .filter((routePath) => !pageByPath.has(routePath));
  if (missing.length > 0) {
    throw new Error(`skill-direct output missing required routes: ${missing.join(", ")}`);
  }

  for (const routePath of requiredPaths.map((x) => normalizeRoutePath(x))) {
    const page = pageByPath.get(routePath);
    if (!page) {
      throw new Error(`skill-direct output missing route: ${routePath}`);
    }

    if (
      hasUnknownToken(page.title) ||
      hasUnknownToken(page.description) ||
      hasUnknownToken(page.bodyHtml) ||
      hasUnknownToken(page.navLabel)
    ) {
      throw new Error(`skill-direct output contains <UNKNOWN> token at route: ${routePath}`);
    }

    const safeBody = sanitizeGeneratedHtml(page.bodyHtml);
    if (!safeBody || safeBody.length < 80) {
      throw new Error(`skill-direct output bodyHtml is empty/thin at route: ${routePath}`);
    }
  }

  return { pageByPath };
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
  <div><h4>${escapeHtmlAttr(input.lang === "zh-CN" ? "\u5bfc\u822a" : "Navigation")}</h4>${input.navLinks
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
        input.lang === "zh-CN" ? "\u7acb\u5373\u54a8\u8be2" : "Request Quote",
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

// Legacy expansion/SEO/skeleton generation nodes were removed from the default graph runtime path.
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
    const sourceProject = (state.project_json || (state as any).site_artifacts) as any;
    
    if (!sourceProject) {
        return {
            messages: [new AIMessage({ 
                id: generateMsgId(),
                content: "Deployment failed: no website configuration found. Please generate a preview first."
            })],
            phase: "end"
        };
    }

    const qualityIssues = getProjectContentQualityIssues(sourceProject);
    if (hasPlaceholderCopy(sourceProject) || qualityIssues.length > 0) {
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
        const rawName = sourceProject.branding?.name?.toLowerCase() || 'site';
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
        dbProjectId = await saveProjectState(state.user_id, sourceProject, state.access_token, state.db_project_id);
        console.log(`[Deploy] Project saved. ID: ${dbProjectId}`);
        if (!dbProjectId) {
            throw new Error("Failed to persist project into D1.");
        }

        const url = `https://${projectName}.pages.dev`;
        let deployProjectJson = sourceProject;
        let siteKey: string | undefined;

        // 2) Bind generated site to current account/user (one account -> many sites).
        siteKey = await upsertProjectSiteBinding(dbProjectId, state.user_id, url);
        const contactActionUrl = buildContactActionUrl(siteKey);
        deployProjectJson = injectContactFormDeploymentProps(sourceProject, contactActionUrl, siteKey);
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

        console.log(`[Deploy] 闂?Deployed to: ${url}`);

        // 4) Record deployment metadata in D1.
        await syncProjectCustomDomainOrigin(dbProjectId, state.user_id, `${projectName}.pages.dev`);
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
            project_json: deployProjectJson,
            site_artifacts: deployProjectJson,
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
    site_artifacts: {
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
  .addNode("deploy", deployNode);

workflow.addEdge(START, "conversation");

workflow.addConditionalEdges(
  "conversation",
  (state) => {
      if (state.phase === "deploy") return "deploy";
      return END;
  }
);
workflow.addEdge("deploy", END);

export const graph = workflow.compile();



