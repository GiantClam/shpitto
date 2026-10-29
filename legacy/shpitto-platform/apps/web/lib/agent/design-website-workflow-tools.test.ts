import { beforeEach, describe, expect, it, vi } from "vitest";

const generateComponentMock = vi.fn();
const executeLLMJSONMock = vi.fn();
const validateComponentMock = vi.fn();

vi.mock("../../skills/design-website-generator/tools/llm-executor", () => ({
  generateComponent: generateComponentMock,
  executeLLMJSON: executeLLMJSONMock,
}));

vi.mock("../../skills/design-website-generator/tools/component-validator", () => ({
  validateComponent: validateComponentMock,
}));

vi.mock("../../skills/design-website-generator/tools/design-system-tools", () => ({
  loadDesignSystem: vi.fn(async () => ({
    name: "test-brand",
    visualTheme: "Clean modern",
    colors: {
      primary: [{ name: "Primary", value: "#123456" }],
      accent: [{ name: "Accent", value: "#654321" }],
      neutral: [],
      semantic: [],
      shadows: [],
    },
    typography: [{ role: "Heading", font: "Space Grotesk", size: "48px", weight: 700, lineHeight: "1.2", letterSpacing: "-0.02em" }],
    shadows: { card: "0 0 0 1px rgba(0,0,0,0.08)" },
    layout: { spacing: [4, 8, 16, 24], maxWidth: "1200px", grid: "12-col", borderRadius: {} },
    dosAndDonts: { dos: [], donts: [] },
  })),
  listDesignSystems: vi.fn(async () => [{ name: "test-brand" }]),
  designSystemToSummary: vi.fn(() => "summary"),
}));

describe("design-website workflow-tools", () => {
  beforeEach(() => {
    vi.resetModules();
    generateComponentMock.mockReset();
    executeLLMJSONMock.mockReset();
    validateComponentMock.mockReset();
  });

  it("retries QA failures up to 2 times before passing", async () => {
    executeLLMJSONMock.mockResolvedValue({
      sections: ["hero"],
      navigation: { type: "horizontal", items: ["Home"] },
      footer: { type: "simple", columns: ["Company"] },
    });

    generateComponentMock
      .mockResolvedValueOnce("<div>attempt-1</div>")
      .mockResolvedValueOnce("<div>attempt-2</div>")
      .mockResolvedValueOnce("<div>attempt-3</div>");

    validateComponentMock
      .mockResolvedValueOnce({
        passed: false,
        score: 60,
        checks: [],
        errors: ["missing typography"],
        warnings: [],
      })
      .mockResolvedValueOnce({
        passed: false,
        score: 72,
        checks: [],
        errors: ["missing spacing"],
        warnings: [],
      })
      .mockResolvedValueOnce({
        passed: true,
        score: 92,
        checks: [],
        errors: [],
        warnings: [],
      })
      .mockResolvedValueOnce({
        passed: true,
        score: 92,
        checks: [],
        errors: [],
        warnings: [],
      });

    const { generateWebsite } = await import("../../skills/design-website-generator/tools/workflow-tools");
    const result = await generateWebsite({
      prompt: "Build a landing page",
      brand: "test-brand",
      sections: ["hero"],
      outputDir: ".tmp/workflow-tools-test",
    });

    expect(result.success).toBe(true);
    expect(generateComponentMock).toHaveBeenCalledTimes(3);
    expect(result.qaReport?.retries).toBe(2);
  });
});
