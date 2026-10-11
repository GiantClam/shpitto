import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearAuthCacheCookie } from "@/lib/supabase/auth-cache";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/`);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(`${origin}/`);
  response.headers.set("Cache-Control", "no-store");
  clearAuthCacheCookie(response);
  return response;
}
