import { NextRequest } from "next/server";
import { recordProjectAuthUserActivity } from "@/lib/agent/db";
import { consumeEmailVerificationToken, getAuthEmailRuntimeConfig } from "../../../../lib/auth/cloudflare-email-auth";
import { jsonResponse } from "../../../../lib/auth/route-utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!getAuthEmailRuntimeConfig()) {
    return jsonResponse({ ok: false, error: "Auth email service is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as { token?: unknown; projectId?: unknown; siteKey?: unknown };
  const token = String(payload.token || "").trim();
  const projectId = String(payload.projectId || "").trim();
  const siteKey = String(payload.siteKey || "").trim();

  if (!token) {
    return jsonResponse({ ok: false, error: "Verification token is required." }, { status: 400 });
  }

  try {
    const verified = await consumeEmailVerificationToken(token);
    if (!verified) {
      return jsonResponse({ ok: false, error: "Verification link is invalid or expired." }, { status: 400 });
    }
    void recordProjectAuthUserActivity({
      projectId: projectId || undefined,
      siteKey: siteKey || undefined,
      authUserId: verified.userId,
      email: verified.email,
      emailVerified: true,
      event: "email_verified",
    }).catch((error) => {
      console.warn("[auth-email-verification-confirm] project auth activity sync failed:", error);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify email.";
    return jsonResponse({ ok: false, error: message }, { status: 400 });
  }

  return jsonResponse({ ok: true, message: "Email verified. You can now sign in." });
}
