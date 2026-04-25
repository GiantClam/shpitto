import { describe, expect, it } from "vitest";
import { listChatTimelineMessages } from "./chat-task-store";

describe("chat ux timeline cards", () => {
  it("writes requirement progress and intent decision cards during clarify flow", async () => {
    const chatId = `chat-ux-${Date.now()}`;
    const { POST } = await import("../../app/api/chat/route");
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: chatId,
        messages: [{ role: "user", parts: [{ type: "text", text: "给我做个网站" }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const timeline = await listChatTimelineMessages(chatId, 50);
    const cardTypes = timeline
      .map((item) => String((item.metadata || {}).cardType || "").trim())
      .filter(Boolean);
    expect(cardTypes).toContain("requirement_progress");
    expect(cardTypes).toContain("prompt_draft");
    expect(cardTypes).toContain("intent_decision");
  });
});

