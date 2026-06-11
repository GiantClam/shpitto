import { afterEach, describe, expect, it } from "vitest";

import { buildProviderOperationErrorForTesting, resolveProviderAttempts } from "./provider-model.ts";

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
  it("adds provider and phase context to malformed openai-compatible request failures", () => {
    const message = buildProviderOperationErrorForTesting({
      label: "provider_openai_compat_request_failed",
      config: {
        provider: "pptoken",
        modelName: "gpt-5.4-mini",
      },
      phase: "text_model.request",
      error: {
        name: "TypeError",
        message: "Cannot read properties of undefined (reading 'message')",
        request_id: "req_provider_123",
        error: {
          type: "server_error",
          message: "gateway returned malformed envelope",
        },
      },
      response: {
        id: "resp_provider_1",
        choices: [],
      },
    });

    expect(message).toContain("provider_openai_compat_request_failed: provider=pptoken model=gpt-5.4-mini phase=text_model.request");
    expect(message).toContain("request_id=req_provider_123");
    expect(message).toContain("detail=TypeError | Cannot read properties of undefined (reading 'message')");
    expect(message).toContain('upstream={"keys":["type","message"]');
    expect(message).toContain('response={"keys":["id","choices"]');
  });

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
