import { afterEach, describe, expect, it, vi } from "vitest";

describe("chat-task-store Supabase enqueue retry", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.env = { ...envSnapshot };
  });

  it("retries transient Supabase task insert failures with the same task id", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CHAT_TASKS_USE_SUPABASE", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("SUPABASE_TASK_FETCH_RETRIES", "1");
    vi.stubEnv("SUPABASE_TASK_RETRY_BASE_MS", "0");

    let taskInsertCalls = 0;
    let insertedTaskId = "";

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({
        from: (table: string) => {
          if (table === "shpitto_chat_tasks") {
            return {
              insert: (row: Record<string, unknown>) => {
                taskInsertCalls += 1;
                insertedTaskId = String(row.id || "");
                return {
                  select: () => ({
                    single: async () => {
                      if (taskInsertCalls === 1) {
                        return { data: null, error: { message: "Service unavailable", status: 503 } };
                      }
                      return { data: row, error: null };
                    },
                  }),
                };
              },
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            };
          }

          if (table === "shpitto_chat_sessions") {
            return {
              upsert: (row: Record<string, unknown>) => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: row.id,
                      owner_user_id: row.owner_user_id || null,
                      title: "Session",
                      archived: false,
                      pinned: false,
                      last_task_id: row.last_task_id || null,
                      last_message: row.last_message || null,
                      last_message_at: row.last_message_at || null,
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }

          return {
            insert: () => ({ data: null, error: null }),
          };
        },
      }),
    }));

    const { createChatTask } = await import("./chat-task-store");

    const task = await createChatTask("chat-retry", "user-1", { assistantText: "queued" });

    expect(task.status).toBe("queued");
    expect(task.id).toBe(insertedTaskId);
    expect(taskInsertCalls).toBe(2);
  });

  it("treats a blank CHAT_TASKS_USE_SUPABASE value as disabled", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CHAT_TASKS_USE_SUPABASE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    const { createChatTask } = await import("./chat-task-store");
    const task = await createChatTask("chat-local", "user-local", { assistantText: "queued" });

    expect(task.chatId).toBe("chat-local");
    expect(task.ownerUserId).toBe("user-local");
    expect(task.status).toBe("queued");
  });
});
