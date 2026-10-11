import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";

import type { AgentState } from "../agent/graph.ts";
import { invokeModelWithIdleTimeout } from "./llm-stream.ts";
import {
  createStaticGenerationWorkerAdapter,
  type GenerationUnitInput,
  type GenerationWorkerAdapter,
} from "./generation-worker-adapter.ts";
import { resolveRouteUnitProviderTimeoutMs } from "./route-unit-timeouts.ts";
import {
  createModelForProvider,
  describeProviderConfig,
  isRetryableProviderError,
  providerErrorText,
  providerRetryBackoffMs,
  resolveProviderAttempts,
  resolveProviderRetryPolicy,
  type ProviderAttempt,
} from "./provider-model.ts";
import { rankProviderAttemptsByHealth, recordProviderHealthStatus } from "./provider-health.ts";
import { DEFAULT_OPENAI_COMPAT_MODEL, normalizeProviderModelId } from "./provider-model-id.ts";

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

function clipText(value: unknown, maxChars: number) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 64)).trim()}\n...[clipped]` : text;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function cloneWorkflowManifest(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function buildRouteScopedState(baseState: AgentState, input: GenerationUnitInput): AgentState {
  const workflowContext = ((baseState.workflow_context || {}) as Record<string, unknown>) || {};
  const promptControlManifest = cloneWorkflowManifest(workflowContext.promptControlManifest);
  return {
    ...baseState,
    workflow_context: {
      ...workflowContext,
      promptControlManifest,
      routeUnitMode: true,
      routeUnitTargetRoute: input.route,
      routeUnitTargetFiles: input.targetFiles,
      routeUnitId: input.unitId,
      routeUnitPrompt: input.prompt,
      routeUnitContext: input.context,
    } as any,
  };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const normalized = String(text || "").trim();
  const fenced = normalized.match(/```json\s*([\s\S]*?)```/i);
  const candidate = String(fenced?.[1] || normalized).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function filterUnitFiles(files: Array<{ path?: string; content?: string; type?: string }>, input: GenerationUnitInput) {
  const targetSet = new Set((input.targetFiles || []).map((target) => normalizePath(target)).filter(Boolean));
  return files.filter((file) => targetSet.has(normalizePath(String(file?.path || ""))));
}

function normalizeGeneratedFiles(
  payload: Record<string, unknown> | null,
  input: GenerationUnitInput,
): Array<{ path: string; content: string; type?: string }> {
  const raw = Array.isArray(payload?.files) ? (payload?.files as unknown[]) : [];
  return filterUnitFiles(
    raw.map((entry) => {
      const file = toRecord(entry);
      return {
        path: normalizePath(String(file.path || "")),
        content: String(file.content || ""),
        type: String(file.type || "").trim() || undefined,
      };
    }),
    input,
  ).map((file) => ({
    path: normalizePath(String(file.path || "")),
    content: String(file.content || ""),
    type: String(file.type || "").trim() || undefined,
  }));
}

function collectMissingTargets(files: Array<{ path: string }>, input: GenerationUnitInput) {
  const emitted = new Set(files.map((file) => normalizePath(file.path)));
  return input.targetFiles.map((target) => normalizePath(target)).filter((target) => !emitted.has(target));
}

function routeUnitRequiresBilingualShell(baseState: AgentState): boolean {
  const workflowContext = toRecord(baseState.workflow_context);
  const promptControlManifest = toRecord(workflowContext.promptControlManifest);
  const discoveryBrief = toRecord(workflowContext.websiteDiscoveryBrief || workflowContext.discoveryBrief);
  const localeMode = String(
    discoveryBrief.localeMode || discoveryBrief.preferredLocale || promptControlManifest.localeMode || "",
  )
    .trim()
    .toLowerCase();
  return localeMode === "bilingual";
}

function hasValidBilingualLocaleSwitch(html: string): boolean {
  const source = String(html || "");
  const localeToggleMatches = Array.from(source.matchAll(/data-locale-toggle[^>]*data-locale=["']([^"']+)["']/gi));
  const localeToggles = new Set(
    localeToggleMatches.map((match) => String(match[1] || "").trim()).filter(Boolean),
  );
  if (localeToggles.has("zh-CN") && localeToggles.has("en")) return true;
  return /\bdata-locale-switch\b/i.test(source);
}

function validateRouteUnitFiles(params: {
  baseState: AgentState;
  input: GenerationUnitInput;
  files: Array<{ path: string; content: string; type?: string }>;
}) {
  if (!routeUnitRequiresBilingualShell(params.baseState)) return;
  for (const file of params.files) {
    const pathName = normalizePath(file.path);
    if (!pathName.endsWith(".html")) continue;
    if (!hasValidBilingualLocaleSwitch(String(file.content || ""))) {
      throw new RetryableRouteUnitOutputError(
        `Provider route-unit output for ${params.input.unitId} is missing a valid bilingual locale switch on ${pathName}.`,
      );
    }
  }
}

function buildSystemPrompt() {
  return [
    "You are Shpitto V2 route-unit generator.",
    "Generate only the requested route-unit files.",
    "Return strict JSON only.",
    'Schema: {"summary": string, "files": [{"path": string, "type": string, "content": string}]}',
    "Do not wrap the JSON in prose.",
    "Every requested HTML file must be a complete standalone HTML document.",
    "Use buyer-facing copy only. Never expose implementation notes, placeholders, or prompt instructions.",
  ].join("\n");
}

function readMessageText(value: unknown): string {
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
    return String((value as any).content || "");
  }
  return "";
}

function baseMessagesToOpenAiMessages(messages: BaseMessage[]) {
  return messages.map((message) => {
    const type = String((message as any)?._getType?.() || "").trim();
    if (type === "system") {
      return { role: "system", content: readMessageText((message as any).content) };
    }
    if (type === "assistant") {
      return { role: "assistant", content: readMessageText((message as any).content) };
    }
    return { role: "user", content: readMessageText((message as any).content) };
  });
}

function readOpenAiChoiceText(choice: any): string {
  return readMessageText(choice?.message?.content);
}

function isRouteUnitHomeTarget(input: Pick<GenerationUnitInput, "route" | "targetFiles">): boolean {
  if (String(input.route || "").trim() === "/") return true;
  return (input.targetFiles || []).some((target) => normalizePath(target) === "/index.html");
}

function isRouteUnitSharedAssetOnly(input: Pick<GenerationUnitInput, "targetFiles">): boolean {
  const targets = (input.targetFiles || []).map((target) => normalizePath(target)).filter(Boolean);
  if (targets.length === 0) return false;
  return targets.every((target) => !target.endsWith(".html"));
}

function resolveRouteUnitLightweightModelName(
  config: ProviderAttempt["config"],
  input: Pick<GenerationUnitInput, "route" | "targetFiles">,
): string {
  const envKeys = isRouteUnitHomeTarget(input)
    ? ["LLM_MODEL_ROUTE_UNIT_HOME", "LLM_MODEL_HOME_ROUND"]
    : isRouteUnitSharedAssetOnly(input)
      ? ["LLM_MODEL_ROUTE_UNIT_SHARED_ASSET", "LLM_MODEL_SHARED_ASSET"]
      : ["LLM_MODEL_ROUTE_UNIT_INTERIOR_HTML", "LLM_MODEL_INTERIOR_HTML"];
  const explicit = envKeys
    .map((key) => String((process.env as Record<string, string | undefined>)[key] || "").trim())
    .find(Boolean);
  if (explicit) return normalizeProviderModelId(config.provider, explicit, DEFAULT_OPENAI_COMPAT_MODEL);
  if (/mini/i.test(String(config.modelName || "").trim())) {
    return normalizeProviderModelId(config.provider, config.modelName, DEFAULT_OPENAI_COMPAT_MODEL);
  }
  return normalizeProviderModelId(config.provider, DEFAULT_OPENAI_COMPAT_MODEL, DEFAULT_OPENAI_COMPAT_MODEL);
}

function resolveRouteUnitProviderConfig(
  config: ProviderAttempt["config"],
  input: Pick<GenerationUnitInput, "route" | "targetFiles">,
): ProviderAttempt["config"] {
  const lightweightModelName = resolveRouteUnitLightweightModelName(config, input);
  if (!lightweightModelName || lightweightModelName === config.modelName) return config;
  return {
    ...config,
    modelName: lightweightModelName,
  };
}

class RetryableRouteUnitOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableRouteUnitOutputError";
  }
}

async function recordProviderHealthStatusSafely(params: {
  attempt: ProviderAttempt;
  status: "success" | "retryable_failure" | "fatal_failure";
}) {
  try {
    await recordProviderHealthStatus(params);
  } catch {
    // Provider-health telemetry is best-effort and must not break generation.
  }
}

type PromptSection = {
  heading: string;
  body: string;
};

function parseMarkdownSections(markdown: string): { preamble: string; sections: PromptSection[] } {
  const lines = String(markdown || "").split(/\r?\n/);
  const preamble: string[] = [];
  const sections: PromptSection[] = [];
  let current: PromptSection | null = null;
  for (const line of lines) {
    const headingMatch = line.match(/^##+\s+(.+?)\s*$/);
    if (headingMatch) {
      current = { heading: String(headingMatch[1] || "").trim(), body: "" };
      sections.push(current);
      continue;
    }
    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
      continue;
    }
    preamble.push(line);
  }
  return {
    preamble: preamble.join("\n").trim(),
    sections: sections.map((section) => ({
      heading: section.heading,
      body: String(section.body || "").trim(),
    })),
  };
}

function shouldKeepCanonicalPromptSection(heading: string, route: string) {
  const normalized = String(heading || "").trim().toLowerCase();
  if (!normalized) return false;
  if (/prompt control manifest|machine readable|source material appendix|referenced assets|appendix/.test(normalized)) {
    return false;
  }
  if (/confirmed generation parameters|site mission|quality constraints|route contracts|locale|translation|bilingual/.test(normalized)) {
    return true;
  }
  if (route === "/" && /homepage/.test(normalized)) return true;
  return false;
}

function buildCanonicalPromptExcerpt(canonicalPrompt: string, route: string) {
  const text = String(canonicalPrompt || "").trim();
  if (!text) return "";
  if (!/^#/m.test(text)) {
    return clipText(text, 4_000);
  }
  const parsed = parseMarkdownSections(text);
  const parts: string[] = [];
  if (parsed.preamble) {
    parts.push(clipText(parsed.preamble, 600));
  }
  for (const section of parsed.sections) {
    if (!shouldKeepCanonicalPromptSection(section.heading, route)) continue;
    parts.push(`## ${section.heading}\n${clipText(section.body, 1_800)}`.trim());
  }
  const excerpt = parts.filter(Boolean).join("\n\n").trim();
  return clipText(excerpt || text, 5_000);
}

function buildUserPrompt(baseState: AgentState, input: GenerationUnitInput) {
  const workflowContext = ((baseState.workflow_context || {}) as Record<string, unknown>) || {};
  const routeContext = toRecord(input.context);
  const promptControlManifest = toRecord(workflowContext.promptControlManifest);
  const discoveryBrief = toRecord(workflowContext.websiteDiscoveryBrief);
  const structuredSourceFacts = workflowContext.structuredSourceFacts;
  const canonicalPrompt = buildCanonicalPromptExcerpt(
    String(workflowContext.canonicalPrompt || workflowContext.sourceRequirement || workflowContext.latestUserText || ""),
    String(input.route || "/").trim() || "/",
  );
  const localeMode = String(
    discoveryBrief.localeMode || discoveryBrief.preferredLocale || promptControlManifest.localeMode || "",
  ).trim();
  const confirmedRoutes = Array.isArray(promptControlManifest.routes)
    ? (promptControlManifest.routes as unknown[]).map((item) => normalizePath(String(item || ""))).filter(Boolean)
    : [];
  const inheritedTerminology = Array.isArray(routeContext.inheritedTerminology)
    ? (routeContext.inheritedTerminology as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const inheritedTokens = Array.isArray(routeContext.inheritedTokens)
    ? (routeContext.inheritedTokens as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const routeContract = Array.isArray(routeContext.routeContract)
    ? (routeContext.routeContract as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const mediaPlan = Array.isArray(routeContext.mediaPlan)
    ? (routeContext.mediaPlan as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const mediaResources = Array.isArray(routeContext.mediaResources)
    ? (routeContext.mediaResources as unknown[]).map((item) => JSON.stringify(item)).join("\n")
    : "";
  const sharedShellSnapshot = toRecord(routeContext.sharedShellSnapshot);
  const sharedShellSourceRoute = String(sharedShellSnapshot.sourceRoute || "").trim();
  const sharedShellHeaderHtml = clipText(String(sharedShellSnapshot.headerHtml || ""), 1_800);
  const sharedShellFooterHtml = clipText(String(sharedShellSnapshot.footerHtml || ""), 1_800);
  const sharedShellLocaleProtocol = String(sharedShellSnapshot.localeProtocol || "").trim();
  const repairHints = Array.isArray(routeContext.repairHints)
    ? (routeContext.repairHints as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const isBlogCollectionRoute =
    normalizePath(String(input.route || "/")) === "/blog" &&
    String(routeContext.pageKind || "").trim().toLowerCase() === "content-collection-index";
  const splitHeroBan =
    String(input.route || "").trim() === "/"
      ? [
          "Homepage-specific rule: do not use generic split hero geometry.",
          "Reject equal-column copy/media hero, right-side visual rail, hero-grid, or generic two-panel marketing shell.",
          "Prefer a stacked or asymmetrical institutional masthead that feels route-owned.",
        ].join("\n")
      : "";

  return [
    `Route unit id: ${input.unitId}`,
    `Route: ${String(input.route || "/")}`,
    `Target files: ${input.targetFiles.map((item) => normalizePath(item)).join(", ")}`,
    `Route unit goal:\n${String(input.prompt || "").trim()}`,
    `Website surface mode: ${String(workflowContext.websiteSurfaceMode || "")}`,
    `Website type skill: ${String(workflowContext.websiteTypeSkillId || "")}`,
    localeMode ? `Locale mode: ${localeMode}` : "",
    confirmedRoutes.length > 0 ? `Confirmed routes: ${confirmedRoutes.join(", ")}` : "",
    `Nav label: ${String(routeContext.navLabel || "")}`,
    `Page kind: ${String(routeContext.pageKind || "")}`,
    `Opening family: ${String(routeContext.openingFamily || "")}`,
    `Opening topology: ${String(routeContext.openingTopology || "")}`,
    routeContract.length > 0 ? `Route contract:\n- ${routeContract.join("\n- ")}` : "",
    inheritedTerminology.length > 0 ? `Inherited terminology: ${inheritedTerminology.join(", ")}` : "",
    inheritedTokens.length > 0 ? `Inherited tokens: ${inheritedTokens.join(", ")}` : "",
    mediaPlan.length > 0 ? `Media plan:\n- ${mediaPlan.join("\n- ")}` : "",
    mediaResources ? `Media resources:\n${mediaResources}` : "",
    sharedShellHeaderHtml
      ? [
          "Verified shared shell snapshot:",
          sharedShellSourceRoute ? `- Source route: ${sharedShellSourceRoute}` : "",
          sharedShellLocaleProtocol ? `- Locale protocol already verified on the homepage shell: ${sharedShellLocaleProtocol}` : "",
          "- Reuse this header/footer contract instead of inventing a new shell for this route.",
          `Header HTML reference:\n${sharedShellHeaderHtml}`,
          `Footer HTML reference:\n${sharedShellFooterHtml}`,
        ]
          .filter(Boolean)
          .join("\n")
      : "",
    repairHints.length > 0 ? `Repair hints:\n- ${repairHints.join("\n- ")}` : "",
    splitHeroBan,
    "Shared shell rules:",
    "- Keep one coherent header/nav/footer system across routes.",
    sharedShellHeaderHtml
      ? "- Treat the verified homepage header/footer above as the authoritative shell structure. Preserve its locale switch placement outside the primary nav, preserve the same nav destinations, and only change route-owned main content plus active-state markers."
      : "",
    confirmedRoutes.length > 0
      ? `- The nav must expose exactly these routes: ${confirmedRoutes.join(", ")}`
      : "- The nav must expose the confirmed route set from the manifest.",
    confirmedRoutes.length > 0
      ? `- Any footer navigation on this route must preserve the same planned internal destinations as the homepage shell. If the site links ${confirmedRoutes.join(", ")} in the shared shell, do not drop those destinations from interior-route footers.`
      : "- Any footer navigation on this route must preserve the same planned internal destinations as the homepage shell.",
    String(input.route || "/").trim() !== "/"
      ? "- Do not replace the shared footer with footer copy only. Interior routes must keep the active footer shell, including its destination links, while changing only route-specific main content."
      : "",
    [
      "- Footer shell minimum: use one visible footer band, not a bare row of inline links.",
      "- The footer must include a structured layout wrapper plus distinct navigation and summary/support copy zones such as footer-inner/footer-nav/footer-note, footer-brand/footer-links/footer-meta, or equivalent footer column classes.",
      "- If `/styles.css` defines shared footer utilities, the emitted HTML must use those same footer shell classes instead of collapsing the footer into plain anchors.",
    ].join("\n"),
    isBlogCollectionRoute
      ? [
          "Blog archive copy exclusions:",
          "- Do not add body sections or link labels whose primary job is route choreography, such as `下一步`, `从这里继续探索`, `返回首页`, `继续了解`, `where to start`, `next step`, `continue reading`, or `continue exploring`.",
          "- Do not explain reading order, browsing order, page role, archive mechanics, or how visitors should move from the homepage into deeper content.",
          "- Keep blog card actions visitor-facing and route-owned. Point them toward real archive/detail outcomes, not generic home-page return paths or mechanical navigation instructions.",
          "- Do not render a final CTA band whose only value is telling the visitor what page to click next.",
        ].join("\n")
      : "",
    localeMode.toLowerCase() === "bilingual"
      ? [
          "- Use one shared locale-switch protocol consistently across every bilingual route in this run.",
          "- Accepted protocols: either explicit `data-locale-toggle` buttons with `data-locale=\"zh-CN\"` and `data-locale=\"en\"`, or one route-preserving `data-locale-switch` button.",
          "- Do not invent alternate switch contracts such as `data-locale-button`, `data-language-toggle`, or route-specific locale button APIs.",
          "- Keep exactly one visible language on screen at a time. Do not render paired visible Chinese/English spans, duplicated bilingual paragraphs, slash-separated labels, or twin-node protocols such as `.t-zh` / `.t-en`.",
          "- Drive translatable visible copy from stable `data-i18n` keys plus the shared locale catalogs. Do not use `data-alt-zh`, `data-alt-en`, `data-zh`, `data-en`, or route-local visible bilingual mirrors as the primary content transport.",
          "- For translated attributes such as `alt`, `title`, `placeholder`, `content`, or `aria-label`, keep the visible node keyed with `data-i18n` and declare the translated attribute through `data-i18n-attr` instead of route-specific alternate-language attributes.",
          "- Emit both `/i18n/messages.en.json` and `/i18n/messages.zh-CN.json` when bilingual output is requested.",
        ].join("\n")
      : "",
    "Canonical prompt excerpt:",
    canonicalPrompt,
    structuredSourceFacts
      ? `Structured source facts:\n${clipText(JSON.stringify(structuredSourceFacts, null, 2), 8_000)}`
      : "",
    "Output requirements:",
    "- Emit every requested target file exactly once.",
    "- Do not emit files outside targetFiles.",
    "- HTML must contain meaningful, non-placeholder content and valid internal links.",
    "- Every emitted HTML file must reference the shared assets with absolute paths: `<link rel=\"stylesheet\" href=\"/styles.css\">` and `<script src=\"/script.js\"></script>`.",
    "- CSS must style the emitted route coherently; JS should only include essential shell behavior.",
    "- JSON locale files must be valid JSON objects.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function invokeRouteModel(params: {
  attempt: ProviderAttempt;
  messages: BaseMessage[];
  timeoutMs: number;
}) {
  if (params.attempt.config.provider === "pptoken") {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try {
        controller.abort(`Request timed out. [operation=v2-route-unit:${params.attempt.config.provider}] [timeoutMs=${params.timeoutMs}]`);
      } catch {}
    }, Math.max(10_000, Number(params.timeoutMs) || 60_000));

    try {
      const response = await fetch(`${String(params.attempt.config.baseURL || "").replace(/\/+$/g, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${String(params.attempt.config.apiKey || "").trim()}`,
          ...(params.attempt.config.defaultHeaders || {}),
        },
        body: JSON.stringify({
          model: params.attempt.config.modelName,
          messages: baseMessagesToOpenAiMessages(params.messages),
          max_tokens: 8_192,
          temperature: 0.2,
        }),
        signal: controller.signal,
      });

      const rawText = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText || "Upstream request failed"}${rawText ? `: ${rawText}` : ""}`.trim());
      }
      const payload = rawText ? JSON.parse(rawText) : {};
      return readOpenAiChoiceText(payload?.choices?.[0]);
    } finally {
      clearTimeout(timer);
    }
  }

  const model = createModelForProvider(params.attempt.config, params.timeoutMs, 8_192, 0.2);
  const ai = await invokeModelWithIdleTimeout({
    model: {
      invoke: model.invoke.bind(model),
    },
    messages: params.messages,
    timeoutMs: params.timeoutMs,
    operation: `v2-route-unit:${params.attempt.config.provider}`,
  });
  return String(ai?.content || "").trim();
}

export function resolveDirectRouteUnitProviderConfigForTesting(
  config: ProviderAttempt["config"],
  input: Pick<GenerationUnitInput, "route" | "targetFiles">,
): ProviderAttempt["config"] {
  return resolveRouteUnitProviderConfig(config, input);
}

export function resolveRouteUnitProviderTimeoutMsForTesting(params: {
  taskTimeoutMs: number;
  targetFileCount: number;
}) {
  return resolveRouteUnitProviderTimeoutMs(params);
}

export function createSkillToolRouteUnitGenerationWorker(params: {
  baseState: AgentState;
  timeoutMs: number;
  invokeRouteModel?: (params: {
    input: GenerationUnitInput;
    messages: BaseMessage[];
    attempt: ProviderAttempt;
    timeoutMs: number;
  }) => Promise<string>;
}): GenerationWorkerAdapter {
  return createStaticGenerationWorkerAdapter({
    id: "v2-route-unit-direct-worker",
    capabilities: ["route-unit", "direct-llm", "v2-runtime"],
    runUnit: async (input) => {
      const scopedState = buildRouteScopedState(params.baseState, input);
      const preferredProvider = toRecord(scopedState.workflow_context).providerLock as Record<string, unknown> | undefined;
      const attempts = await rankProviderAttemptsByHealth(
        resolveProviderAttempts({
          provider: String(preferredProvider?.provider || "").trim() || undefined,
          model: String(preferredProvider?.model || "").trim() || undefined,
        }),
      );
      const messages: BaseMessage[] = [
        new SystemMessage(buildSystemPrompt()),
        new HumanMessage(buildUserPrompt(scopedState, input)),
      ];

      let lastError: unknown;
      const retryPolicy = resolveProviderRetryPolicy("route-unit");
      let stopProviderChain = false;
      const workflowContext = toRecord(scopedState.workflow_context);
      const providerTimeoutMs = resolveRouteUnitProviderTimeoutMs({
        taskTimeoutMs: params.timeoutMs,
        targetFileCount: input.targetFiles.length,
      });
      for (const attempt of attempts) {
        const routeProviderConfig = resolveRouteUnitProviderConfig(attempt.config, input);
        const routeProviderAttempt: ProviderAttempt = {
          ...attempt,
          lock: {
            ...attempt.lock,
            model: routeProviderConfig.modelName,
          },
          config: routeProviderConfig,
        };
        for (let retryAttempt = 0; retryAttempt <= retryPolicy.retries; retryAttempt += 1) {
          try {
            const raw = params.invokeRouteModel
              ? await params.invokeRouteModel({ input, messages, attempt: routeProviderAttempt, timeoutMs: providerTimeoutMs })
              : await invokeRouteModel({
                  attempt: routeProviderAttempt,
                  messages,
                  timeoutMs: providerTimeoutMs,
                });
            const payload = extractJsonObject(raw);
            if (!payload) {
              throw new RetryableRouteUnitOutputError(
                `Provider ${attempt.config.provider} returned non-JSON or malformed JSON output for ${input.unitId}.`,
              );
            }
            const files = normalizeGeneratedFiles(payload, input);
            const missingTargets = collectMissingTargets(files, input);
            if (missingTargets.length > 0) {
              throw new RetryableRouteUnitOutputError(
                `Provider ${attempt.config.provider} omitted requested route-unit target files for ${input.unitId}: ${missingTargets.join(", ")}`,
              );
            }
            validateRouteUnitFiles({
              baseState: scopedState,
              input,
              files,
            });
            await recordProviderHealthStatusSafely({
              attempt: routeProviderAttempt,
              status: "success",
            });
            return {
              unitId: input.unitId,
              status: "passed",
              files,
              summary: String(payload?.summary || "").trim() || `Generated ${input.unitId}.`,
              provider: routeProviderAttempt.config.provider,
              model: routeProviderAttempt.config.modelName,
            };
          } catch (error) {
            lastError = error;
            const retryable =
              error instanceof RetryableRouteUnitOutputError || isRetryableProviderError(error);
            await recordProviderHealthStatusSafely({
              attempt: routeProviderAttempt,
              status: retryable ? "retryable_failure" : "fatal_failure",
            });
            const isLastProvider = attempt === attempts[attempts.length - 1];
            const exhaustedProviderRetries = retryAttempt >= retryPolicy.retries;
            console.warn(
              `[v2-route-unit] provider_attempt_failed ${JSON.stringify({
                chatId: String(workflowContext.chatId || "") || null,
                taskId: String(workflowContext.chatTaskId || workflowContext.taskId || "") || null,
                workflowId: String(toRecord(workflowContext.workflowRuntime).workflowId || "") || null,
                routeUnitId: input.unitId,
                route: input.route,
                targetFiles: input.targetFiles,
                provider: routeProviderAttempt.config.provider,
                model: routeProviderAttempt.config.modelName,
                endpoint: describeProviderConfig(routeProviderAttempt.config),
                providerAttempt: retryAttempt + 1,
                providerRetryBudget: retryPolicy.retries + 1,
                retryable,
                willRetrySameProvider: retryable && !exhaustedProviderRetries,
                willFallbackProvider: retryable && exhaustedProviderRetries && !isLastProvider,
                error: providerErrorText(error),
              })}`,
            );
            if (retryable && !exhaustedProviderRetries) {
              await new Promise<void>((resolve) =>
                setTimeout(resolve, providerRetryBackoffMs(retryPolicy, retryAttempt + 1)),
              );
              continue;
            }
            if (!retryable || isLastProvider) {
              stopProviderChain = true;
              break;
            }
            break;
          }
        }
        if (stopProviderChain || (!(lastError instanceof RetryableRouteUnitOutputError) && !isRetryableProviderError(lastError))) {
          break;
        }
      }

      return {
        unitId: input.unitId,
        status: "failed",
        files: [],
        summary: `Route-unit generation failed for ${input.unitId}.`,
        issues: [providerErrorText(lastError)],
        provider: attempts[0]?.config?.provider,
        model: attempts[0]?.config?.modelName,
      };
    },
  });
}
