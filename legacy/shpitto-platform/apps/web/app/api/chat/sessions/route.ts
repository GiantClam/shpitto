import { NextRequest, NextResponse } from "next/server";
import {
  createChatSessionForOwner,
  listChatSessionsForOwner,
  type ChatSessionSummary,
} from "../../../../lib/agent/chat-task-store";
import { listOwnedProjectSummaries } from "@/lib/agent/db";
import { normalizeProjectTitleForDisplay } from "@/lib/agent/project-title";
import { invalidateLaunchCenterRecentProjectsCache } from "@/lib/launch-center/cache";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";
const SESSION_INDEX_TIMEOUT_MS = 6500;

function toSessionPayload(session: ChatSessionSummary) {
  const previewUrl = session.lastDeployedUrl
    ? session.lastDeployedUrl
    : session.lastTaskId
      ? `/api/chat/tasks/${encodeURIComponent(session.lastTaskId)}/preview/index.html`
      : "";
  return {
    id: session.id,
    title: normalizeProjectTitleForDisplay(session.title, session.id),
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

async function listSessionPayloads(ownerUserId: string, includeArchived: boolean, limit: number) {
  const sessionsPromise = listChatSessionsForOwner(ownerUserId, {
    includeArchived,
    limit,
    includeLegacyBackfill: false,
  });
  const fallbackProjectsPromise = listOwnedProjectSummaries(ownerUserId, limit).catch(() => []);
  const sessionResult = await Promise.race([
    sessionsPromise.then((sessions) => ({ timedOut: false as const, sessions })),
    new Promise<{ timedOut: true; sessions: ChatSessionSummary[] }>((resolve) =>
      setTimeout(() => resolve({ timedOut: true, sessions: [] }), SESSION_INDEX_TIMEOUT_MS),
    ),
  ]);
  const fallbackProjects = await fallbackProjectsPromise;
  const payloads = sessionResult.sessions.map(toSessionPayload);
  if (sessionResult.timedOut && fallbackProjects.length) {
    return fallbackProjects.map((project) => {
      const updatedAt = Date.parse(String(project.updatedAt || "")) || Date.now();
      return {
        id: project.projectId,
        title: normalizeProjectTitleForDisplay(project.projectName, project.projectId),
        archived: false,
        pinned: false,
        lastTaskId: null,
        lastStatus: null,
        lastMessage: null,
        lastMessageAt: null,
        createdAt: updatedAt,
        updatedAt,
        previewUrl:
          String(project.latestDeploymentUrl || "").trim() ||
          (project.deploymentHost ? `https://${project.deploymentHost}` : ""),
      };
    });
  }
  if (!fallbackProjects.length) return payloads;

  const byId = new Map(payloads.map((session) => [session.id, session] as const));
  for (const project of fallbackProjects) {
    if (!project.projectId || byId.has(project.projectId)) continue;
    const updatedAt = Date.parse(String(project.updatedAt || "")) || Date.now();
    byId.set(project.projectId, {
      id: project.projectId,
      title: normalizeProjectTitleForDisplay(project.projectName, project.projectId),
      archived: false,
      pinned: false,
      lastTaskId: null,
      lastStatus: null,
      lastMessage: null,
      lastMessageAt: null,
      createdAt: updatedAt,
      updatedAt,
      previewUrl:
        String(project.latestDeploymentUrl || "").trim() ||
        (project.deploymentHost ? `https://${project.deploymentHost}` : ""),
    });
  }

  return [...byId.values()]
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const includeArchived = String(request.nextUrl.searchParams.get("includeArchived") || "").trim() === "1";
    const limit = Number(request.nextUrl.searchParams.get("limit") || "50");
    const safeLimit = Number.isFinite(limit) ? limit : 50;
    const sessions = await listSessionPayloads(userId, includeArchived, safeLimit);
    return NextResponse.json({
      ok: true,
      sessions,
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
