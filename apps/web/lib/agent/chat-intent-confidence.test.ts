import { describe, expect, it } from "vitest";
import { buildRequirementSlots, decideChatIntent } from "./chat-orchestrator";

describe("chat intent confidence", () => {
  it("keeps ambiguous drafting input in clarify mode", () => {
    const slots = buildRequirementSlots("随便做个东西");
    const decision = decideChatIntent({
      userText: "随便弄一下",
      stage: "drafting",
      slots,
      isWebsiteSkill: true,
    });
    expect(decision.intent).toBe("clarify");
    expect(decision.shouldCreateTask).toBe(false);
    expect(decision.confidence).toBeGreaterThan(0.7);
  });
});

