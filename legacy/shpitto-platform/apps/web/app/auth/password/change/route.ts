import { NextRequest } from "next/server";
import { assertRateLimit, createRouteSupabaseClient, getSupabaseConfig, jsonResponse } from "../../../../lib/auth/route-utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limited = assertRateLimit(request, "auth-password-change", 5);
  if (limited) return limited;

  if (!getSupabaseConfig()) {
    return jsonResponse({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  const currentPassword = String(payload.currentPassword || "");
  const newPassword = String(payload.newPassword || "");

  if (!currentPassword || newPassword.length < 8) {
    return jsonResponse({ ok: false, error: "Current password and a new password of at least 8 characters are required." }, { status: 400 });
  }

  const responseRef = { current: jsonResponse({ ok: true }) };
  const supabase = createRouteSupabaseClient(request, responseRef);
  if (!supabase) {
    return jsonResponse({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return jsonResponse({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (verifyError) {
    return jsonResponse({ ok: false, error: "Current password is incorrect." }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return jsonResponse({ ok: false, error: error.message }, { status: 400 });
  }

  await supabase.auth.signOut({ scope: "global" }).catch(() => undefined);
  return jsonResponse({ ok: true, message: "Password changed. Please sign in again." });
}
