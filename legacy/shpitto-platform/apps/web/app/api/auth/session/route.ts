import { NextResponse } from "next/server";
import { getCachedAuthUser } from "@/lib/supabase/auth-cache";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCachedAuthUser();
  return NextResponse.json(
    {
      ok: true,
      user: user ? { id: user.id, email: user.email || "" } : null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
