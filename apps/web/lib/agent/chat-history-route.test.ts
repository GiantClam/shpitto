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
        "部署到 Cloudflare",
        "部署成功：https://demo.pages.dev\n(Smoke: pre=passed, post=passed)",
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
});
