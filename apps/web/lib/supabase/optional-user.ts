import { getCachedAuthUser } from "@/lib/supabase/auth-cache";
import { createClient } from "@/lib/supabase/server";

export type OptionalServerUser = {
  id?: string | null;
  email?: string | null;
};

export async function getOptionalServerUser(): Promise<OptionalServerUser | null> {
  const cachedUser = await getCachedAuthUser();
  if (cachedUser) return cachedUser;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return null;

    return {
      id: user.id,
      email: user.email || undefined,
    };
  } catch {
    return null;
  }
}
