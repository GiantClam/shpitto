import { NextRequest, NextResponse } from "next/server";
import {
  createChatSessionForOwner,
  listChatSessionsForOwner,
  type ChatSessionSummary,
} from "../../../../lib/agent/chat-task-store";
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

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const includeArchived = String(request.nextUrl.searchParams.get("includeArchived") || "").trim() === "1";
    const limit = Number(request.nextUrl.searchParams.get("limit") || "50");
    const sessions = await listChatSessionsForOwner(userId, {
      includeArchived,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    return NextResponse.json({
      ok: true,
      sessions: sessions.map(toSessionPayload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list sessions.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const session = await createChatSessionForOwner({
      ownerUserId: userId,
      title: body.title,
    });
    await invalidateLaunchCenterRecentProjectsCache();
    return NextResponse.json({
      ok: true,
      session: toSessionPayload(session),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create session.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
