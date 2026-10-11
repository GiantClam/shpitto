import { describe, expect, it } from "vitest";
import {
  normalizeProviderModelId,
  resolveScenarioAwareProviderModelId,
  shouldUseVisualModelEscalation,
} from "./provider-model-id";

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

  it("escalates mini models for high-visual imported seed runs", () => {
    expect(
      resolveScenarioAwareProviderModelId({
        provider: "pptoken",
        requestedModel: "gpt-5.4-mini",
        surfaceMode: "marketing-landing-site",
        hasImportedSeed: true,
        visualBoldness: "high",
        routeFamilies: ["home"],
      }),
    ).toBe("gpt-5.4");
  });

  it("keeps the conservative model when heuristic authority is active", () => {
    expect(
      shouldUseVisualModelEscalation({
        surfaceMode: "marketing-landing-site",
        seedAuthorityMode: "heuristic-authoritative",
        hasImportedSeed: true,
        visualBoldness: "high",
        routeFamilies: ["home"],
      }),
    ).toBe(false);
  });
});
