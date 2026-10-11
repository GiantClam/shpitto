import type { MetadataRoute } from "next";
import { getProjectBlogSettings, getPublicBlogIndex, resolvePublicBlogProjectId } from "@/lib/blog";
import { collectBlogTaxonomyMap, blogCategoryHref, blogTagHref } from "@/lib/blog-taxonomy";
import { getAllUseCases } from "@/lib/use-cases";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicProjectId = resolvePublicBlogProjectId();
  const settings = publicProjectId ? await getProjectBlogSettings(publicProjectId).catch(() => null) : null;
  const includeBlog = !settings || settings.sitemapEnabled !== false;
  const posts = includeBlog ? await getPublicBlogIndex() : [];
  const base = "https://shpitto.com";
  const useCases = getAllUseCases();
  const categories = collectBlogTaxonomyMap(posts.map((post) => post.category));
  const tags = collectBlogTaxonomyMap(posts.flatMap((post) => post.tags || []));

  return [
    { url: `${base}/`, lastModified: new Date() },
    { url: `${base}/ai-ready`, lastModified: new Date() },
    { url: `${base}/example-websites`, lastModified: new Date() },
    { url: `${base}/use-cases`, lastModified: new Date() },
    ...useCases.map((item) => ({
      url: `${base}${item.href}`,
      lastModified: new Date(),
    })),
    ...(includeBlog ? [{ url: `${base}/blog`, lastModified: new Date() }] : []),
    ...posts.map((post) => ({
      url: `${base}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt || post.publishedAt || Date.now()),
    })),
    ...Array.from(categories.entries()).map(([, category]) => ({
      url: `${base}${blogCategoryHref(category)}`,
      lastModified: new Date(),
    })),
    ...Array.from(tags.entries()).map(([, tag]) => ({
      url: `${base}${blogTagHref(tag)}`,
      lastModified: new Date(),
    })),
  ];
}
