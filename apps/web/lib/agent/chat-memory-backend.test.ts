import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequirementSpec } from "./chat-orchestrator";

type ThreadRow = Record<string, unknown>;
type PreferenceRow = Record<string, unknown>;

function createRequirementSpec(): RequirementSpec {
  return {
    revision: 1,
    explicitConstraints: [],
    source: "structured-parser",
    fields: {},
  };
}

function createSupabaseMemoryMock(params?: {
  threadConflictUpdates?: number;
  preferenceConflictUpdates?: number;
}) {
  const threadRows = new Map<string, ThreadRow>();
  const preferenceRows = new Map<string, PreferenceRow>();
  let threadConflictUpdates = Number(params?.threadConflictUpdates || 0);
  let preferenceConflictUpdates = Number(params?.preferenceConflictUpdates || 0);

  const client = {
    from(table: string) {
      const filters = new Map<string, unknown>();

      return {
        select() {
          return {
            eq(field: string, value: unknown) {
              filters.set(field, value);
              return this;
            },
            async maybeSingle() {
              if (table === "shpitto_chat_thread_memory") {
                const key = String(filters.get("thread_id") || "");
                return { data: threadRows.get(key) || null, error: null };
              }
              if (table === "shpitto_chat_user_preferences") {
                const key = String(filters.get("owner_user_id") || "");
                return { data: preferenceRows.get(key) || null, error: null };
              }
              return { data: null, error: null };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          return {
            select() {
              return {
                async single() {
                  if (table === "shpitto_chat_thread_memory") {
                    const key = String(row.thread_id || "");
                    if (threadRows.has(key)) {
                      return { data: null, error: { code: "23505", message: "duplicate key" } };
                    }
                    const next = {
                      created_at: String(row.updated_at || new Date().toISOString()),
                      ...row,
                    };
                    threadRows.set(key, next);
                    return { data: next, error: null };
                  }
                  if (table === "shpitto_chat_user_preferences") {
                    const key = String(row.owner_user_id || "");
                    if (preferenceRows.has(key)) {
                      return { data: null, error: { code: "23505", message: "duplicate key" } };
                    }
                    const next = {
                      created_at: String(row.updated_at || new Date().toISOString()),
                      ...row,
                    };
                    preferenceRows.set(key, next);
                    return { data: next, error: null };
                  }
                  return { data: row, error: null };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(field: string, value: unknown) {
              filters.set(field, value);
              return this;
            },
            async select() {
              if (table === "shpitto_chat_thread_memory") {
                const key = String(filters.get("thread_id") || "");
                const expectedVersion = Number(filters.get("version") || 0);
                const existing = threadRows.get(key);
                if (!existing) return { data: [], error: null };
                if (threadConflictUpdates > 0) {
                  threadConflictUpdates -= 1;
                  existing.version = Number(existing.version || 0) + 1;
                  threadRows.set(key, existing);
                  return { data: [], error: null };
                }
                if (Number(existing.version || 0) !== expectedVersion) return { data: [], error: null };
                const next = { ...existing, ...payload };
                threadRows.set(key, next);
                return { data: [next], error: null };
              }
              if (table === "shpitto_chat_user_preferences") {
                const key = String(filters.get("owner_user_id") || "");
                const expectedVersion = Number(filters.get("version") || 0);
                const existing = preferenceRows.get(key);
                if (!existing) return { data: [], error: null };
                if (preferenceConflictUpdates > 0) {
                  preferenceConflictUpdates -= 1;
                  existing.version = Number(existing.version || 0) + 1;
                  preferenceRows.set(key, existing);
                  return { data: [], error: null };
                }
                if (Number(existing.version || 0) !== expectedVersion) return { data: [], error: null };
                const next = { ...existing, ...payload };
                preferenceRows.set(key, next);
                return { data: [next], error: null };
              }
              return { data: [], error: null };
            },
          };
        },
      };
    },
  };

  return {
    client,
    state: {
      threadRows,
      preferenceRows,
    },
  };
}

describe("chat-memory backend", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.env = { ...envSnapshot };
  });

  it("merges long-term preferences in file backend", async () => {
    vi.stubEnv("CHAT_MEMORY_BACKEND", "file");
    const memory = await import("./chat-memory");
    await memory.resetChatLangGraphMemoryForTests();

    await memory.writeChatLongTermPreferences({
      ownerUserId: "user-file",
      preferredLocale: "en",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    await memory.writeChatLongTermPreferences({
      ownerUserId: "user-file",
      primaryVisualDirection: "industrial-b2b",
      secondaryVisualTags: ["trustworthy", "blue"],
      updatedAt: "2026-05-08T00:01:00.000Z",
    });

    const saved = await memory.readChatLongTermPreferences("user-file");
    expect(saved?.preferredLocale).toBe("en");
    expect(saved?.primaryVisualDirection).toBe("industrial-b2b");
    expect(saved?.secondaryVisualTags).toEqual(["trustworthy", "blue"]);
  });

  it("retries shared thread-memory writes on optimistic concurrency miss", async () => {
    vi.stubEnv("CHAT_MEMORY_BACKEND", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    const mock = createSupabaseMemoryMock({ threadConflictUpdates: 1 });
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => mock.client,
    }));

    const memory = await import("./chat-memory");

    await memory.writeChatShortTermMemory({
      threadId: "thread-1",
      stage: "drafting",
      recentSummary: "initial",
      revisionPointer: {
        revisionId: "rev-1",
        mode: "generate",
        updatedAt: "2026-05-08T00:00:00.000Z",
      },
      requirementState: {
        slots: [],
        conflicts: [],
        missingCriticalSlots: [],
        readyScore: 0,
        assumptions: [],
        currentValues: createRequirementSpec(),
      },
      updatedAt: "2026-05-08T00:00:00.000Z",
    });

    await memory.writeChatShortTermMemory({
      threadId: "thread-1",
      stage: "previewing",
      recentSummary: "updated",
      revisionPointer: {
        revisionId: "rev-2",
        baseRevisionId: "rev-1",
        mode: "refine",
        updatedAt: "2026-05-08T00:01:00.000Z",
      },
      requirementState: {
        slots: [],
        conflicts: [],
        missingCriticalSlots: [],
        readyScore: 50,
        assumptions: [],
        currentValues: createRequirementSpec(),
      },
      updatedAt: "2026-05-08T00:01:00.000Z",
    });

    const saved = await memory.readChatShortTermMemory("thread-1");
    expect(saved?.stage).toBe("previewing");
    expect(saved?.recentSummary).toBe("updated");
    expect(saved?.revisionPointer.revisionId).toBe("rev-2");
    expect(Number(mock.state.threadRows.get("thread-1")?.version || 0)).toBe(3);
  });

  it("merges long-term preferences in the shared supabase backend", async () => {
    vi.stubEnv("CHAT_MEMORY_BACKEND", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    const mock = createSupabaseMemoryMock({ preferenceConflictUpdates: 1 });
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => mock.client,
    }));

    const memory = await import("./chat-memory");

    await memory.writeChatLongTermPreferences({
      ownerUserId: "user-supabase",
      preferredLocale: "en",
      updatedAt: "2026-05-08T00:00:00.000Z",
    });
    await memory.writeChatLongTermPreferences({
      ownerUserId: "user-supabase",
      primaryVisualDirection: "industrial-b2b",
      secondaryVisualTags: ["blue"],
      updatedAt: "2026-05-08T00:01:00.000Z",
    });

    const saved = await memory.readChatLongTermPreferences("user-supabase");
    expect(saved?.preferredLocale).toBe("en");
    expect(saved?.primaryVisualDirection).toBe("industrial-b2b");
    expect(saved?.secondaryVisualTags).toEqual(["blue"]);
    expect(Number(mock.state.preferenceRows.get("user-supabase")?.version || 0)).toBe(3);
  });
});
