"use client";

import { useState, type ReactNode } from "react";

type SignOutButtonProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export function SignOutButton({ children, className = "", title = "Sign out" }: SignOutButtonProps) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/auth/signout", { method: "POST", cache: "no-store", redirect: "manual" });
    } finally {
      window.location.assign("/");
    }
  }

  return (
    <button type="button" onClick={handleSignOut} disabled={signingOut} className={className} title={title}>
      {children}
    </button>
  );
}
