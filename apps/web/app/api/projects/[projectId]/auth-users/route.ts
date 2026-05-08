import { NextRequest, NextResponse } from "next/server";
import { listProjectAuthUsersByProject } from "@/lib/agent/db";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });
    }

    const limitParam = Number(request.nextUrl.searchParams.get("limit") || "100");
    const offsetParam = Number(request.nextUrl.searchParams.get("offset") || "0");
    const limit = Number.isFinite(limitParam) ? limitParam : 100;
    const offset = Number.isFinite(offsetParam) ? Math.max(0, Math.floor(offsetParam)) : 0;
    const items = await listProjectAuthUsersByProject(userId, projectId, limit, offset);

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load project auth users.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
