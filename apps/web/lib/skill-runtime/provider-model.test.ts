import { afterEach, describe, expect, it } from "vitest";

import { resolveProviderAttempts } from "./provider-model.ts";

const snapshot = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  LLM_PROVIDER_ORDER: process.env.LLM_PROVIDER_ORDER,
  LLM_MODEL: process.env.LLM_MODEL,
  PPTOKEN_API_KEY: process.env.PPTOKEN_API_KEY,
  AIBERM_API_KEY: process.env.AIBERM_API_KEY,
  CRAZYROUTE_API_KEY: process.env.CRAZYROUTE_API_KEY,
};

afterEach(() => {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("provider-model", () => {
  it("keeps the fallback chain when a preferred provider is supplied", () => {
    delete process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER_ORDER = "pptoken,aiberm,crazyrouter";
    process.env.LLM_MODEL = "gpt-5.4-mini";
    process.env.PPTOKEN_API_KEY = "pptoken-test-key";
    process.env.AIBERM_API_KEY = "aiberm-test-key";
    process.env.CRAZYROUTE_API_KEY = "crazyroute-test-key";

    const attempts = resolveProviderAttempts({
      provider: "aiberm",
      model: "gpt-5.4-mini",
    });

    expect(attempts.map((attempt) => attempt.config.provider)).toEqual([
      "aiberm",
      "pptoken",
      "crazyroute",
    ]);
    expect(attempts.map((attempt) => attempt.lock.reason)).toEqual([
      "fallback_chain_aiberm",
      "default_locked_pptoken",
      "fallback_chain_crazyroute",
    ]);
  });
});
