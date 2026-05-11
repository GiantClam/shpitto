import { describe, expect, it } from "vitest";
import { appendChatTimelineMessage, completeChatTask, createChatTask, failChatTask } from "./chat-task-store";

describe("chat history route", () => {
  it("repairs legacy deployment messages that were persisted with question-mark mojibake", async () => {
    const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
    process.env.CHAT_TASKS_USE_SUPABASE = "0";

    try {
      const chatId = `chat-history-mojibake-${Date.now()}`;

      await appendChatTimelineMessage({
        chatId,
        role: "user",
        text: "??? Cloudflare",
      });
      await appendChatTimelineMessage({
        chatId,
        role: "assistant",
        text: "?????https://demo.pages.dev\n(Smoke: pre=passed, post=passed)",
      });

      const { GET } = await import("../../app/api/chat/history/route");
      const res = await GET(new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`));
      const json = await res.json();
      const messages = json?.messages || [];

      expect(res.status).toBe(200);
      expect(messages.map((item: any) => item.text)).toEqual([
        "Deploying to shpitto server",
        "Deployment succeeded: https://demo.pages.dev\n(Smoke: pre=passed, post=passed)",
      ]);
    } finally {
      if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
      else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
    }
  });

  it("hides task event snapshot messages from timeline", async () => {
    const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
    process.env.CHAT_TASKS_USE_SUPABASE = "0";

    try {
      const chatId = `chat-history-readable-${Date.now()}`;
      const legacyEventText = "task_progress - generating:pages - created /index.html";

      await appendChatTimelineMessage({
        chatId,
        role: "system",
        text: legacyEventText,
        metadata: { source: "task_event_snapshot" },
      });

      const { GET } = await import("../../app/api/chat/history/route");
      const res = await GET(new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json?.ok).toBe(true);
      expect(Array.isArray(json?.messages)).toBe(true);
      expect((json?.messages || []).length).toBe(0);
    } finally {
      if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
      else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
    }
  });

  it("keeps persisted progress cards visible for multiple historical tasks", async () => {
    const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
    process.env.CHAT_TASKS_USE_SUPABASE = "0";

    try {
      const chatId = `chat-history-progress-cards-${Date.now()}`;
      const firstTask = await createChatTask(chatId, undefined, {
        progress: { stage: "queued" } as any,
      });
      await completeChatTask(firstTask.id, {
        assistantText: "First build done.",
        progress: { stage: "done", fileCount: 3 } as any,
      });

      const secondTask = await createChatTask(chatId, undefined, {
        progress: { stage: "queued" } as any,
      });
      await failChatTask(secondTask.id, "Second build failed");

      const { GET } = await import("../../app/api/chat/history/route");
      const res = await GET(new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`));
      const json = await res.json();
      const progressCards = (json?.messages || []).filter((item: any) => item?.metadata?.cardType === "task_progress");

      expect(res.status).toBe(200);
      expect(progressCards).toHaveLength(2);
      expect(progressCards.map((item: any) => item.taskId)).toEqual(expect.arrayContaining([firstTask.id, secondTask.id]));
      expect(progressCards.find((item: any) => item.taskId === firstTask.id)?.metadata?.status).toBe("succeeded");
      expect(progressCards.find((item: any) => item.taskId === secondTask.id)?.metadata?.status).toBe("failed");
    } finally {
      if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
      else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
    }
  });

  it("keeps the latest deployable task available after a newer deploy task fails", async () => {
    const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
    process.env.CHAT_TASKS_USE_SUPABASE = "0";

    try {
      const chatId = `chat-history-preview-baseline-${Date.now()}`;
      const generatedTask = await createChatTask(chatId);
      await completeChatTask(generatedTask.id, {
        assistantText: "Site refined.",
        progress: {
          stage: "refined",
          generatedFiles: ["/index.html", "/styles.css"],
          checkpointProjectPath: "/tmp/chat-refined/project.json",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 2));

      const deployTask = await createChatTask(chatId, undefined, {
        phase: "deploy",
        progress: { stage: "deploying:analytics" },
      });
      await failChatTask(deployTask.id, "Body Timeout Error");

      const { GET } = await import("../../app/api/chat/history/route");
      const res = await GET(new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json?.task?.id).toBe(deployTask.id);
      expect(json?.task?.status).toBe("failed");
      expect(json?.previewTask?.id).toBe(generatedTask.id);
      expect(json?.previewTask?.result?.progress?.generatedFiles).toEqual(["/index.html", "/styles.css"]);
    } finally {
      if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
      else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
    }
  });

  it("keeps previewTask pinned to the latest local preview baseline after a newer deploy succeeds", async () => {
    const prevUseSupabase = process.env.CHAT_TASKS_USE_SUPABASE;
    process.env.CHAT_TASKS_USE_SUPABASE = "0";

    try {
      const chatId = `chat-history-preview-local-${Date.now()}`;
      const generatedTask = await createChatTask(chatId);
      await completeChatTask(generatedTask.id, {
        assistantText: "Preview ready.",
        progress: {
          stage: "done",
          generatedFiles: ["/index.html", "/styles.css"],
          checkpointProjectPath: "/tmp/chat-preview/project.json",
        } as any,
      });

      await new Promise((resolve) => setTimeout(resolve, 2));

      const deployTask = await createChatTask(chatId, undefined, {
        phase: "deploy",
        progress: { stage: "deploying" } as any,
      });
      await completeChatTask(deployTask.id, {
        assistantText: "Deployment succeeded.",
        deployedUrl: "https://demo.pages.dev",
        progress: {
          stage: "deployed",
          generatedFiles: ["/index.html", "/styles.css"],
        } as any,
      });

      const { GET } = await import("../../app/api/chat/history/route");
      const res = await GET(new Request(`http://localhost/api/chat/history?chatId=${encodeURIComponent(chatId)}`));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json?.task?.id).toBe(deployTask.id);
      expect(json?.task?.result?.deployedUrl).toBe("https://demo.pages.dev");
      expect(json?.previewTask?.id).toBe(generatedTask.id);
      expect(String(json?.previewTask?.result?.progress?.checkpointProjectPath || "")).toBe("/tmp/chat-preview/project.json");
    } finally {
      if (prevUseSupabase === undefined) delete process.env.CHAT_TASKS_USE_SUPABASE;
      else process.env.CHAT_TASKS_USE_SUPABASE = prevUseSupabase;
    }
  });
});
