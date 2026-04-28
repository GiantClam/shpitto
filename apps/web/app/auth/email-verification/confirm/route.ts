import { NextRequest } from "next/server";
import { consumeEmailVerificationToken, getAuthEmailRuntimeConfig } from "../../../../lib/auth/cloudflare-email-auth";
import { jsonResponse } from "../../../../lib/auth/route-utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!getAuthEmailRuntimeConfig()) {
    return jsonResponse({ ok: false, error: "Auth email service is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = String(payload.token || "").trim();

  if (!token) {
    return jsonResponse({ ok: false, error: "Verification token is required." }, { status: 400 });
  }

  try {
    const verified = await consumeEmailVerificationToken(token);
    if (!verified) {
      return jsonResponse({ ok: false, error: "Verification link is invalid or expired." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify email.";
    return jsonResponse({ ok: false, error: message }, { status: 400 });
  }

  return jsonResponse({ ok: true, message: "Email verified. You can now sign in." });
}
