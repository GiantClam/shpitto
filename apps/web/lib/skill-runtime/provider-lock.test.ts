import { afterEach, describe, expect, it } from "vitest";
import { resolveRunProviderLock, resolveRunProviderLocks } from "./provider-lock";

const snapshot = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  LLM_PROVIDER_ORDER: process.env.LLM_PROVIDER_ORDER,
  LLM_MODEL: process.env.LLM_MODEL,
  PPTOKEN_API_KEY: process.env.PPTOKEN_API_KEY,
  PPTOKEN_MODEL: process.env.PPTOKEN_MODEL,
  AIBERM_API_KEY: process.env.AIBERM_API_KEY,
  CRAZYROUTE_API_KEY: process.env.CRAZYROUTE_API_KEY,
};

afterEach(() => {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("provider-lock", () => {
  it("locks to aiberm by default", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_PROVIDER_ORDER;
    delete process.env.PPTOKEN_API_KEY;
    delete process.env.CRAZYROUTE_API_KEY;
    process.env.AIBERM_API_KEY = "test-aiberm-key";

    expect(resolveRunProviderLock()).toEqual({
      provider: "aiberm",
      model: "gpt-5.4-mini",
      reason: "default_locked_aiberm",
    });
  });

  it("keeps aiberm locked first and builds a fallback chain from provider order", () => {
    delete process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    process.env.AIBERM_API_KEY = "test-aiberm-key";
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLocks()).toEqual([
      {
        provider: "aiberm",
        model: "gpt-5.4-mini",
        reason: "default_locked_aiberm",
      },
      {
        provider: "pptoken",
        model: "gpt-5.4-mini",
        reason: "fallback_chain_pptoken",
      },
      {
        provider: "crazyroute",
        model: "gpt-5.4-mini",
        reason: "fallback_chain_crazyroute",
      },
    ]);
  });

  it("treats LLM_PROVIDER as a preferred provider while preserving fallback chain", () => {
    process.env.LLM_PROVIDER = "aiberm";
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
    process.env.LLM_MODEL = "gpt-5.4-mini";
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    process.env.AIBERM_API_KEY = "test-aiberm-key";
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLocks()).toEqual([
      {
        provider: "aiberm",
        model: "gpt-5.4-mini",
        reason: "default_locked_aiberm",
      },
      {
        provider: "pptoken",
        model: "gpt-5.4-mini",
        reason: "fallback_chain_pptoken",
      },
      {
        provider: "crazyroute",
        model: "gpt-5.4-mini",
        reason: "fallback_chain_crazyroute",
      },
    ]);
  });

  it("still allows SKILL_NATIVE_PROVIDER_LOCK to force a single provider", () => {
    const previousSkillNativeProviderLock = process.env.SKILL_NATIVE_PROVIDER_LOCK;
    try {
      process.env.SKILL_NATIVE_PROVIDER_LOCK = "aiberm";
      process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
      process.env.LLM_MODEL = "gpt-5.4-mini";
      process.env.PPTOKEN_API_KEY = "test-pptoken-key";
      process.env.AIBERM_API_KEY = "test-aiberm-key";
      process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

      expect(resolveRunProviderLocks()).toEqual([
        {
          provider: "aiberm",
          model: "gpt-5.4-mini",
          reason: "manual_locked",
        },
      ]);
    } finally {
      if (previousSkillNativeProviderLock === undefined) delete process.env.SKILL_NATIVE_PROVIDER_LOCK;
      else process.env.SKILL_NATIVE_PROVIDER_LOCK = previousSkillNativeProviderLock;
    }
  });

  it("accepts crazyrouter spelling for manual provider aliases", () => {
    delete process.env.LLM_PROVIDER;
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(
      resolveRunProviderLock({
        provider: "crazyrouter",
        model: "openai/gpt-5.4-mini",
      }),
    ).toEqual({
      provider: "crazyroute",
      model: "gpt-5.4-mini",
      reason: "manual_locked",
    });
  });

  it("still locks to aiberm when the key is missing", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.AIBERM_API_KEY;
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLock()).toEqual({
      provider: "aiberm",
      model: "gpt-5.4-mini",
      reason: "default_locked_aiberm_missing_key",
    });
  });

  it("prepends aiberm even when provider order omits it so fallback order stays deterministic", () => {
    delete process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER_ORDER = "pptoken,crazyrouter";
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    process.env.AIBERM_API_KEY = "test-aiberm-key";
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLocks().map((lock) => lock.provider)).toEqual([
      "aiberm",
      "pptoken",
      "crazyroute",
    ]);
  });
});
