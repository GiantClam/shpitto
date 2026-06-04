export type ProviderModelTarget = "pptoken" | "aiberm" | "crazyroute";

export const DEFAULT_OPENAI_COMPAT_MODEL = "gpt-5.4-mini";

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
