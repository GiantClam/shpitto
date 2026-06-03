import { describe, expect, it } from "vitest";

import { buildProviderOperationErrorForTesting } from "./provider-model";

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
});
