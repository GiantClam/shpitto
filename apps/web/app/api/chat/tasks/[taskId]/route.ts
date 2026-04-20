import { NextResponse } from "next/server";
import { getChatTask, getChatTaskEvents, sanitizeTaskResultForClient } from "../../../../../lib/agent/chat-task-store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const params = await ctx.params;
  const taskId = String(params?.taskId || "").trim();
  if (!taskId) {
    return NextResponse.json({ ok: false, error: "Missing taskId." }, { status: 400 });
  }

  const task = await getChatTask(taskId);
  if (!task) {
    return NextResponse.json({ ok: false, error: "Task not found." }, { status: 404 });
  }
  const events = await getChatTaskEvents(taskId, 200);

  return NextResponse.json(
    {
      ok: true,
      task: {
        id: task.id,
        chatId: task.chatId,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        result: sanitizeTaskResultForClient(task.result),
      },
      events: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        stage: event.stage,
        payload: event.payload || null,
        createdAt: event.created_at,
      })),
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
