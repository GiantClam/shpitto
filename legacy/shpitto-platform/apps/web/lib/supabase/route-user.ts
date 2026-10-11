import { getCachedAuthUser } from "@/lib/supabase/auth-cache";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedRouteUserId(): Promise<string | undefined> {
  const cachedUser = await getCachedAuthUser();
  const cachedUserId = String(cachedUser?.id || "").trim();
  if (cachedUserId) return cachedUserId;

  try {
    const supabase = await createClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    const sessionUserId = String(sessionUser?.id || "").trim();
    if (sessionUserId) return sessionUserId;
  } catch {
    // Ignore remote session lookup failures. The local auth cache is checked
    // first so local replay routes do not stall on a slow Supabase call.
  }
  return undefined;
}
