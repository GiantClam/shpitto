import { afterEach, describe, expect, it, vi } from "vitest";

describe("chat route resilience", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns 503 when task-store session lookup times out", async () => {
    vi.resetModules();
    vi.doMock("./chat-task-store", async () => {
      const actual =
        await vi.importActual<typeof import("./chat-task-store")>(
          "./chat-task-store",
        );
      return {
        ...actual,
        getLatestChatTaskForChat: vi.fn(async () => {
          const timeoutError = new Error(
            "TypeError: fetch failed | details: ConnectTimeoutError",
          );
          (timeoutError as Error & { code?: string }).code =
            "UND_ERR_CONNECT_TIMEOUT";
          throw timeoutError;
        }),
      };
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: `chat-timeout-${Date.now()}`,
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "Generate a website" }],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
  });
});
