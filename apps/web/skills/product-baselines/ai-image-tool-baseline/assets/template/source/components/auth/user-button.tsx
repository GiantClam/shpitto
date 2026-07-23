"use client";

import { signOut } from "next-auth/react";
import { useAuth } from "../../hooks/use-auth";

export function UserButton() {
  const { user } = useAuth();
  const label = user?.name ? `Sign out ${user.name}` : 'Sign out';
  return (
    <button type="button" className="header-action" onClick={() => signOut({ callbackUrl: "/sign-in" })}>
      {label}
    </button>
  );
}
