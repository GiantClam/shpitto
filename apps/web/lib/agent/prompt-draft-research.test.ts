import { describe, expect, it } from "vitest";
import { buildRequirementSlots } from "./chat-orchestrator";
import { buildPromptDraftWithResearch } from "./prompt-draft-research";

describe("prompt draft research", () => {
  it("falls back in test env and still keeps user constraints in draft", async () => {
    const requirement =
      "给我做 LC-CNC 英文官网，包含 Home/About/Products/Cases/Contact，主色 #22c55e，部署到 cloudflare";
    const slots = buildRequirementSlots(requirement);
    const result = await buildPromptDraftWithResearch({
      requirementText: requirement,
      slots,
    });

    expect(result.usedWebSearch).toBe(false);
    expect(String(result.fallbackReason || "")).toContain("test_environment_skip_network");
    expect(result.promptDraft).toContain("用户显式约束");
    expect(result.draftMode).toBe("template");
    expect(result.promptDraft).toContain("LC-CNC");
    expect(result.promptDraft).toContain("#22c55e");
    expect(result.promptDraft).toContain("cloudflare");
  });

  it("uses provider-gated fallback reason instead of openai-only key check", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAibermKey = process.env.AIBERM_API_KEY;
    const prevCrazyrouteKey = process.env.CRAZYROUTE_API_KEY;
    try {
      (process.env as any).NODE_ENV = "development";
      delete process.env.AIBERM_API_KEY;
      delete process.env.CRAZYROUTE_API_KEY;

      const result = await buildPromptDraftWithResearch({
        requirementText: "build a product website",
        slots: buildRequirementSlots("build a product website"),
      });

      expect(result.usedWebSearch).toBe(false);
      expect(String(result.fallbackReason || "")).toContain("missing_provider_api_key");
      expect(String(result.fallbackReason || "")).not.toContain("openai");
      expect(result.draftMode).toBe("template");
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
      if (prevAibermKey === undefined) {
        delete process.env.AIBERM_API_KEY;
      } else {
        process.env.AIBERM_API_KEY = prevAibermKey;
      }
      if (prevCrazyrouteKey === undefined) {
        delete process.env.CRAZYROUTE_API_KEY;
      } else {
        process.env.CRAZYROUTE_API_KEY = prevCrazyrouteKey;
      }
    }
  });

  it("returns missing_serper_api_key when web search enabled without serper key", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevAibermKey = process.env.AIBERM_API_KEY;
    const prevSerperKey = process.env.SERPER_API_KEY;
    const prevLlmEnabled = process.env.CHAT_DRAFT_LLM_ENABLED;
    try {
      (process.env as any).NODE_ENV = "development";
      process.env.AIBERM_API_KEY = "test-aiberm-key";
      delete process.env.SERPER_API_KEY;
      process.env.CHAT_DRAFT_LLM_ENABLED = "0";

      const result = await buildPromptDraftWithResearch({
        requirementText: "build a product website",
        slots: buildRequirementSlots("build a product website"),
      });

      expect(result.usedWebSearch).toBe(false);
      expect(String(result.fallbackReason || "")).toContain("missing_serper_api_key");
      expect(result.draftMode).toBe("template");
    } finally {
      (process.env as any).NODE_ENV = prevNodeEnv;
      if (prevAibermKey === undefined) {
        delete process.env.AIBERM_API_KEY;
      } else {
        process.env.AIBERM_API_KEY = prevAibermKey;
      }
      if (prevSerperKey === undefined) {
        delete process.env.SERPER_API_KEY;
      } else {
        process.env.SERPER_API_KEY = prevSerperKey;
      }
      if (prevLlmEnabled === undefined) {
        delete process.env.CHAT_DRAFT_LLM_ENABLED;
      } else {
        process.env.CHAT_DRAFT_LLM_ENABLED = prevLlmEnabled;
      }
    }
  });
});
