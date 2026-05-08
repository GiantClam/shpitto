import { getCachedAuthUser } from "@/lib/supabase/auth-cache";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedRouteUserId(): Promise<string | undefined> {
  try {
    const supabase = await createClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    const sessionUserId = String(sessionUser?.id || "").trim();
    if (sessionUserId) return sessionUserId;
  } catch {
    // Fall back to the signed auth-cache cookie for routes that do not have
    // a Supabase session cookie available in local development.
  }

  const user = await getCachedAuthUser();
  return String(user?.id || "").trim() || undefined;
}
