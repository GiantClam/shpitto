import { NextRequest, NextResponse } from "next/server";
import {
  updateChatSessionForOwner,
  type ChatSessionSummary,
} from "../../../../../lib/agent/chat-task-store";
import { invalidateLaunchCenterRecentProjectsCache } from "@/lib/launch-center/cache";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

function toSessionPayload(session: ChatSessionSummary) {
  const previewUrl = session.lastDeployedUrl
    ? session.lastDeployedUrl
    : session.lastTaskId
      ? `/api/chat/tasks/${encodeURIComponent(session.lastTaskId)}/preview/index.html`
      : "";
  return {
    id: session.id,
    title: session.title,
    archived: session.archived,
    pinned: session.pinned,
    lastTaskId: session.lastTaskId || null,
    lastStatus: session.lastStatus || null,
    lastMessage: session.lastMessage || null,
    lastMessageAt: session.lastMessageAt || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    previewUrl,
  };
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ chatId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const params = await ctx.params;
    const chatId = String(params.chatId || "").trim();
    if (!chatId) {
      return NextResponse.json({ ok: false, error: "Missing chatId." }, { status: 400 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      archived?: boolean;
      pinned?: boolean;
    };
    const session = await updateChatSessionForOwner({
      chatId,
      ownerUserId: userId,
      title: body.title,
      archived: typeof body.archived === "boolean" ? body.archived : undefined,
      pinned: typeof body.pinned === "boolean" ? body.pinned : undefined,
    });
    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
    }
    await invalidateLaunchCenterRecentProjectsCache();
    return NextResponse.json({
      ok: true,
      session: toSessionPayload(session),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update session.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
