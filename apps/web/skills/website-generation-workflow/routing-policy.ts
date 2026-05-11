import OpenAI from "openai";
import type { SkillChatAction, SkillChatActionIntent, SkillChatActionRefineScope } from "../../lib/skill-runtime/skill-execution-adapter.ts";
import { resolveRunProviderLocks, type ProviderName } from "../../lib/skill-runtime/provider-lock.ts";

type Stage = "drafting" | "previewing" | "deployed" | "deploying";

type RoutingProviderConfig = {
  provider: ProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
};

type WebsiteRouteClassifierResult = {
  actionDomain?: string;
  action?: string;
  intent?: string;
  confidence?: number;
  reason?: string;
  evidence?: string[];
};

type WebsiteRouteClassifier = (params: {
  userText: string;
  stage: Stage;
  workflowContext?: Record<string, unknown>;
}) => Promise<WebsiteRouteClassifierResult | undefined>;

const ROUTING_CONFIDENCE_THRESHOLD = 0.78;
let classifierOverrideForTesting: WebsiteRouteClassifier | undefined;

const VALID_INTENTS = new Set<SkillChatActionIntent>([
  "clarify",
  "generate",
  "refine_preview",
  "refine_deployed",
  "deploy",
]);

const VALID_REFINE_SCOPES = new Set<SkillChatActionRefineScope>([
  "patch",
  "structural",
  "route_regenerate",
  "full_regenerate",
]);

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeConfidence(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed > 1) return Math.max(0, Math.min(1, parsed / 100));
  return Math.max(0, Math.min(1, parsed));
}

function parseJsonObject(raw: string): Record<string, unknown> | undefined {
  const text = normalizeText(raw);
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try {
      const parsed = JSON.parse(fenced);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
    } catch {}
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const parsed = JSON.parse(text.slice(first, last + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
    } catch {}
  }
  return undefined;
}

function extractResponseText(rawContent: unknown): string {
  if (typeof rawContent === "string") return rawContent.trim();
  if (Array.isArray(rawContent)) {
    return rawContent
      .map((item: any) => normalizeText(item?.text || item?.content || item))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (rawContent && typeof rawContent === "object") {
    return normalizeText((rawContent as any).text || (rawContent as any).content);
  }
  return "";
}

function providerConfig(provider: ProviderName, model: string): RoutingProviderConfig | undefined {
  if (provider === "pptoken") {
    const apiKey = normalizeText(process.env.PPTOKEN_API_KEY);
    if (!apiKey) return undefined;
    return {
      provider,
      apiKey,
      baseURL: normalizeText(process.env.PPTOKEN_BASE_URL) || "https://api.pptoken.org/v1",
      model: normalizeText(model || process.env.LLM_MODEL_PPTOKEN || process.env.PPTOKEN_MODEL || process.env.LLM_MODEL) || "gpt-5.4-mini",
    };
  }

  if (provider === "aiberm") {
    const apiKey = normalizeText(process.env.AIBERM_API_KEY);
    if (!apiKey) return undefined;
    return {
      provider,
      apiKey,
      baseURL: normalizeText(process.env.AIBERM_BASE_URL) || "https://aiberm.com/v1",
      model: normalizeText(model || process.env.LLM_MODEL_AIBERM || process.env.AIBERM_MODEL || process.env.LLM_MODEL) || "gpt-5.4-mini",
    };
  }

  const apiKey =
    normalizeText(process.env.CRAZYROUTE_API_KEY) ||
    normalizeText(process.env.CRAZYROUTER_API_KEY) ||
    normalizeText(process.env.CRAZYREOUTE_API_KEY);
  if (!apiKey) return undefined;
  return {
    provider,
    apiKey,
    baseURL:
      normalizeText(process.env.CRAZYROUTE_BASE_URL) ||
      normalizeText(process.env.CRAZYROUTER_BASE_URL) ||
      normalizeText(process.env.CRAZYREOUTE_BASE_URL) ||
      "https://crazyrouter.com/v1",
    model:
      normalizeText(
        model ||
          process.env.LLM_MODEL_CRAZYROUTE ||
          process.env.LLM_MODEL_CRAZYROUTER ||
          process.env.LLM_MODEL_CRAZYREOUTE ||
          process.env.CRAZYROUTE_MODEL ||
          process.env.CRAZYROUTER_MODEL ||
          process.env.CRAZYREOUTE_MODEL ||
          process.env.LLM_MODEL,
      ) || "gpt-5.4-mini",
  };
}

function shouldSkipNetworkInTests(): boolean {
  return process.env.NODE_ENV === "test" && process.env.SKILL_CHAT_ROUTING_TEST_ENABLE !== "1";
}

function timeoutMs(): number {
  const value = Number(process.env.SKILL_CHAT_ROUTING_TIMEOUT_MS || 8_000);
  return Math.max(2_000, Math.min(30_000, Number.isFinite(value) ? value : 8_000));
}

function providerRetries(): number {
  const value = Number(process.env.SKILL_CHAT_ROUTING_PROVIDER_RETRIES ?? 1);
  return Math.max(0, Math.min(3, Number.isFinite(value) ? value : 1));
}

function retryBaseMs(): number {
  const value = Number(process.env.SKILL_CHAT_ROUTING_RETRY_BASE_MS || 250);
  return Math.max(0, Math.min(2_000, Number.isFinite(value) ? value : 250));
}

function errorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) {
    return [error.name, (error as any).code, (error as any).status, error.message, error.stack]
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(" | ");
  }
  if (typeof error === "object") {
    const raw = error as Record<string, unknown>;
    return [raw.name, raw.code, raw.status, raw.statusCode, raw.type, raw.message]
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .join(" | ");
  }
  return normalizeText(error);
}

function isRetryableRoutingError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  if (!text) return false;
  if (/(401|403|forbidden|unauthorized|invalid api key|authentication failed)/i.test(text)) return false;
  if (/(404|model not found|unsupported model|not supported|bad request|invalid_request_error)/i.test(text)) return false;
  return /(abort|timeout|timed out|bodytimeouterror|body timeout|und_err_body_timeout|terminated|429|rate limit|503|502|504|service unavailable|connection error|network|socket hang up|econnreset|econnaborted|etimedout|eai_again|enotfound|fetch failed|temporarily unavailable|overloaded|upstream)/i.test(text);
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function classifyWithLlm(params: {
  userText: string;
  stage: Stage;
  workflowContext?: Record<string, unknown>;
}): Promise<WebsiteRouteClassifierResult | undefined> {
  if (shouldSkipNetworkInTests()) return undefined;

  const attempts = resolveRunProviderLocks({
    provider: process.env.CHAT_ROUTING_PROVIDER || process.env.SKILL_NATIVE_PROVIDER_LOCK,
    model: process.env.CHAT_ROUTING_MODEL || process.env.SKILL_NATIVE_MODEL_LOCK,
  })
    .map((lock) => providerConfig(lock.provider, lock.model))
    .filter((config): config is RoutingProviderConfig => !!config);

  if (attempts.length === 0) return undefined;

  const workflowSummary = {
    hasGeneratedPreview: Boolean(params.workflowContext?.checkpointProjectPath || params.workflowContext?.deploySourceProjectPath),
    executionMode: normalizeText(params.workflowContext?.executionMode),
    blogPreviewStatus: normalizeText(params.workflowContext?.blogContentPreviewStatus),
    siteLocale: normalizeText(params.workflowContext?.requestedSiteLocale || params.workflowContext?.siteLocale),
  };

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are the routing policy for the website-generation-workflow skill.",
        "Classify the user's latest message semantically. Do not rely on literal keyword matching.",
        "Return strict JSON only.",
        "Allowed JSON shape:",
        "{",
        '  "actionDomain": "blog_content" | "deploy" | "none",',
        '  "action": "regenerate_posts" | "deploy_site" | "none",',
        '  "intent": "refine_preview" | "refine_deployed" | "deploy" | "clarify",',
        '  "confidence": number from 0 to 1,',
        '  "reason": "short machine-readable reason",',
        '  "evidence": ["short source phrases or semantic cues"]',
        "}",
        "Use blog_content/regenerate_posts when the user is asking to create, supplement, change, or set topics/counts/direction for blog/article content rather than edit a visible selector.",
        "Use deploy/deploy_site when the user is asking to publish, release, go live, or deploy the generated website.",
        "Use none when the message is a normal visual/copy/site refine, a new generation request, unclear, or unrelated.",
        "For previewing stage, blog content updates should route to refine_preview. For deployed stage, route to refine_deployed. For deploy requests without a preview baseline, use clarify.",
        "Examples:",
        '- User says "blog文章内容主要是与ai、出海相关的内容，准备3篇" while previewing: return blog_content/regenerate_posts with refine_preview because the user is setting blog topics and post count.',
        '- User says "prepare 3 articles about AI and going global" while previewing: return blog_content/regenerate_posts with refine_preview.',
        '- User says "部署到 shpitto 服务器" while previewing: return deploy/deploy_site with deploy.',
        '- User says "make the hero title larger" while previewing: return none because that is a selector-bound visual/content refine.',
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          stage: params.stage,
          workflowSummary,
          userText: params.userText,
        },
        null,
        2,
      ),
    },
  ];

  let lastError: unknown;
  const retries = providerRetries();
  for (const config of attempts) {
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        try {
          controller.abort(new Error(`website-routing-timeout-${timeoutMs()}ms`));
        } catch {
          controller.abort();
        }
      }, timeoutMs());

      try {
        const response = await client.chat.completions.create(
          {
            model: config.model,
            temperature: 0,
            max_tokens: 500,
            response_format: { type: "json_object" },
            messages,
          } as any,
          { signal: controller.signal },
        );
        const parsed = parseJsonObject(extractResponseText(response.choices?.[0]?.message?.content));
        if (!parsed) {
          lastError = new Error(`website-routing-empty-json:${config.provider}`);
          if (attempt < retries) {
            await sleepMs(retryBaseMs() * (attempt + 1));
            continue;
          }
          break;
        }
        return {
          actionDomain: normalizeText(parsed.actionDomain),
          action: normalizeText(parsed.action),
          intent: normalizeText(parsed.intent),
          confidence: normalizeConfidence(parsed.confidence),
          reason: normalizeText(parsed.reason),
          evidence: Array.isArray(parsed.evidence)
            ? parsed.evidence.map((item) => normalizeText(item)).filter(Boolean).slice(0, 8)
            : [],
        };
      } catch (error) {
        lastError = error;
        if (attempt < retries && isRetryableRoutingError(error)) {
          await sleepMs(retryBaseMs() * (attempt + 1));
          continue;
        }
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  if (lastError) {
    console.warn(`[website-routing-policy] LLM route classification failed; falling back to generic chat intent: ${errorText(lastError)}`);
  }
  return undefined;
}

function normalizeLlmAction(params: {
  result?: WebsiteRouteClassifierResult;
  stage: Stage;
}): SkillChatAction | undefined {
  const result = params.result;
  if (!result) return undefined;

  const confidence = normalizeConfidence(result.confidence);
  if (confidence < ROUTING_CONFIDENCE_THRESHOLD) return undefined;

  const actionDomain = normalizeText(result.actionDomain);
  const action = normalizeText(result.action);
  const intent = normalizeText(result.intent) as SkillChatActionIntent;
  if (!VALID_INTENTS.has(intent)) return undefined;

  const evidence = Array.isArray(result.evidence) ? result.evidence.map((item) => normalizeText(item)).filter(Boolean).slice(0, 8) : [];
  const reason = normalizeText(result.reason) || "website_skill_llm_route";

  if (actionDomain === "deploy" && action === "deploy_site") {
    return {
      intent: params.stage === "drafting" ? "clarify" : "deploy",
      confidence,
      reason,
      shouldCreateTask: params.stage !== "drafting",
      actionDomain,
      action,
      evidence,
      rejected: [{ action: "site_refine.patch", reason: "LLM classified the message as a publish/deploy request" }],
    };
  }

  if (actionDomain === "blog_content" && action === "regenerate_posts") {
    if (params.stage !== "previewing" && params.stage !== "deployed") return undefined;
    const refineScope: SkillChatActionRefineScope = "structural";
    if (!VALID_REFINE_SCOPES.has(refineScope)) return undefined;
    return {
      intent: params.stage === "deployed" ? "refine_deployed" : "refine_preview",
      confidence,
      reason,
      shouldCreateTask: true,
      refineScope,
      actionDomain,
      action,
      evidence,
      rejected: [
        {
          action: "site_refine.patch",
          reason: "LLM classified the message as a blog content workflow request, not a selector-bound patch",
        },
      ],
      workflowContext: {
        skillActionDomain: actionDomain,
        skillAction: action,
      },
    };
  }

  return undefined;
}

export async function resolveWebsiteChatAction(params: {
  userText: string;
  stage: Stage;
  workflowContext?: Record<string, unknown>;
}): Promise<SkillChatAction | undefined> {
  const text = normalizeText(params.userText);
  if (!text) return undefined;
  const classifier = classifierOverrideForTesting || classifyWithLlm;
  const result = await classifier({
    userText: text,
    stage: params.stage,
    workflowContext: params.workflowContext,
  });
  return normalizeLlmAction({ result, stage: params.stage });
}

export function setWebsiteChatRouteClassifierForTesting(classifier?: WebsiteRouteClassifier): void {
  if (process.env.NODE_ENV !== "test") return;
  classifierOverrideForTesting = classifier;
}

export async function resolveWebsiteChatActionWithClassifierForTesting(
  params: {
    userText: string;
    stage: Stage;
    workflowContext?: Record<string, unknown>;
  },
  classifier: WebsiteRouteClassifier,
): Promise<SkillChatAction | undefined> {
  const text = normalizeText(params.userText);
  if (!text) return undefined;
  const result = await classifier({
    userText: text,
    stage: params.stage,
    workflowContext: params.workflowContext,
  });
  return normalizeLlmAction({ result, stage: params.stage });
}
