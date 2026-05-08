import { beforeEach, describe, expect, it, vi } from "vitest";

const createSpy = vi.fn();
const constructorOptions: any[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: createSpy };

      constructor(options: any) {
        constructorOptions.push(options);
      }
    },
  };
});

describe("design-website llm-executor", () => {
  beforeEach(() => {
    vi.resetModules();
    createSpy.mockReset();
    constructorOptions.length = 0;

    process.env.LLM_PROVIDER = "pptoken";
    process.env.PPTOKEN_API_KEY = "test-pptoken-key";
    delete process.env.PPTOKEN_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  it("sends provider calls with system prompt as top-level parameter instead of system message role", async () => {
    createSpy.mockResolvedValue({
      content: [{ type: "text", text: '{"ok":true}' }],
    });

    const mod = await import("../../skills/design-website-generator/tools/llm-executor");
    await mod.executeLLM("hello world", "system context");

    expect(constructorOptions[0]?.baseURL).toBe("https://api.pptoken.org/v1");
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        system: "system context",
        messages: [{ role: "user", content: "hello world" }],
      }),
    );
    expect(createSpy.mock.calls[0][0].messages).not.toContainEqual(
      expect.objectContaining({ role: "system" }),
    );
  });

  it("retries JSON parsing and accepts fenced JSON payloads", async () => {
    createSpy
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "not json payload" }],
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: '```json\n{"status":"ok","count":2}\n```' }],
      });

    const mod = await import("../../skills/design-website-generator/tools/llm-executor");
    const result = await mod.executeLLMJSON<{ status: string; count: number }>("test prompt", "json please", {
      jsonRetries: 1,
    });

    expect(result).toEqual({ status: "ok", count: 2 });
    expect(createSpy).toHaveBeenCalledTimes(2);
  });
});
