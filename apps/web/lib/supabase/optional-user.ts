import { getCachedAuthUser } from "@/lib/supabase/auth-cache";

export type OptionalServerUser = {
  id?: string | null;
  email?: string | null;
};

export async function getOptionalServerUser(): Promise<OptionalServerUser | null> {
  return getCachedAuthUser();
}
