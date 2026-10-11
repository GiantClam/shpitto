import { NextResponse } from "next/server";
import { getProjectBlogSettings, getPublicBlogIndex, resolvePublicBlogProjectId } from "@/lib/blog";
import { stripMarkdown } from "@/lib/blog-markdown";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function siteBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SHPITTO_SITE_URL || "https://shpitto.com").replace(/\/+$/, "");
}

export async function GET() {
  const projectId = resolvePublicBlogProjectId();
  if (projectId) {
    const settings = await getProjectBlogSettings(projectId).catch(() => null);
    if (settings && settings.rssEnabled === false) {
      return new NextResponse("RSS feed disabled", { status: 404 });
    }
  }
  const posts = await getPublicBlogIndex();
  const base = siteBaseUrl();
  const latest = posts[0]?.updatedAt || posts[0]?.publishedAt || new Date().toISOString();
  const items = posts
    .map((post) => {
      const url = `${base}/blog/${post.slug}`;
      const description = post.excerpt || stripMarkdown(post.contentMd).slice(0, 240);
      return `
        <item>
          <title>${escapeXml(post.title)}</title>
          <link>${escapeXml(url)}</link>
          <guid>${escapeXml(url)}</guid>
          <description>${escapeXml(description)}</description>
          <pubDate>${new Date(post.publishedAt || post.updatedAt || Date.now()).toUTCString()}</pubDate>
        </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Shpitto Blog</title>
    <link>${escapeXml(`${base}/blog`)}</link>
    <description>Project blogs managed in Shpitto with SEO-friendly server rendering.</description>
    <lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
