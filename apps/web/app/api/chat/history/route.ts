import { NextResponse } from "next/server";
import {
  formatTaskEventSnapshot,
  getChatTaskEvents,
  getLatestChatTaskForChat,
  getLatestPreviewableChatTaskForChat,
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
  const detail = raw.slice(eventMatch[0].length).replace(/^[-:\s]+/, "").trim();
  if (!detail) return { eventType };
  return { eventType, payload: { message: detail } };
}

function repairLegacyMojibakeTimelineText(text: string): string {
  const raw = String(text || "");
  const trimmed = raw.trim();
  if (/^\?{3}\s+Cloudflare$/i.test(trimmed)) return "Deploying to shpitto server";
  const questionMarkDeploy = trimmed.match(/^\?{4,}(https:\/\/\S+)([\s\S]*)$/);
  if (questionMarkDeploy?.[1]) {
    return `Deployment succeeded: ${questionMarkDeploy[1]}${questionMarkDeploy[2] || ""}`;
  }
  return raw;
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

function hasVisibleTaskStatusMessage(
  messages: Array<{ taskId?: string | null; role: string; metadata?: Record<string, unknown> | null }>,
  task: { id: string; status: string },
): boolean {
  const expectedStatus = String(task.status || "").trim();
  if (!expectedStatus) return true;
  return messages.some((message) => {
    if (message.taskId !== task.id) return false;
    if (message.role !== "assistant" && message.role !== "system") return false;
    if (String((message.metadata || {}).cardType || "").trim() === "task_progress") return false;
    const metadataStatus = String((message.metadata || {}).status || "").trim();
    return metadataStatus === expectedStatus;
  });
}

function serializeTaskForClient(task: Awaited<ReturnType<typeof getLatestChatTaskForChat>>) {
  if (!task) return null;
  return {
    id: task.id,
    chatId: task.chatId,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    result: sanitizeTaskResultForClient(task.result),
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = String(searchParams.get("chatId") || "").trim();

  if (!chatId) {
    return NextResponse.json({ ok: false, error: "Missing chatId." }, { status: 400 });
  }

  const [messages, task, previewTask] = await Promise.all([
    listChatTimelineMessages(chatId, 500),
    getLatestChatTaskForChat(chatId),
    getLatestPreviewableChatTaskForChat(chatId, { statuses: ["succeeded"] }),
  ]);
  const events = task?.id ? await getChatTaskEvents(task.id, 500) : [];

  const toReadableTimelineText = (item: (typeof messages)[number]) => {
    const metadata = (item.metadata || {}) as Record<string, unknown>;
    const isSnapshot = String(metadata.source || "").trim() === "task_event_snapshot";
    if (!isSnapshot && item.role !== "system") return repairLegacyMojibakeTimelineText(item.text);
    const metadataEventType = String(metadata.eventType || "").trim();
    const legacy = parseLegacyTaskEventText(item.text);
    const eventType = metadataEventType || legacy.eventType;
    if (!isSnapshot && !legacy.eventType) return repairLegacyMojibakeTimelineText(item.text);
    if (!eventType) return repairLegacyMojibakeTimelineText(item.text);
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
  const taskAssistantText = String(task?.result?.assistantText || "").trim();
  const shouldIncludeTaskResultMessage =
    Boolean(task?.id && taskAssistantText) &&
    (task?.status === "succeeded" || task?.status === "failed") &&
    !hasVisibleTaskStatusMessage(visibleMessages, { id: task!.id, status: task!.status });
  const visibleMessagesWithTaskResult = shouldIncludeTaskResultMessage
    ? [
        ...visibleMessages,
        {
          id: `${task!.id}:result:${task!.status}`,
          chatId: task!.chatId,
          taskId: task!.id,
          ownerUserId: task!.ownerUserId,
          role: "assistant" as const,
          text: taskAssistantText,
          metadata: {
            status: task!.status,
            source: "task_result",
            stage: task!.result?.progress?.stage || null,
            synthetic: true,
          },
          createdAt: task!.updatedAt,
        },
      ]
    : visibleMessages;

  return NextResponse.json(
    {
      ok: true,
      messages: visibleMessagesWithTaskResult.map((item) => ({
        id: item.id,
        chatId: item.chatId,
        taskId: item.taskId || null,
        role: item.role,
        text: toReadableTimelineText(item),
        metadata: item.metadata || null,
        createdAt: item.createdAt,
      })),
      task: serializeTaskForClient(task),
      previewTask: serializeTaskForClient(previewTask),
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
