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
  it("locks to pptoken by default", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_PROVIDER_ORDER;
    delete process.env.AIBERM_API_KEY;
    delete process.env.CRAZYROUTE_API_KEY;
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";

    expect(resolveRunProviderLock()).toEqual({
      provider: "pptoken",
      model: "gpt-5.4-mini",
      reason: "default_locked_pptoken",
    });
  });

  it("keeps pptoken as the only default provider even when provider order includes others", () => {
    delete process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    process.env.AIBERM_API_KEY = "test-aiberm-key";
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLocks()).toEqual([
      {
        provider: "pptoken",
        model: "gpt-5.4-mini",
        reason: "default_locked_pptoken",
      },
    ]);
  });

  it("treats LLM_PROVIDER as an explicit manual provider selection", () => {
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
        reason: "manual_preferred_aiberm",
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

  it("still locks to pptoken when the key is missing", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.PPTOKEN_API_KEY;
    process.env.AIBERM_API_KEY = "test-aiberm-key";
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLock()).toEqual({
      provider: "pptoken",
      model: "gpt-5.4-mini",
      reason: "default_locked_pptoken_missing_key",
    });
  });

  it("ignores provider order for default lock selection", () => {
    delete process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER_ORDER = "aiberm,crazyrouter";
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    process.env.AIBERM_API_KEY = "test-aiberm-key";
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLocks().map((lock) => lock.provider)).toEqual([
      "pptoken",
    ]);
  });
});
