import { NextResponse } from "next/server";

import { renderDesignSystemPreviewHtml } from "@/lib/design-system-registry";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const params = await ctx.params;
    const html = await renderDesignSystemPreviewHtml(params?.id || "");
    if (!html) {
      return NextResponse.json({ ok: false, error: "Design system not found." }, { status: 404 });
    }
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to render design system preview.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
