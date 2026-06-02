import { afterEach, describe, expect, it, vi } from "vitest";

describe("chat task route", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.env = { ...envSnapshot };
  });

  it("serves a created task when CHAT_TASKS_USE_SUPABASE is blank but Supabase is configured", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CHAT_TASKS_USE_SUPABASE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    const taskRows = new Map<string, Record<string, unknown>>();
    const sessionRows = new Map<string, Record<string, unknown>>();

    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({
        from: (table: string) => {
          if (table === "shpitto_chat_tasks") {
            return {
              insert: (row: Record<string, unknown>) => {
                taskRows.set(String(row.id), row);
                return {
                  select: () => ({
                    single: async () => ({ data: row, error: null }),
                  }),
                };
              },
              select: () => ({
                eq: (_column: string, value: string) => ({
                  maybeSingle: async () => ({ data: taskRows.get(value) || null, error: null }),
                }),
              }),
            };
          }

          if (table === "shpitto_chat_sessions") {
            return {
              upsert: (row: Record<string, unknown>) => {
                sessionRows.set(String(row.id), row);
                return {
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
                };
              },
            };
          }

          if (table === "shpitto_chat_task_events") {
            return {
              insert: async () => ({ error: null }),
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            };
          }

          if (table === "shpitto_chat_messages") {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
              insert: async () => ({ error: null }),
              update: () => ({
                eq: async () => ({ error: null }),
              }),
            };
          }

          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        },
      }),
    }));

    const { createChatTask } = await import("./chat-task-store");
    const task = await createChatTask("chat-prod-like", "user-prod", { assistantText: "queued" });

    expect(taskRows.has(task.id)).toBe(true);
    expect(sessionRows.size).toBe(1);

    const { GET } = await import("../../app/api/chat/tasks/[taskId]/route");
    const response = await GET(new Request(`http://localhost/api/chat/tasks/${task.id}`), {
      params: Promise.resolve({ taskId: task.id }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.task?.id).toBe(task.id);
    expect(json.task?.chatId).toBe("chat-prod-like");
    expect(json.task?.status).toBe("queued");
  });
});
