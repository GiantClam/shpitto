import { describe, expect, it } from "vitest";
import { normalizeProviderModelId } from "./provider-model-id";

describe("provider-model-id", () => {
  it("strips the openai prefix for pptoken models", () => {
    expect(normalizeProviderModelId("pptoken", "openai/gpt-5.4-mini")).toBe("gpt-5.4-mini");
  });

  it("keeps native pptoken model names unchanged", () => {
    expect(normalizeProviderModelId("pptoken", "gpt-5.4")).toBe("gpt-5.4");
  });

  it("continues stripping the openai prefix for crazyroute models", () => {
    expect(normalizeProviderModelId("crazyroute", "openai/gpt-5.4-mini")).toBe("gpt-5.4-mini");
  });

  it("does not rewrite aiberm model ids", () => {
    expect(normalizeProviderModelId("aiberm", "openai/gpt-5.4-mini")).toBe("openai/gpt-5.4-mini");
  });
});
