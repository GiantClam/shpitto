import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

export function assertRateLimit(request: NextRequest, action: string, limit = DEFAULT_LIMIT) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("cf-connecting-ip") || "unknown";
  const key = `${action}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return jsonResponse({ ok: false, error: "Too many requests. Please try again later." }, { status: 429 });
  }

  return null;
}

export function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;
  return { supabaseUrl, supabaseAnonKey };
}

export function createRouteSupabaseClient(request: NextRequest, responseRef: { current: NextResponse }) {
  const config = getSupabaseConfig();
  if (!config) return null;

  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        responseRef.current = jsonResponse({ ok: true });
        cookiesToSet.forEach(({ name, value, options }) => {
          responseRef.current.cookies.set(name, value, options);
        });
      },
    },
  });
}
