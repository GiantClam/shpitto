import { NextResponse } from "next/server";
import {
  formatTaskEventSnapshot,
  getChatTaskEvents,
  getLatestChatTaskForChat,
  listChatTimelineMessages,
  sanitizeTaskResultForClient,
} from "../../../../lib/agent/chat-task-store";

export const runtime = "nodejs";

function parseLegacyTaskEventText(text: string): { eventType?: string; payload?: Record<string, unknown> } {
  const raw = String(text || "").trim();
  if (!raw) return {};
  const eventMatch = raw.match(/^(task_[a-z_]+)\b/i);
  if (!eventMatch) return {};
  const eventType = String(eventMatch[1] || "").trim().toLowerCase();
  if (!eventType) return {};
  const detail = raw
    .slice(eventMatch[0].length)
    .replace(/^[-:：\s]+/, "")
    .trim();
  if (!detail) return { eventType };
  return { eventType, payload: { message: detail } };
}

function isTaskEventTimelineMessage(item: { role: string; text: string; metadata?: Record<string, unknown> | null }): boolean {
  const metadata = (item.metadata || {}) as Record<string, unknown>;
  const source = String(metadata.source || "").trim().toLowerCase();
  if (source === "task_event_snapshot") return true;

  const metadataEventType = String(metadata.eventType || "").trim().toLowerCase();
  if (metadataEventType.startsWith("task_")) return true;

  const legacy = parseLegacyTaskEventText(item.text);
  return String(legacy.eventType || "").trim().toLowerCase().startsWith("task_");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = String(searchParams.get("chatId") || "").trim();

  if (!chatId) {
    return NextResponse.json({ ok: false, error: "Missing chatId." }, { status: 400 });
  }

  const [messages, task] = await Promise.all([
    listChatTimelineMessages(chatId, 500),
    getLatestChatTaskForChat(chatId),
  ]);
  const events = task?.id ? await getChatTaskEvents(task.id, 500) : [];

  const toReadableTimelineText = (item: (typeof messages)[number]) => {
    const metadata = (item.metadata || {}) as Record<string, unknown>;
    const isSnapshot = String(metadata.source || "").trim() === "task_event_snapshot";
    if (!isSnapshot && item.role !== "system") return item.text;
    const metadataEventType = String(metadata.eventType || "").trim();
    const legacy = parseLegacyTaskEventText(item.text);
    const eventType = metadataEventType || legacy.eventType;
    if (!isSnapshot && !legacy.eventType) return item.text;
    if (!eventType) return item.text;
    return formatTaskEventSnapshot({
      eventType,
      stage: String(metadata.stage || "").trim() || undefined,
      payload:
        metadata.payload && typeof metadata.payload === "object"
          ? (metadata.payload as Record<string, unknown>)
          : legacy.payload,
    });
  };

  const visibleMessages = messages.filter((item) => !isTaskEventTimelineMessage(item));

  return NextResponse.json(
    {
      ok: true,
      messages: visibleMessages.map((item) => ({
        id: item.id,
        chatId: item.chatId,
        taskId: item.taskId || null,
        role: item.role,
        text: toReadableTimelineText(item),
        metadata: item.metadata || null,
        createdAt: item.createdAt,
      })),
      task: task
        ? {
            id: task.id,
            chatId: task.chatId,
            status: task.status,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            result: sanitizeTaskResultForClient(task.result),
          }
        : null,
      events: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        stage: event.stage,
        payload: event.payload || null,
        text: formatTaskEventSnapshot({
          eventType: event.event_type,
          stage: event.stage || undefined,
          payload: event.payload || undefined,
        }),
        createdAt: event.created_at,
      })),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
