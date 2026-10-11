import { NextResponse } from "next/server";
import { setAuthCacheCookie } from "@/lib/supabase/auth-cache";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function safeNextPath(value: string | null): string {
  const next = String(value || "").trim();
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/launch-center";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const origin = url.origin;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.id) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("next", next);
      loginUrl.searchParams.set("reason", "auth_cache_repair_failed");
      return NextResponse.redirect(loginUrl);
    }

    const response = NextResponse.redirect(`${origin}${next}`);
    response.headers.set("Cache-Control", "no-store");
    setAuthCacheCookie(response, {
      id: user.id,
      email: user.email || undefined,
    });
    return response;
  } catch {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("next", next);
    loginUrl.searchParams.set("reason", "auth_cache_repair_failed");
    return NextResponse.redirect(loginUrl);
  }
}
