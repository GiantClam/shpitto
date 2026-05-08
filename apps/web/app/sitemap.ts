import type { MetadataRoute } from "next";
import { getProjectBlogSettings, getPublicBlogIndex, resolvePublicBlogProjectId } from "@/lib/blog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicProjectId = resolvePublicBlogProjectId();
  const settings = publicProjectId ? await getProjectBlogSettings(publicProjectId).catch(() => null) : null;
  const includeBlog = !settings || settings.sitemapEnabled !== false;
  const posts = includeBlog ? await getPublicBlogIndex() : [];
  const base = "https://shpitto.com";

  return [
    { url: `${base}/`, lastModified: new Date() },
    ...(includeBlog ? [{ url: `${base}/blog`, lastModified: new Date() }, { url: `${base}/blog/rss.xml`, lastModified: new Date() }] : []),
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt || post.publishedAt || Date.now()),
    })),
    ...Array.from(new Set(posts.map((post) => post.category).filter(Boolean))).map((category) => ({
      url: `${base}/blog/category/${encodeURIComponent(category)}`,
      lastModified: new Date(),
    })),
    ...Array.from(new Set(posts.flatMap((post) => post.tags || []).filter(Boolean))).map((tag) => ({
      url: `${base}/blog/tag/${encodeURIComponent(tag)}`,
      lastModified: new Date(),
    })),
  ];
}
