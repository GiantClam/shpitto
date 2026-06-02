import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";

import type { AgentState } from "../agent/graph.ts";
import { invokeModelWithIdleTimeout } from "./llm-stream.ts";
import {
  createStaticGenerationWorkerAdapter,
  type GenerationUnitInput,
  type GenerationWorkerAdapter,
} from "./generation-worker-adapter.ts";
import {
  createModelForProvider,
  isRetryableProviderError,
  providerErrorText,
  resolveProviderAttempts,
  type ProviderAttempt,
} from "./provider-model.ts";
import { rankProviderAttemptsByHealth, recordProviderHealthStatus } from "./provider-health.ts";

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

function buildUserPrompt(baseState: AgentState, input: GenerationUnitInput) {
  const workflowContext = ((baseState.workflow_context || {}) as Record<string, unknown>) || {};
  const routeContext = toRecord(input.context);
  const promptControlManifest = toRecord(workflowContext.promptControlManifest);
  const discoveryBrief = toRecord(workflowContext.websiteDiscoveryBrief);
  const structuredSourceFacts = workflowContext.structuredSourceFacts;
  const canonicalPrompt = clipText(
    workflowContext.canonicalPrompt || workflowContext.sourceRequirement || workflowContext.latestUserText || "",
    12_000,
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
  const repairHints = Array.isArray(routeContext.repairHints)
    ? (routeContext.repairHints as unknown[]).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
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
    repairHints.length > 0 ? `Repair hints:\n- ${repairHints.join("\n- ")}` : "",
    splitHeroBan,
    "Shared shell rules:",
    "- Keep one coherent header/nav/footer system across routes.",
    confirmedRoutes.length > 0
      ? `- The nav must expose exactly these routes: ${confirmedRoutes.join(", ")}`
      : "- The nav must expose the confirmed route set from the manifest.",
    localeMode.toLowerCase() === "bilingual"
      ? "- Include locale toggles for zh-CN and en and emit both message catalogs when requested."
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

export function createSkillToolRouteUnitGenerationWorker(params: {
  baseState: AgentState;
  timeoutMs: number;
  invokeRouteModel?: (params: { input: GenerationUnitInput; messages: BaseMessage[]; attempt: ProviderAttempt }) => Promise<string>;
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
      for (const attempt of attempts) {
        try {
          const raw = params.invokeRouteModel
            ? await params.invokeRouteModel({ input, messages, attempt })
            : await invokeRouteModel({
                attempt,
                messages,
                timeoutMs: params.timeoutMs,
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
          await recordProviderHealthStatusSafely({
            attempt,
            status: "success",
          });
          return {
            unitId: input.unitId,
            status: "passed",
            files,
            summary: String(payload?.summary || "").trim() || `Generated ${input.unitId}.`,
          };
        } catch (error) {
          lastError = error;
          const retryable =
            error instanceof RetryableRouteUnitOutputError || isRetryableProviderError(error);
          await recordProviderHealthStatusSafely({
            attempt,
            status: retryable ? "retryable_failure" : "fatal_failure",
          });
          const isLast = attempt === attempts[attempts.length - 1];
          if (!retryable || isLast) {
            break;
          }
        }
      }

      return {
        unitId: input.unitId,
        status: "failed",
        files: [],
        summary: `Route-unit generation failed for ${input.unitId}.`,
        issues: [providerErrorText(lastError)],
      };
    },
  });
}
