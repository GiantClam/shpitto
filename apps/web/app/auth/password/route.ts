import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { setAuthCacheCookie } from "@/lib/supabase/auth-cache";

export const runtime = "nodejs";

type PasswordLoginPayload = {
  email?: unknown;
  password?: unknown;
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

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const payload = await readPayload(request);
  const email = String(payload.email || "").trim();
  const password = String(payload.password || "");

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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return jsonResponse({ ok: false, error: error.message }, { status: 400 });
  }

  if (data.user?.id) {
    setAuthCacheCookie(response, {
      id: data.user.id,
      email: data.user.email || email,
    });
  }

  return response;
}
