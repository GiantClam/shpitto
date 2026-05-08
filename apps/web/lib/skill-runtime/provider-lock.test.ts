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
  it("prefers pptoken first in the default provider order", () => {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_PROVIDER_ORDER;
    delete process.env.AIBERM_API_KEY;
    delete process.env.CRAZYROUTE_API_KEY;
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    process.env.PPTOKEN_MODEL = "gpt-5.4-mini";

    expect(resolveRunProviderLock()).toEqual({
      provider: "pptoken",
      model: "gpt-5.4-mini",
      reason: "first_available_in_order",
    });
  });

  it("accepts crazyrouter spelling in provider order aliases", () => {
    delete process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
    delete process.env.PPTOKEN_API_KEY;
    delete process.env.AIBERM_API_KEY;
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLock()).toEqual({
      provider: "crazyroute",
      model: expect.any(String),
      reason: "first_available_in_order",
    });
  });

  it("returns an ordered fallback chain after the forced provider", () => {
    process.env.LLM_PROVIDER = "pptoken";
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
    process.env.LLM_MODEL = "gpt-5.4-mini";
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    process.env.AIBERM_API_KEY = "test-aiberm-key";
    process.env.CRAZYROUTE_API_KEY = "test-crazyroute-key";

    expect(resolveRunProviderLocks().map((item) => item.provider)).toEqual([
      "pptoken",
      "aiberm",
      "crazyroute",
    ]);
    expect(resolveRunProviderLocks().map((item) => item.model)).toEqual([
      "gpt-5.4-mini",
      "gpt-5.4-mini",
      "gpt-5.4-mini",
    ]);
  });
});
