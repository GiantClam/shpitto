import { NextRequest } from "next/server";
import {
  createAuthUserWithVerification,
  getAuthEmailRuntimeConfig,
} from "../../../lib/auth/cloudflare-email-auth";
import { assertRateLimit, jsonResponse } from "../../../lib/auth/route-utils";

export const runtime = "nodejs";

type SignupPayload = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: NextRequest) {
  const limited = assertRateLimit(request, "auth-signup", 4);
  if (limited) return limited;

  if (!getAuthEmailRuntimeConfig()) {
    return jsonResponse({ ok: false, error: "Auth email service is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as SignupPayload;
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");

  if (!email || !password) {
    return jsonResponse({ ok: false, error: "Email and password are required." }, { status: 400 });
  }

  if (password.length < 8) {
    return jsonResponse({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    await createAuthUserWithVerification({ email, password, request });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create account.";
    return jsonResponse({ ok: false, error: message }, { status: 400 });
  }

  return jsonResponse({
    ok: true,
    message: "Check your email for the verification link.",
  });
}
