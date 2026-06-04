export type ProviderModelTarget = "pptoken" | "aiberm" | "crazyroute";

export const DEFAULT_OPENAI_COMPAT_MODEL = "gpt-5.4-mini";
export const DEFAULT_HIGH_VISUAL_OPENAI_COMPAT_MODEL = "gpt-5.4";

export function normalizeProviderModelId(
  provider: ProviderModelTarget,
  requestedModel?: string,
  fallbackModel = DEFAULT_OPENAI_COMPAT_MODEL,
): string {
  const fallback = String(fallbackModel || DEFAULT_OPENAI_COMPAT_MODEL).trim() || DEFAULT_OPENAI_COMPAT_MODEL;
  const candidate = String(requestedModel || "").trim() || fallback;

  if (provider === "pptoken" || provider === "crazyroute") {
    const normalized = candidate.replace(/^openai\//i, "").trim();
    return normalized || fallback;
  }

  return candidate;
}

function isEnabled(raw: string | undefined, defaultValue = false): boolean {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function inferHigherVisualModel(candidate: string): string {
  const normalized = String(candidate || "").trim();
  if (!normalized) return DEFAULT_HIGH_VISUAL_OPENAI_COMPAT_MODEL;
  if (/mini/i.test(normalized)) return normalized.replace(/-mini\b/i, "");
  return normalized;
}

export function shouldUseVisualModelEscalation(params: {
  surfaceMode?: string;
  seedAuthorityMode?: string;
  hasImportedSeed?: boolean;
  visualBoldness?: string;
  routeFamilies?: string[];
}): boolean {
  if (!isEnabled(process.env.SHPITTO_OD_VISUAL_MODEL_ESCALATION, true)) return false;
  if (String(params.seedAuthorityMode || "").trim() === "heuristic-authoritative") return false;
  if (String(params.visualBoldness || "").trim().toLowerCase() === "high") return true;
  const surfaceMode = String(params.surfaceMode || "").trim();
  const highVisualSurface =
    surfaceMode === "marketing-landing-site" ||
    surfaceMode === "portfolio-blog-site" ||
    surfaceMode === "docs-knowledge-site" ||
    surfaceMode === "content-hub-site";
  if (highVisualSurface && params.hasImportedSeed) return true;
  const routeFamilies = (params.routeFamilies || []).map((item) => String(item || "").trim().toLowerCase());
  return routeFamilies.some((family) => family === "home" || family === "blog" || family === "docs" || family === "resource");
}

export function resolveScenarioAwareProviderModelId(params: {
  provider: ProviderModelTarget;
  requestedModel?: string;
  fallbackModel?: string;
  surfaceMode?: string;
  seedAuthorityMode?: string;
  hasImportedSeed?: boolean;
  visualBoldness?: string;
  routeFamilies?: string[];
}): string {
  const fallbackModel = String(params.fallbackModel || DEFAULT_OPENAI_COMPAT_MODEL).trim() || DEFAULT_OPENAI_COMPAT_MODEL;
  const normalized = normalizeProviderModelId(params.provider, params.requestedModel, fallbackModel);
  if (
    !shouldUseVisualModelEscalation({
      surfaceMode: params.surfaceMode,
      seedAuthorityMode: params.seedAuthorityMode,
      hasImportedSeed: params.hasImportedSeed,
      visualBoldness: params.visualBoldness,
      routeFamilies: params.routeFamilies,
    })
  ) {
    return normalized;
  }
  return normalizeProviderModelId(params.provider, inferHigherVisualModel(normalized), fallbackModel);
}
