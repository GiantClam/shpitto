import { NextResponse } from "next/server";
import { getLatestChatTaskForChat, sanitizeTaskResultForClient } from "../../../../lib/agent/chat-task-store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = String(searchParams.get("chatId") || "").trim();

  if (!chatId) {
    return NextResponse.json({ ok: false, error: "Missing chatId." }, { status: 400 });
  }

  const task = await getLatestChatTaskForChat(chatId);
  if (!task) {
    return NextResponse.json({ ok: true, task: null }, { status: 200 });
  }

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
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}

