export const DEFAULT_AUTH_NEXT_PATH = "/launch-center";

function firstValue(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

export function safeAuthNextPath(
  value: string | string[] | null | undefined,
  fallback = DEFAULT_AUTH_NEXT_PATH,
): string {
  const next = firstValue(value);
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function withAuthNextPath(pathname: string, nextPath: string, fallback = DEFAULT_AUTH_NEXT_PATH): string {
  const next = safeAuthNextPath(nextPath, fallback);
  if (next === fallback) return pathname;
  return `${pathname}?next=${encodeURIComponent(next)}`;
}
