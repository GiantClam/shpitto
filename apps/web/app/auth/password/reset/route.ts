import { NextRequest } from "next/server";
import { recordProjectAuthUserActivity } from "@/lib/agent/db";
import { getAuthEmailRuntimeConfig, resetPasswordWithToken } from "../../../../lib/auth/cloudflare-email-auth";
import { assertRateLimit, jsonResponse } from "../../../../lib/auth/route-utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limited = assertRateLimit(request, "auth-password-reset", 5);
  if (limited) return limited;

  if (!getAuthEmailRuntimeConfig()) {
    return jsonResponse({ ok: false, error: "Auth email service is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    token?: unknown;
    password?: unknown;
    projectId?: unknown;
    siteKey?: unknown;
  };
  const token = String(payload.token || "").trim();
  const password = String(payload.password || "");
  const projectId = String(payload.projectId || "").trim();
  const siteKey = String(payload.siteKey || "").trim();

  if (!token) {
    return jsonResponse({ ok: false, error: "Password reset token is required." }, { status: 400 });
  }

  if (password.length < 8) {
    return jsonResponse({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const reset = await resetPasswordWithToken(token, password);
    if (!reset) {
      return jsonResponse({ ok: false, error: "Password reset link is invalid or expired." }, { status: 400 });
    }
    void recordProjectAuthUserActivity({
      projectId: projectId || undefined,
      siteKey: siteKey || undefined,
      authUserId: reset.userId,
      email: reset.email,
      emailVerified: true,
      event: "password_reset_completed",
    }).catch((error) => {
      console.warn("[auth-password-reset] project auth activity sync failed:", error);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset password.";
    return jsonResponse({ ok: false, error: message }, { status: 400 });
  }

  return jsonResponse({ ok: true, message: "Password updated. Please sign in again." });
}
