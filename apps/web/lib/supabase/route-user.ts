import { getCachedAuthUser } from "@/lib/supabase/auth-cache";

export async function getAuthenticatedRouteUserId(): Promise<string | undefined> {
  const user = await getCachedAuthUser();
  return String(user?.id || "").trim() || undefined;
}
