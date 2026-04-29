import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const AUTH_CACHE_COOKIE_NAME = "shpitto_auth_cache";

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;
const PROCESS_SECRET = crypto.randomBytes(32).toString("base64url");

export type CachedAuthUser = {
  id: string;
  email?: string;
};

type AuthCachePayload = CachedAuthUser & {
  exp: number;
};

function getSecret(): string {
  return (
    process.env.SHPITTO_AUTH_CACHE_SECRET ||
    process.env.AUTH_CACHE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXTAUTH_SECRET ||
    PROCESS_SECRET
  );
}

function ttlSeconds(): number {
  const configured = Number(process.env.SHPITTO_AUTH_CACHE_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(configured)) return DEFAULT_TTL_SECONDS;
  return Math.max(60, Math.min(30 * 24 * 60 * 60, configured));
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function encodePayload(payload: AuthCachePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(value: string): AuthCachePayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const id = String(parsed.id || "").trim();
    const exp = Number(parsed.exp || 0);
    if (!id || !Number.isFinite(exp)) return null;
    return {
      id,
      email: String(parsed.email || "").trim() || undefined,
      exp,
    };
  } catch {
    return null;
  }
}

export function createAuthCacheCookieValue(user: CachedAuthUser): string {
  const payload = encodePayload({
    id: String(user.id || "").trim(),
    email: String(user.email || "").trim() || undefined,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds(),
  });
  return `${payload}.${sign(payload)}`;
}

export function parseAuthCacheCookieValue(value: string | undefined | null): CachedAuthUser | null {
  const raw = String(value || "").trim();
  const [payload, signature, ...extra] = raw.split(".");
  if (!payload || !signature || extra.length > 0) return null;
  if (!safeEqual(sign(payload), signature)) return null;

  const decoded = decodePayload(payload);
  if (!decoded || decoded.exp <= Math.floor(Date.now() / 1000)) return null;
  return {
    id: decoded.id,
    email: decoded.email,
  };
}

export async function getCachedAuthUser(): Promise<CachedAuthUser | null> {
  try {
    const store = await cookies();
    return parseAuthCacheCookieValue(store.get(AUTH_CACHE_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

export function setAuthCacheCookie(response: NextResponse, user: CachedAuthUser): void {
  if (!String(user.id || "").trim()) return;
  response.cookies.set(AUTH_CACHE_COOKIE_NAME, createAuthCacheCookieValue(user), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ttlSeconds(),
  });
}

export function clearAuthCacheCookie(response: NextResponse): void {
  response.cookies.set(AUTH_CACHE_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}
