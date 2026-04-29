import { NextResponse } from "next/server";

import { readDesignSystem } from "@/lib/design-system-registry";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const params = await ctx.params;
    const detail = await readDesignSystem(params?.id || "");
    if (!detail) {
      return NextResponse.json({ ok: false, error: "Design system not found." }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      designSystem: detail.summary,
      body: detail.body,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read design system.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
