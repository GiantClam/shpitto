"use client";

import { useSession } from "next-auth/react";

export function useAuth() {
  const { data: session, status } = useSession();
  return {
    userId: session?.user ? (session.user as { id?: string }).id || null : null,
    user: session?.user || null,
    isAdmin: session?.user ? (session.user as { role?: string }).role === 'admin' : false,
    isLoaded: status !== 'loading',
    isSignedIn: Boolean(session?.user),
  };
}
