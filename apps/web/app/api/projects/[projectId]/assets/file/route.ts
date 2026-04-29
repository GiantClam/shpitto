import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";
import { getProjectAssetObject } from "@/lib/project-assets";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const key = String(request.nextUrl.searchParams.get("key") || "").trim();
    if (!key) return NextResponse.json({ ok: false, error: "Missing asset key." }, { status: 400 });

    const object = await getProjectAssetObject({
      ownerUserId: userId,
      projectId,
      key,
    });
    if (!object || object.skipped || !object.ok || !("body" in object) || !object.body) {
      return NextResponse.json({ ok: false, error: "Asset not found." }, { status: 404 });
    }

    return new NextResponse(object.body, {
      status: 200,
      headers: {
        "Content-Type": object.contentType || "application/octet-stream",
        "Content-Length": String(object.contentLength || object.body.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read asset file.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
