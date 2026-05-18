import { NextRequest, NextResponse } from "next/server";
import { getProjectContactSettings, updateProjectContactSettings } from "@/lib/project-settings";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

function hasOwn(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readSettingsInput(body: unknown) {
  const raw = (body || {}) as Record<string, unknown>;
  const input = ((raw.input as Record<string, unknown> | undefined) || raw) as Record<string, unknown>;
  return {
    forwardTo:
      hasOwn(input, "forwardTo") || hasOwn(input, "forward_to")
        ? (input.forwardTo ?? input.forward_to ?? []) as string[] | string
        : undefined,
    sendUserAck:
      hasOwn(input, "sendUserAck") || hasOwn(input, "send_user_ack")
        ? Boolean(input.sendUserAck ?? input.send_user_ack)
        : undefined,
    replyToField:
      hasOwn(input, "replyToField") || hasOwn(input, "reply_to_field")
        ? String(input.replyToField ?? input.reply_to_field ?? "").trim()
        : undefined,
    brandName:
      hasOwn(input, "brandName") || hasOwn(input, "brand_name")
        ? String(input.brandName ?? input.brand_name ?? "").trim()
        : undefined,
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

    const settings = await getProjectContactSettings(projectId, userId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load project settings.";
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
    const settings = await updateProjectContactSettings({
      projectId,
      userId,
      ...readSettingsInput(body),
    });
    if (!settings) return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update project settings.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
