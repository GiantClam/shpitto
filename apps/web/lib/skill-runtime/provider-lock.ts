export type ProviderName = "pptoken" | "aiberm" | "crazyroute";

import { DEFAULT_OPENAI_COMPAT_MODEL, normalizeProviderModelId } from "./provider-model-id.ts";

export type ProviderLock = {
  provider: ProviderName;
  model: string;
  reason: string;
};

const DEFAULT_LOCKED_PROVIDER: ProviderName = "aiberm";
const DEFAULT_PROVIDER_ORDER: ProviderName[] = ["aiberm", "pptoken", "crazyroute"];

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
    model: normalizeProviderModelId(provider, String(sharedModel || resolveProviderModel(provider)).trim(), DEFAULT_OPENAI_COMPAT_MODEL),
    reason,
  };
}

function resolveDefaultProviderOrder(): ProviderName[] {
  const configured = String(process.env.LLM_PROVIDER_ORDER || "").trim();
  const normalized = configured
    .split(/[,\s]+/g)
    .map((token) => normalizeProvider(token))
    .filter((provider): provider is ProviderName => !!provider);
  const ordered = [
    DEFAULT_LOCKED_PROVIDER,
    ...normalized,
    ...DEFAULT_PROVIDER_ORDER,
  ].filter((provider, index, list) => list.indexOf(provider) === index);
  return ordered.length > 0 ? ordered : [...DEFAULT_PROVIDER_ORDER];
}

function reorderProvidersByPreference(
  providers: ProviderName[],
  preferredProvider: ProviderName | undefined,
): ProviderName[] {
  if (!preferredProvider || providers.length <= 1) return providers;
  const preferredIndex = providers.indexOf(preferredProvider);
  if (preferredIndex <= 0) return providers;
  return [providers[preferredIndex], ...providers.slice(0, preferredIndex), ...providers.slice(preferredIndex + 1)];
}

export function resolveRunProviderLocks(preferred?: { provider?: string; model?: string }): ProviderLock[] {
  const preferredModel = String(preferred?.model || "").trim();
  const forcedProvider = normalizeProvider(preferred?.provider || process.env.SKILL_NATIVE_PROVIDER_LOCK || "");
  const preferredProvider = normalizeProvider(process.env.LLM_PROVIDER || process.env.LLM_PROVIDER_DEFAULT || "");

  if (forcedProvider) {
    return [buildProviderLock(forcedProvider, preferredModel, "manual_locked")];
  }

  const orderedProviders = reorderProvidersByPreference(resolveDefaultProviderOrder(), preferredProvider);
  return orderedProviders.map((provider, index) => {
    const reason =
      index === 0
        ? provider === DEFAULT_LOCKED_PROVIDER
          ? hasProviderKey(DEFAULT_LOCKED_PROVIDER)
            ? "default_locked_aiberm"
            : "default_locked_aiberm_missing_key"
          : `env_preferred_${provider}`
        : `fallback_chain_${provider}`;
    return buildProviderLock(provider, preferredModel, reason);
  });
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
    return normalizeProviderModelId(provider, (
      process.env.LLM_MODEL_PPTOKEN ||
      process.env.PPTOKEN_MODEL ||
      process.env.LLM_MODEL ||
      DEFAULT_OPENAI_COMPAT_MODEL
    ), DEFAULT_OPENAI_COMPAT_MODEL);
  }
  if (provider === "aiberm") {
    return normalizeProviderModelId(provider, (
      process.env.LLM_MODEL_AIBERM ||
      process.env.AIBERM_MODEL ||
      process.env.LLM_MODEL ||
      DEFAULT_OPENAI_COMPAT_MODEL
    ), DEFAULT_OPENAI_COMPAT_MODEL);
  }
  return normalizeProviderModelId(provider, (
    process.env.LLM_MODEL_CRAZYROUTE ||
    process.env.LLM_MODEL_CRAZYROUTER ||
    process.env.LLM_MODEL_CRAZYREOUTE ||
    process.env.CRAZYROUTE_MODEL ||
    process.env.CRAZYROUTER_MODEL ||
    process.env.CRAZYREOUTE_MODEL ||
    process.env.LLM_MODEL ||
    DEFAULT_OPENAI_COMPAT_MODEL
  ), DEFAULT_OPENAI_COMPAT_MODEL);
}

export function resolveRunProviderLock(preferred?: { provider?: string; model?: string }): ProviderLock {
  return resolveRunProviderLocks(preferred)[0];
}
