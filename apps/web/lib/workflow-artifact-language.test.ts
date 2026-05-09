import { describe, expect, it } from "vitest";
import {
  containsWorkflowCjk,
  containsWorkflowEncodingNoise,
  containsWorkflowUnknownUnsafeChars,
  isWorkflowArtifactEnglishSafe,
  normalizeWorkflowArtifactToEnglishSafe,
  sanitizeWorkflowArtifactText,
} from "./workflow-artifact-language.ts";

describe("workflow artifact language sanitizer", () => {
  it("keeps normalized Unicode punctuation in English-safe workflow text", () => {
    const input = "Apple’s design — precise, confident, and unapologetically direct… Layout flow: desktop → mobile.";
    const normalized = normalizeWorkflowArtifactToEnglishSafe(input);
    expect(normalized).toBe("Apple’s design — precise, confident, and unapologetically direct… Layout flow: desktop → mobile.");
    expect(isWorkflowArtifactEnglishSafe(normalized)).toBe(true);
    expect(containsWorkflowCjk(normalized)).toBe(false);
    expect(containsWorkflowEncodingNoise(normalized)).toBe(false);
    expect(containsWorkflowUnknownUnsafeChars(normalized)).toBe(false);
  });

  it("repairs common mojibake punctuation into canonical Unicode punctuation", () => {
    const input = "dark sections feel immersive 鈥?light sections feel open";
    expect(containsWorkflowEncodingNoise(input)).toBe(true);
    expect(isWorkflowArtifactEnglishSafe(input)).toBe(false);
    const normalized = normalizeWorkflowArtifactToEnglishSafe(input);
    expect(normalized).toBe("dark sections feel immersive — light sections feel open");
    expect(isWorkflowArtifactEnglishSafe(normalized)).toBe(true);
    expect(containsWorkflowEncodingNoise(normalized)).toBe(false);
  });

  it("falls back when text still contains non-English content", () => {
    const sanitized = sanitizeWorkflowArtifactText("首页设计方向", "Use the selected design system guidance.");
    expect(sanitized).toBe("Use the selected design system guidance.");
  });

  it("rejects arbitrary non-whitelisted Unicode symbols", () => {
    expect(isWorkflowArtifactEnglishSafe("Launch status ✓")).toBe(false);
    expect(containsWorkflowUnknownUnsafeChars("Launch status ✓")).toBe(true);
    expect(sanitizeWorkflowArtifactText("Launch status ✓", "Launch status available.")).toBe("Launch status available.");
  });
});
