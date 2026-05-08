export type ProviderName = "pptoken" | "aiberm" | "crazyroute";

export type ProviderLock = {
  provider: ProviderName;
  model: string;
  reason: string;
};

function resolveSharedRequestedModel(preferredModel?: string): string {
  const shared = String(
    preferredModel ||
      process.env.SKILL_NATIVE_MODEL_LOCK ||
      process.env.LLM_MODEL ||
      process.env.LLM_MODEL_DEFAULT ||
      "",
  ).trim();
  return shared;
}

function buildProviderLock(provider: ProviderName, preferredModel?: string, reason = "ordered"): ProviderLock {
  const sharedModel = resolveSharedRequestedModel(preferredModel);
  return {
    provider,
    model: String(sharedModel || resolveProviderModel(provider)).trim(),
    reason,
  };
}

function resolveProviderOrder(): ProviderName[] {
  return String(process.env.LLM_PROVIDER_ORDER || "pptoken,aiberm,crazyrouter")
    .split(",")
    .map((x) => normalizeProvider(x))
    .filter((x): x is ProviderName => !!x);
}

export function resolveRunProviderLocks(preferred?: { provider?: string; model?: string }): ProviderLock[] {
  const preferredModel = String(preferred?.model || "").trim();
  const forcedProvider = normalizeProvider(
    preferred?.provider ||
      process.env.SKILL_NATIVE_PROVIDER_LOCK ||
      process.env.LLM_PROVIDER ||
      process.env.LLM_PROVIDER_DEFAULT ||
      "",
  );

  const order = resolveProviderOrder().filter((provider, index, list) => list.indexOf(provider) === index);
  const available = order.filter((provider) => hasProviderKey(provider));

  if (forcedProvider && hasProviderKey(forcedProvider)) {
    return [
      buildProviderLock(forcedProvider, preferredModel, "forced"),
      ...available
        .filter((provider) => provider !== forcedProvider)
        .map((provider) => buildProviderLock(provider, preferredModel, "ordered_fallback")),
    ];
  }

  if (available.length > 0) {
    return available.map((provider, index) =>
      buildProviderLock(provider, preferredModel, index === 0 ? "first_available_in_order" : "ordered_fallback"),
    );
  }

  return [buildProviderLock("pptoken", preferredModel, "fallback_without_key")];
}

const normalizeProvider = (value: string): ProviderName | undefined => {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return undefined;
  if (token === "pptoken") return "pptoken";
  if (token === "aiberm") return "aiberm";
  if (token === "crazyroute" || token === "crazyrouter" || token === "crazyreoute") return "crazyroute";
  return undefined;
};

function hasProviderKey(provider: ProviderName): boolean {
  if (provider === "pptoken") return !!process.env.PPTOKEN_API_KEY;
  if (provider === "aiberm") return !!process.env.AIBERM_API_KEY;
  return !!(process.env.CRAZYROUTE_API_KEY || process.env.CRAZYROUTER_API_KEY || process.env.CRAZYREOUTE_API_KEY);
}

function resolveProviderModel(provider: ProviderName): string {
  if (provider === "pptoken") {
    return (
      process.env.LLM_MODEL_PPTOKEN ||
      process.env.PPTOKEN_MODEL ||
      process.env.LLM_MODEL ||
      "gpt-5.4-mini"
    );
  }
  if (provider === "aiberm") {
    return (
      process.env.LLM_MODEL_AIBERM ||
      process.env.AIBERM_MODEL ||
      process.env.LLM_MODEL ||
      "gpt-5.4-mini"
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
    "gpt-5.4-mini"
  );
}

export function resolveRunProviderLock(preferred?: { provider?: string; model?: string }): ProviderLock {
  return resolveRunProviderLocks(preferred)[0];
}
