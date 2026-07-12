import { describe, expect, it } from "vitest";
import { runAiImageToolTemplateFeatureGate } from "./template-feature-gate.ts";

describe("ai-image-tool template feature gate", () => {
  it("passes implemented contract and artifact checks", () => {
    const findings = runAiImageToolTemplateFeatureGate();
    const byId = Object.fromEntries(findings.map((item) => [item.id, item] as const));

    expect(byId["route-contract-required-routes"]?.status).toBe("pass");
    expect(byId["billing-stripe-adapter-contract"]?.status).toBe("pass");
    expect(byId["payload-admin-contract"]?.status).toBe("pass");
    expect(byId["i18n-contract"]?.status).toBe("pass");
    expect(byId["template-export-artifacts"]?.status).toBe("pass");
    expect(byId["template-secret-boundary-example"]?.status).toBe("pass");
  });
});
