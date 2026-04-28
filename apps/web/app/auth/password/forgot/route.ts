import { NextRequest } from "next/server";
import {
  findAuthUserByEmail,
  getAuthEmailRuntimeConfig,
  sendPasswordReset,
} from "../../../../lib/auth/cloudflare-email-auth";
import { assertRateLimit, jsonResponse } from "../../../../lib/auth/route-utils";

export const runtime = "nodejs";

const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account exists for this email, a password reset link has been sent.",
};

export async function POST(request: NextRequest) {
  const limited = assertRateLimit(request, "auth-password-forgot", 4);
  if (limited) return limited;

  if (!getAuthEmailRuntimeConfig()) {
    return jsonResponse({ ok: false, error: "Auth email service is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = String(payload.email || "").trim().toLowerCase();

  if (!email) {
    return jsonResponse({ ok: false, error: "Email is required." }, { status: 400 });
  }

  try {
    const user = await findAuthUserByEmail(email);
    if (user) {
      await sendPasswordReset({
        userId: user.userId,
        email: user.email,
        request,
        requestedIp: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "",
        userAgent: request.headers.get("user-agent") || "",
      });
    }
  } catch (error) {
    console.warn("[auth-password-forgot] Cloudflare reset email failed:", error);
  }

  return jsonResponse(GENERIC_RESPONSE);
}
