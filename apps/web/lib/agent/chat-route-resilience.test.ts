import { afterEach, describe, expect, it, vi } from "vitest";

describe("chat route resilience", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("degrades latest task read timeouts instead of failing submission", async () => {
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
    expect(res.status).toBe(200);
  });

  it("reuses the latest running task when active task lookup times out", async () => {
    vi.resetModules();
    const runningTask = {
      id: "task-running-1",
      chatId: "chat-running-fallback",
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      result: {
        internal: {
          inputState: {
            workflow_context: {
              executionMode: "generate",
            },
          },
        },
        progress: {
          stage: "generating:tool-round-6:/index.html",
          nextStep: "generate",
        },
      },
    };
    vi.doMock("./chat-task-store", async () => {
      const actual =
        await vi.importActual<typeof import("./chat-task-store")>(
          "./chat-task-store",
        );
      return {
        ...actual,
        getActiveChatTask: vi.fn(async () => {
          const timeoutError = new Error(
            "TypeError: fetch failed | details: ConnectTimeoutError",
          );
          (timeoutError as Error & { code?: string }).code =
            "UND_ERR_CONNECT_TIMEOUT";
          throw timeoutError;
        }),
        getLatestChatTaskForChat: vi.fn(async () => runningTask),
      };
    });

    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "chat-running-fallback",
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "继续优化首页 hero" }],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
  });

  it("rolls back a new billing usage reservation when task enqueue fails", async () => {
    vi.resetModules();
    const reserveCreatedProjectUsage = vi.fn(async () => undefined);
    const releaseCreatedProjectUsageReservation = vi.fn(async () => undefined);
    const hasBillableProject = vi.fn(async () => false);

    vi.doMock("../billing/enforcement", async () => {
      class BillingAccessError extends Error {
        status = 402;
        code = "billing_blocked";
      }
      return {
        BillingAccessError,
        assertCanCreateProject: vi.fn(async () => ({
          enforcementEnabled: true,
          usedSites: 0,
        })),
        assertCanMutatePublishedSite: vi.fn(async () => ({
          enforcementEnabled: true,
          usedSites: 0,
        })),
      };
    });
    vi.doMock("../billing/store", async () => ({
      hasBillableProject,
      reserveCreatedProjectUsage,
      releaseCreatedProjectUsageReservation,
    }));
    vi.doMock("./chat-task-store", async () => {
      const actual = await vi.importActual<typeof import("./chat-task-store")>("./chat-task-store");
      return {
        ...actual,
        createChatTask: vi.fn(async () => {
          const timeoutError = new Error("TypeError: fetch failed | details: ConnectTimeoutError");
          (timeoutError as Error & { code?: string }).code = "UND_ERR_CONNECT_TIMEOUT";
          throw timeoutError;
        }),
      };
    });

    const { POST } = await import("../../app/api/chat/route");
    const chatId = `chat-enqueue-fail-${Date.now()}`;
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        user_id: "user-1",
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "__SHP_CONFIRM_GENERATE__\nGenerate a website" }],
          },
        ],
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(503);
    expect(hasBillableProject).toHaveBeenCalledWith("user-1", chatId);
    expect(reserveCreatedProjectUsage).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: "user-1", sourceProjectId: chatId }),
    );
    expect(releaseCreatedProjectUsageReservation).toHaveBeenCalledWith({
      ownerUserId: "user-1",
      sourceProjectId: chatId,
    });
  });

  it("returns the queued task even when post-enqueue cache invalidation fails", async () => {
    vi.resetModules();
    vi.doUnmock("./chat-task-store");
    vi.doUnmock("../billing/store");
    vi.doUnmock("../billing/enforcement");
    vi.doMock("../launch-center/cache", async () => ({
      invalidateLaunchCenterRecentProjectsCache: vi.fn(async () => {
        throw new Error("cache unavailable");
      }),
    }));

    const { POST } = await import("../../app/api/chat/route");
    const chatId = `chat-post-enqueue-failure-${Date.now()}`;
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "__SHP_CONFIRM_GENERATE__\nGenerate a website" }],
          },
        ],
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(202);
  });
});
