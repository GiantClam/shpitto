"use client";

import type { ReactNode } from "react";
import { signIn } from "next-auth/react";
import { useAuth } from "../../hooks/use-auth";

type AuthComponentProps = {
  children: ReactNode;
};

export function SignedIn({ children }: AuthComponentProps) {
  const { isSignedIn } = useAuth();
  if (!isSignedIn) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: AuthComponentProps) {
  const { isSignedIn } = useAuth();
  if (isSignedIn) return null;
  return <>{children}</>;
}

type SignInButtonProps = {
  children: ReactNode;
  provider?: string;
  callbackUrl?: string;
  email?: string;
  password?: string;
  onStart?: () => void;
};

export function SignInButton({ children, provider = 'google', callbackUrl, email, password, onStart }: SignInButtonProps) {
  const handleClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    onStart?.();
    await signIn(provider, {
      email,
      password,
      callbackUrl: callbackUrl || window.location.href,
      redirect: true,
    });
  };
  return <span onClick={handleClick} style={{ display: "inline-flex", cursor: "pointer" }}>{children}</span>;
}
