import { NextResponse } from "next/server";
import { getAuthenticatedRouteUserId } from "@/lib/supabase/route-user";

export const runtime = "nodejs";

export async function POST() {
  const userId = await getAuthenticatedRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    ok: false,
    error: "Automatic renewal is not enabled in the prepaid MVP. There is no renewal to cancel.",
  }, { status: 409 });
}
