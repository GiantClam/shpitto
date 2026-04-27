export type ProviderName = "aiberm" | "crazyroute";

export type ProviderLock = {
  provider: ProviderName;
  model: string;
  reason: string;
};

const normalizeProvider = (value: string): ProviderName | undefined => {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return undefined;
  if (token === "aiberm") return "aiberm";
  if (token === "crazyroute" || token === "crazyrouter" || token === "crazyreoute") return "crazyroute";
  return undefined;
};

function hasProviderKey(provider: ProviderName): boolean {
  if (provider === "aiberm") return !!process.env.AIBERM_API_KEY;
  return !!(process.env.CRAZYROUTE_API_KEY || process.env.CRAZYROUTER_API_KEY || process.env.CRAZYREOUTE_API_KEY);
}

function resolveProviderModel(provider: ProviderName): string {
  if (provider === "aiberm") {
    return (
      process.env.LLM_MODEL_AIBERM ||
      process.env.AIBERM_MODEL ||
      process.env.LLM_MODEL ||
      "openai/gpt-5.4-mini"
    );
  }
  return (
    process.env.LLM_MODEL_CRAZYROUTE ||
    process.env.LLM_MODEL_CRAZYROUTER ||
    process.env.LLM_MODEL_CRAZYREOUTE ||
    process.env.CRAZYROUTE_MODEL ||
    process.env.CRAZYROUTER_MODEL ||
    process.env.CRAZYREOUTE_MODEL ||
    process.env.LLM_MODEL ||
    "openai/gpt-5.4-mini"
  );
}

export function resolveRunProviderLock(preferred?: { provider?: string; model?: string }): ProviderLock {
  const forcedProvider = normalizeProvider(
    preferred?.provider ||
      process.env.SKILL_NATIVE_PROVIDER_LOCK ||
      process.env.LLM_PROVIDER ||
      process.env.LLM_PROVIDER_DEFAULT ||
      "",
  );

  if (forcedProvider && hasProviderKey(forcedProvider)) {
    return {
      provider: forcedProvider,
      model: String(preferred?.model || process.env.SKILL_NATIVE_MODEL_LOCK || resolveProviderModel(forcedProvider)).trim(),
      reason: "forced",
    };
  }

  const order = String(process.env.LLM_PROVIDER_ORDER || "aiberm,crazyroute")
    .split(",")
    .map((x) => normalizeProvider(x))
    .filter((x): x is ProviderName => !!x);

  for (const provider of order) {
    if (!hasProviderKey(provider)) continue;
    return {
      provider,
      model: String(preferred?.model || process.env.SKILL_NATIVE_MODEL_LOCK || resolveProviderModel(provider)).trim(),
      reason: "first_available_in_order",
    };
  }

  return {
    provider: "aiberm",
    model: String(preferred?.model || process.env.SKILL_NATIVE_MODEL_LOCK || resolveProviderModel("aiberm")).trim(),
    reason: "fallback_without_key",
  };
}
