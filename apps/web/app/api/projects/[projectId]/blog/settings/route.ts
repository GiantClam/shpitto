import { NextRequest, NextResponse } from "next/server";
import { getProjectBlogSettings, upsertProjectBlogSettings } from "@/lib/blog";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

function readSettingsInput(body: unknown) {
  const raw = (body || {}) as Record<string, unknown>;
  const input = (raw.input || raw) as Record<string, unknown>;
  return {
    enabled: input.enabled == null ? undefined : Boolean(input.enabled),
    navLabel: String(input.navLabel || input.nav_label || "").trim() || undefined,
    homeFeaturedCount:
      input.homeFeaturedCount == null && input.home_featured_count == null
        ? undefined
        : Number(input.homeFeaturedCount ?? input.home_featured_count),
    defaultLayoutKey: String(input.defaultLayoutKey || input.default_layout_key || "").trim() || undefined,
    defaultThemeKey: String(input.defaultThemeKey || input.default_theme_key || "").trim() || undefined,
    rssEnabled: true,
    sitemapEnabled: true,
  };
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const settings = await getProjectBlogSettings(projectId, userId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load blog settings.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ projectId: string }> },
) {
  try {
    const userId = await getAuthenticatedRouteUserId();
    if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { projectId: rawProjectId } = await ctx.params;
    const projectId = decodeURIComponent(String(rawProjectId || "").trim());
    if (!projectId) return NextResponse.json({ ok: false, error: "Missing projectId." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const settings = await upsertProjectBlogSettings({
      projectId,
      userId,
      ...readSettingsInput(body),
    });
    if (!settings) {
      return NextResponse.json({ ok: false, error: "Cloudflare D1 is not configured." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update blog settings.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
