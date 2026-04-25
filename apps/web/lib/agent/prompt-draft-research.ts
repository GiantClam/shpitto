import OpenAI from "openai";
import { composeStructuredPrompt, type RequirementSlot } from "./chat-orchestrator";
import { resolveRunProviderLock, type ProviderName } from "../skill-runtime/provider-lock.ts";
import {
  resolveSerperSearchConfigFromEnv,
  searchSerperBatch,
  type SerperSearchConfig,
  type WebSearchSource,
} from "../tools/web-search/serper.ts";

export type PromptDraftSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type PromptDraftBuildResult = {
  promptDraft: string;
  usedWebSearch: boolean;
  researchSummary?: string;
  sources: PromptDraftSource[];
  model?: string;
  provider?: ProviderName;
  draftMode?: "template" | "llm" | "llm_web_search";
  fallbackReason?: string;
};

type DraftProviderConfig = {
  provider: ProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
  fallbackModel?: string;
};

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function safeJsonParse<T>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function resolveDraftProviderConfig(): { config?: DraftProviderConfig; reason?: string } {
  const lock = resolveRunProviderLock({
    provider: process.env.CHAT_DRAFT_PROVIDER || process.env.SKILL_NATIVE_PROVIDER_LOCK,
    model: process.env.CHAT_DRAFT_MODEL || process.env.SKILL_NATIVE_MODEL_LOCK,
  });

  if (lock.provider === "aiberm") {
    const apiKey = normalizeText(process.env.AIBERM_API_KEY);
    if (!apiKey) return { reason: "missing_provider_api_key:aiberm" };
    return {
      config: {
        provider: "aiberm",
        apiKey,
        baseURL: normalizeText(process.env.AIBERM_BASE_URL) || "https://aiberm.com/v1",
        model:
          normalizeText(process.env.CHAT_DRAFT_MODEL) ||
          normalizeText(lock.model) ||
          normalizeText(process.env.LLM_MODEL_AIBERM) ||
          normalizeText(process.env.AIBERM_MODEL) ||
          normalizeText(process.env.LLM_MODEL) ||
          "openai/gpt-5.3-codex",
        fallbackModel:
          normalizeText(process.env.CHAT_DRAFT_FALLBACK_MODEL) ||
          normalizeText(process.env.LLM_MODEL_FALLBACK_AIBERM) ||
          undefined,
      },
    };
  }

  const crazyrouteKey =
    normalizeText(process.env.CRAZYROUTE_API_KEY) ||
    normalizeText(process.env.CRAZYROUTER_API_KEY) ||
    normalizeText(process.env.CRAZYREOUTE_API_KEY);
  if (!crazyrouteKey) return { reason: "missing_provider_api_key:crazyroute" };
  return {
    config: {
      provider: "crazyroute",
      apiKey: crazyrouteKey,
      baseURL:
        normalizeText(process.env.CRAZYROUTE_BASE_URL) ||
        normalizeText(process.env.CRAZYROUTER_BASE_URL) ||
        normalizeText(process.env.CRAZYREOUTE_BASE_URL) ||
        "https://crazyrouter.com/v1",
      model:
        normalizeText(process.env.CHAT_DRAFT_MODEL) ||
        normalizeText(lock.model) ||
        normalizeText(process.env.LLM_MODEL_CRAZYROUTE) ||
        normalizeText(process.env.LLM_MODEL_CRAZYROUTER) ||
        normalizeText(process.env.LLM_MODEL_CRAZYREOUTE) ||
        normalizeText(process.env.CRAZYROUTE_MODEL) ||
        normalizeText(process.env.CRAZYROUTER_MODEL) ||
        normalizeText(process.env.CRAZYREOUTE_MODEL) ||
        normalizeText(process.env.LLM_MODEL) ||
        "openai/gpt-5.3-codex",
      fallbackModel:
        normalizeText(process.env.CHAT_DRAFT_FALLBACK_MODEL) ||
        normalizeText(process.env.LLM_MODEL_FALLBACK_CRAZYROUTE) ||
        normalizeText(process.env.LLM_MODEL_FALLBACK_CRAZYROUTER) ||
        normalizeText(process.env.LLM_MODEL_FALLBACK_CRAZYREOUTE) ||
        undefined,
    },
  };
}

function shouldSkipNetworkInCurrentEnv(): { skip: boolean; reason?: string } {
  if (process.env.NODE_ENV === "test") {
    return { skip: true, reason: "test_environment_skip_network" };
  }
  return { skip: false };
}

function shouldEnableWebSearch(): boolean {
  return String(process.env.CHAT_DRAFT_WEB_SEARCH_ENABLED || "1").trim() !== "0";
}

function shouldEnableLlmDraft(): boolean {
  return String(process.env.CHAT_DRAFT_LLM_ENABLED || "1").trim() !== "0";
}

function normalizeSources(rawSources: any): PromptDraftSource[] {
  if (!Array.isArray(rawSources)) return [];
  const seen = new Set<string>();
  const sources: PromptDraftSource[] = [];
  for (const row of rawSources) {
    const title = normalizeText(row?.title).slice(0, 160);
    const url = normalizeText(row?.url || row?.link);
    const snippet = normalizeText(row?.snippet).slice(0, 320);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: title || url,
      url,
      ...(snippet ? { snippet } : {}),
    });
  }
  return sources.slice(0, 8);
}

function extractChatCompletionText(rawContent: unknown): string {
  if (typeof rawContent === "string") return normalizeText(rawContent);
  if (Array.isArray(rawContent)) {
    const chunks = rawContent
      .map((item: any) => normalizeText(item?.text || item?.content || item))
      .filter(Boolean);
    return chunks.join("\n").trim();
  }
  if (rawContent && typeof rawContent === "object") {
    return normalizeText((rawContent as any).text || (rawContent as any).content);
  }
  return "";
}

function buildSerperQueries(requirementText: string, slots: RequirementSlot[], maxQueries: number): string[] {
  const normalized = normalizeText(requirementText).replace(/\s+/g, " ");
  if (!normalized) return [];

  const base = normalized.slice(0, 220);
  const suggestions: string[] = [base];
  const hasVisual = slots.some((slot) => slot.key === "visual-system" && slot.filled);
  const hasSitemap = slots.some((slot) => slot.key === "sitemap-pages" && slot.filled);

  suggestions.push(`${base.slice(0, 120)} website design best practices`);
  if (!hasVisual) suggestions.push(`${base.slice(0, 120)} brand style guide examples`);
  if (!hasSitemap) suggestions.push(`${base.slice(0, 120)} sitemap pages for company website`);

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const query of suggestions) {
    const compact = normalizeText(query);
    if (!compact) continue;
    const key = compact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(compact);
  }
  return deduped.slice(0, maxQueries);
}

async function collectSerperResearch(params: {
  requirementText: string;
  slots: RequirementSlot[];
  timeoutMs: number;
  maxQueries: number;
  searchConfig?: SerperSearchConfig;
}): Promise<{ sources: PromptDraftSource[]; summary: string }> {
  const queries = buildSerperQueries(params.requirementText, params.slots, params.maxQueries);
  if (queries.length === 0) return { sources: [], summary: "" };

  const batch = await searchSerperBatch(queries, {
    config: params.searchConfig,
    timeoutMs: Math.max(4_000, params.timeoutMs),
  });
  const rawSources: WebSearchSource[] = [];
  for (const row of batch) {
    rawSources.push(...(row.sources || []));
  }
  const sources = normalizeSources(rawSources);
  const summary = sources
    .slice(0, 4)
    .map((item) => normalizeText(item.snippet))
    .filter(Boolean)
    .join(" ")
    .slice(0, 480);
  return { sources, summary };
}

function mergeTemplateWithResearch(localDraft: string, sources: PromptDraftSource[], summary: string): string {
  if (sources.length === 0 && !summary) return localDraft;
  const refs = sources
    .slice(0, 6)
    .map((source, idx) => `${idx + 1}. ${source.title} - ${source.url}`)
    .join("\n");
  return [
    localDraft,
    "",
    "## 七、外部检索补充（用于完善草稿）",
    summary ? `- 检索摘要：${summary}` : "- 检索摘要：无",
    refs ? "- 参考来源：\n" + refs : "- 参考来源：无",
  ].join("\n");
}

function looksLikeTemplateDraft(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const headingCount = (normalized.match(/^##\s+/gm) || []).length;
  if (headingCount >= 4) return true;
  return normalized.includes("## 一") && normalized.includes("## 二");
}

function resolveDraftLlmTimeoutMs(timeoutMs?: number): number {
  return Math.max(8_000, Number(process.env.CHAT_DRAFT_LLM_TIMEOUT_MS || timeoutMs || 45_000));
}

function resolveDraftMaxTokens(compact = false): number {
  const configured = Number(process.env.CHAT_DRAFT_MAX_TOKENS || 1400);
  const bounded = Math.max(600, Math.min(2600, Number.isFinite(configured) ? configured : 1400));
  return compact ? Math.max(600, Math.min(1200, bounded)) : bounded;
}

async function requestPromptDraftWithLlm(params: {
  requirementText: string;
  slots: RequirementSlot[];
  timeoutMs: number;
  config: DraftProviderConfig;
  templateDraft: string;
  researchSources: PromptDraftSource[];
  researchSummary: string;
}): Promise<PromptDraftBuildResult | undefined> {
  const model = normalizeText(params.config.model) || "openai/gpt-5.3-codex";
  const fallbackModel = normalizeText(params.config.fallbackModel);
  const client = new OpenAI({
    apiKey: params.config.apiKey,
    baseURL: params.config.baseURL,
  });
  const timeoutMs = resolveDraftLlmTimeoutMs(params.timeoutMs);
  const completion = `${params.slots.filter((slot) => slot.filled).length}/${params.slots.length}`;
  const missingLabels = params.slots.filter((slot) => !slot.filled).map((slot) => slot.label);

  const fullResearchBlock =
    params.researchSources.length > 0
      ? params.researchSources
          .slice(0, 6)
          .map((item, idx) => `${idx + 1}. ${item.title} | ${item.url} | ${item.snippet || ""}`)
          .join("\n")
      : "(none)";

  async function runSingleAttempt(attempt: {
    model: string;
    compact: boolean;
  }): Promise<{
    rawDraft: string;
    parsed?: { promptDraft?: string; researchSummary?: string; sources?: any[] };
  }> {
    const templateSlice = attempt.compact ? params.templateDraft.slice(0, 2200) : params.templateDraft;
    const compactResearchBlock =
      params.researchSources.length > 0
        ? params.researchSources
            .slice(0, 2)
            .map((item, idx) => `${idx + 1}. ${item.title} | ${item.url}`)
            .join("\n")
        : "(none)";

    const responsePromise = client.chat.completions.create({
      model: attempt.model,
      temperature: 0.2,
      max_tokens: resolveDraftMaxTokens(attempt.compact),
      messages: [
        {
          role: "system",
          content:
            "You are a senior web planning assistant. Output strict JSON only. Rebuild the prompt draft in Chinese and keep the same template section style as the provided template.",
        },
        {
          role: "user",
          content: [
            "User requirement:",
            params.requirementText || "(empty)",
            "",
            `Requirement completion: ${completion}`,
            `Missing slots: ${missingLabels.join(" / ") || "none"}`,
            "",
            "Template draft (must follow this structure style):",
            "```markdown",
            templateSlice,
            "```",
            "",
            "Web search findings (Serper):",
            params.researchSummary || "(none)",
            attempt.compact ? compactResearchBlock : fullResearchBlock,
            "",
            "Return JSON with shape:",
            "{",
            '  "promptDraft": "string: improved prompt draft in Chinese, structured and executable",',
            '  "researchSummary": "string: short summary of what web findings changed",',
            '  "sources": [{ "title": "string", "url": "https://...", "snippet": "string" }]',
            "}",
            "",
            "Rules:",
            "- Keep template-oriented structure with section headings.",
            "- Use user constraints directly, avoid generic wording.",
            "- Do not leave any section empty; if required info is missing, fill concrete default assumptions and mark them with [Assumption].",
            "- Mention assumptions explicitly.",
          ].join("\n"),
        },
      ],
    } as any);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`prompt-draft-llm-timeout-${timeoutMs}`)), timeoutMs),
    );
    const response = await Promise.race([responsePromise, timeoutPromise]);
    const rawContent = (response as any)?.choices?.[0]?.message?.content;
    const outputText = extractChatCompletionText(rawContent);
    const parsed = safeJsonParse<{
      promptDraft?: string;
      researchSummary?: string;
      sources?: any[];
    }>(outputText);
    return {
      rawDraft: normalizeText(parsed?.promptDraft || outputText),
      parsed,
    };
  }

  let usedModel = model;
  let primaryError: unknown;
  let result:
    | {
        rawDraft: string;
        parsed?: { promptDraft?: string; researchSummary?: string; sources?: any[] };
      }
    | undefined;

  try {
    result = await runSingleAttempt({ model, compact: false });
  } catch (error) {
    primaryError = error;
  }

  const retryModel = fallbackModel || model;
  const shouldRetry =
    !result?.rawDraft ||
    !looksLikeTemplateDraft(result.rawDraft) ||
    (primaryError && String((primaryError as any)?.message || "").includes("prompt-draft-llm-timeout"));

  if (shouldRetry) {
    try {
      result = await runSingleAttempt({ model: retryModel, compact: true });
      usedModel = retryModel;
      primaryError = undefined;
    } catch (retryError) {
      if (primaryError) {
        const first = normalizeText((primaryError as any)?.message || primaryError) || "llm_attempt_failed";
        const second = normalizeText((retryError as any)?.message || retryError) || "llm_retry_failed";
        throw new Error(`${first};retry:${second}`);
      }
      throw retryError;
    }
  }

  const parsed = result?.parsed;
  const rawDraft = normalizeText(result?.rawDraft);
  if (!rawDraft) return undefined;

  const promptDraft = looksLikeTemplateDraft(rawDraft)
    ? rawDraft
    : mergeTemplateWithResearch(params.templateDraft, params.researchSources, params.researchSummary);
  const mergedSources = normalizeSources([...(parsed?.sources || []), ...params.researchSources]);
  return {
    promptDraft,
    usedWebSearch: params.researchSources.length > 0,
    researchSummary: normalizeText(parsed?.researchSummary || params.researchSummary),
    sources: mergedSources,
    model: usedModel,
    provider: params.config.provider,
    draftMode: params.researchSources.length > 0 ? "llm_web_search" : "llm",
  };
}

export async function buildPromptDraftWithResearch(params: {
  requirementText: string;
  slots: RequirementSlot[];
  timeoutMs?: number;
}): Promise<PromptDraftBuildResult> {
  const localDraft = composeStructuredPrompt(params.requirementText, params.slots);
  const networkGate = shouldSkipNetworkInCurrentEnv();
  if (networkGate.skip) {
    return {
      promptDraft: localDraft,
      usedWebSearch: false,
      sources: [],
      fallbackReason: networkGate.reason,
      draftMode: "template",
    };
  }

  const provider = resolveDraftProviderConfig();
  if (!provider.config) {
    return {
      promptDraft: localDraft,
      usedWebSearch: false,
      sources: [],
      fallbackReason: provider.reason,
      draftMode: "template",
    };
  }

  const searchTimeoutMs = Number(params.timeoutMs || process.env.CHAT_DRAFT_WEB_SEARCH_TIMEOUT_MS || 16_000);
  const llmTimeoutMs = resolveDraftLlmTimeoutMs(params.timeoutMs);
  let sources: PromptDraftSource[] = [];
  let researchSummary = "";
  let webSearchFailureReason = "";

  if (shouldEnableWebSearch()) {
    const serper = resolveSerperSearchConfigFromEnv();
    if (!serper.config) {
      webSearchFailureReason = serper.reason || "missing_serper_config";
    } else {
      try {
        const research = await collectSerperResearch({
          requirementText: params.requirementText,
          slots: params.slots,
          timeoutMs: searchTimeoutMs,
          maxQueries: Math.max(1, Math.min(4, Number(process.env.CHAT_DRAFT_WEB_SEARCH_MAX_QUERIES || 2))),
          searchConfig: serper.config,
        });
        sources = research.sources;
        researchSummary = research.summary;
        if (sources.length === 0) {
          webSearchFailureReason = "serper_no_results";
        }
      } catch (error) {
        webSearchFailureReason = normalizeText((error as any)?.message || error) || "serper_search_failed";
      }
    }
  } else {
    webSearchFailureReason = "chat_draft_web_search_disabled";
  }

  if (shouldEnableLlmDraft()) {
    try {
      const llmDraft = await requestPromptDraftWithLlm({
        requirementText: params.requirementText,
        slots: params.slots,
        timeoutMs: llmTimeoutMs,
        config: provider.config,
        templateDraft: localDraft,
        researchSources: sources,
        researchSummary,
      });
      if (llmDraft) {
        return {
          ...llmDraft,
          fallbackReason: webSearchFailureReason || undefined,
        };
      }
    } catch (error) {
      const llmReason = normalizeText((error as any)?.message || error) || "llm_draft_failed";
      return {
        promptDraft: mergeTemplateWithResearch(localDraft, sources, researchSummary),
        usedWebSearch: sources.length > 0,
        sources,
        researchSummary,
        fallbackReason: webSearchFailureReason
          ? `web_search:${webSearchFailureReason};llm:${llmReason}`
          : llmReason,
        provider: provider.config.provider,
        model: provider.config.model,
        draftMode: "template",
      };
    }
  }

  return {
    promptDraft: mergeTemplateWithResearch(localDraft, sources, researchSummary),
    usedWebSearch: sources.length > 0,
    sources,
    researchSummary,
    fallbackReason: webSearchFailureReason || "llm_draft_disabled",
    provider: provider.config.provider,
    model: provider.config.model,
    draftMode: "template",
  };
}
