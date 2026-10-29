import { NextRequest } from "next/server";
import { recordProjectAuthUserActivity } from "@/lib/agent/db";
import {
  findAuthUserByEmail,
  getAuthEmailRuntimeConfig,
  sendEmailVerification,
} from "../../../../lib/auth/cloudflare-email-auth";
import { assertRateLimit, jsonResponse } from "../../../../lib/auth/route-utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limited = assertRateLimit(request, "auth-verification-resend", 3);
  if (limited) return limited;

  if (!getAuthEmailRuntimeConfig()) {
    return jsonResponse({ ok: false, error: "Auth email service is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as { email?: unknown; theme?: unknown; projectId?: unknown; siteKey?: unknown };
  const email = String(payload.email || "").trim().toLowerCase();
  const theme = String(payload.theme || "").trim();
  const projectId = String(payload.projectId || "").trim();
  const siteKey = String(payload.siteKey || "").trim();

  if (!email) {
    return jsonResponse({ ok: false, error: "Email is required." }, { status: 400 });
  }

  try {
    const user = await findAuthUserByEmail(email);
    if (user && !user.emailVerified) {
      await sendEmailVerification({
        userId: user.userId,
        email: user.email,
        request,
        theme,
        projectId: projectId || undefined,
        siteKey: siteKey || undefined,
      });
      void recordProjectAuthUserActivity({
        projectId: projectId || undefined,
        siteKey: siteKey || undefined,
        authUserId: user.userId,
        email: user.email,
        emailVerified: false,
        event: "verification_resend",
      }).catch((error) => {
        console.warn("[auth-verification-resend] project auth activity sync failed:", error);
      });
    }
  } catch (error) {
    console.warn("[auth-verification-resend] Cloudflare verification email failed:", error);
  }

  return jsonResponse({ ok: true, message: "If the account exists, a verification email has been sent." });
}
