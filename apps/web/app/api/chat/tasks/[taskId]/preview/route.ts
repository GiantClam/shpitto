import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ taskId: string }> },
) {
  const params = await ctx.params;
  const taskId = String(params?.taskId || "").trim();
  if (!taskId) {
    return NextResponse.json({ ok: false, error: "Missing taskId." }, { status: 400 });
  }

  const target = new URL(`/api/chat/tasks/${encodeURIComponent(taskId)}/preview/index.html`, req.url);
  return NextResponse.redirect(target, 307);
}
