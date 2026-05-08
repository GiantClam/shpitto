import { NextRequest, NextResponse } from "next/server";
import { publishDueScheduledBlogPosts } from "@/lib/blog";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest) {
  const secret = process.env.SHPITTO_CRON_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const querySecret = request.nextUrl.searchParams.get("secret") || "";
  return bearer === secret || querySecret === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const publishedCount = await publishDueScheduledBlogPosts();
    return NextResponse.json({ ok: true, publishedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish scheduled blog posts.";
    const status = /not configured/i.test(message) ? 503 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
