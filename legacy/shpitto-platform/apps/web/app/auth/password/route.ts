import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { recordProjectAuthUserActivity } from "@/lib/agent/db";
import { setAuthCacheCookie } from "@/lib/supabase/auth-cache";

export const runtime = "nodejs";

type PasswordLoginPayload = {
  email?: unknown;
  password?: unknown;
  projectId?: unknown;
  siteKey?: unknown;
  next?: unknown;
  theme?: unknown;
};

async function readPayload(request: NextRequest): Promise<PasswordLoginPayload> {
  return (await request.json().catch(() => ({}))) as PasswordLoginPayload;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

function isTransientSupabaseAuthError(error: unknown): boolean {
  const anyError = (error || {}) as {
    code?: string;
    cause?: { code?: string; message?: string };
    message?: string;
    name?: string;
  };
  const code = String(anyError.code || anyError.cause?.code || "").toUpperCase();
  if (
    [
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "ENOTFOUND",
      "EAI_AGAIN",
    ].includes(code)
  ) {
    return true;
  }

  const text = `${anyError.name || ""} ${anyError.message || ""} ${anyError.cause?.message || ""}`.toLowerCase();
  return [
    "fetch failed",
    "connect timeout",
    "timed out",
    "timeout",
    "network",
    "socket",
    "connection reset",
    "temporarily unavailable",
    "service unavailable",
    "tls",
  ].some((token) => text.includes(token));
}

function authErrorResponse(error: unknown) {
  const transient = isTransientSupabaseAuthError(error);
  const message = transient
    ? "Authentication service is temporarily unavailable. Please try again."
    : String((error as { message?: unknown })?.message || "Invalid login credentials");
  return jsonResponse(
    {
      ok: false,
      error: message,
      retryable: transient || undefined,
    },
    { status: transient ? 503 : 400 },
  );
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const payload = await readPayload(request);
  const email = String(payload.email || "").trim();
  const password = String(payload.password || "");
  const projectId = String(payload.projectId || "").trim();
  const siteKey = String(payload.siteKey || "").trim();

  if (!email || !password) {
    return jsonResponse({ ok: false, error: "Email and password are required." }, { status: 400 });
  }

  let response = jsonResponse({ ok: true });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        response = jsonResponse({ ok: true });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  let data;
  let error;
  try {
    const result = await supabase.auth.signInWithPassword({ email, password });
    data = result.data;
    error = result.error;
  } catch (caughtError) {
    return authErrorResponse(caughtError);
  }

  if (error) {
    return authErrorResponse(error);
  }

  if (data.user?.id) {
    setAuthCacheCookie(response, {
      id: data.user.id,
      email: data.user.email || email,
    });
    void recordProjectAuthUserActivity({
      projectId: projectId || undefined,
      siteKey: siteKey || undefined,
      authUserId: data.user.id,
      email: data.user.email || email,
      emailVerified: Boolean(data.user.email_confirmed_at),
      event: "login",
    }).catch((error) => {
      console.warn("[auth-password] project auth activity sync failed:", error);
    });
  }

  return response;
}
