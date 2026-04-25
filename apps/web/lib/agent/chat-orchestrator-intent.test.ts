import { describe, expect, it } from "vitest";
import { buildRequirementSlots, decideChatIntent, type ConversationStage } from "./chat-orchestrator";

function decide(text: string, stage: ConversationStage) {
  const slots = buildRequirementSlots(
    "LC-CNC industrial manufacturer website with Home About Products Cases Contact, blue style, English audience, CTA contact, deploy cloudflare",
  );
  return decideChatIntent({
    userText: text,
    stage,
    slots,
    isWebsiteSkill: true,
  });
}

describe("chat orchestrator intent", () => {
  it("routes explicit generate to generate", () => {
    const decision = decide("开始生成网站", "drafting");
    expect(decision.intent).toBe("generate");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes preview refinements to refine_preview", () => {
    const decision = decide("把主色改成蓝色", "previewing");
    expect(decision.intent).toBe("refine_preview");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes deployed refinements to refine_deployed", () => {
    const decision = decide("上线版本标题改成 LC-CNC Global", "deployed");
    expect(decision.intent).toBe("refine_deployed");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("routes deploy intent to deploy when baseline exists", () => {
    const decision = decide("deploy to cloudflare", "previewing");
    expect(decision.intent).toBe("deploy");
    expect(decision.shouldCreateTask).toBe(true);
  });

  it("returns clarify for deploy request without baseline", () => {
    const decision = decide("deploy now", "drafting");
    expect(decision.intent).toBe("clarify");
    expect(decision.shouldCreateTask).toBe(false);
  });
});

