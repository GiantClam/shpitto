import type { NextRequest } from "next/server";

function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function getAppBaseUrl(request?: NextRequest | Request): string {
  const configured = process.env.APP_URL || process.env.SHPITTO_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return cleanBaseUrl(configured);

  if (request?.url) {
    const url = new URL(request.url);
    return url.origin;
  }

  return "http://localhost:3000";
}

export function buildAppUrl(path: string, request?: NextRequest | Request): string {
  const baseUrl = getAppBaseUrl(request);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
