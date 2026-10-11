import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Tag } from "lucide-react";
import { getPublicBlogIndex } from "@/lib/blog";
import { stripMarkdown } from "@/lib/blog-markdown";
import { blogTagHref, blogTaxonomyMatches, formatBlogTaxonomyDisplayLabel, humanizeBlogTaxonomySlug } from "@/lib/blog-taxonomy";
import { findUseCasesByBlogCategories } from "@/lib/use-cases";

export const dynamic = "force-dynamic";

async function getTagPageData(rawTag: string) {
  const tagSlug = decodeURIComponent(String(rawTag || "").trim());
  const allPosts = await getPublicBlogIndex();
  const posts = allPosts.filter((post) => (post.tags || []).some((item) => blogTaxonomyMatches(item, tagSlug)));
  const matchedTag = posts.flatMap((post) => post.tags || []).find((item) => blogTaxonomyMatches(item, tagSlug));
  const tagLabel = formatBlogTaxonomyDisplayLabel(matchedTag || humanizeBlogTaxonomySlug(tagSlug, "Tag"), "Tag");
  return { tagSlug, tagLabel, posts };
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const { tagSlug, tagLabel } = await getTagPageData(resolvedParams.tag);
  return {
    title: `${tagLabel} Articles | Shpitto Blog`,
    description: `Articles tagged ${tagLabel} from Shpitto Blog.`,
    alternates: {
      canonical: blogTagHref(tagSlug),
    },
  };
}

export default async function BlogTagPage({ params }: { params: Promise<{ tag: string }> }) {
  const resolvedParams = await params;
  const { tagLabel, posts } = await getTagPageData(resolvedParams.tag);
  const relatedUseCases = findUseCasesByBlogCategories(posts.map((post) => post.category));

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>
        <h1 className="mt-8 flex items-center gap-3 text-4xl font-bold">
          <Tag className="h-8 w-8 text-blue-600" />
          {tagLabel}
        </h1>
        {relatedUseCases.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Related use cases</div>
            <div className="mt-4 flex flex-wrap gap-3">
              {relatedUseCases.map((item) => (
                <Link
                  key={item.slug}
                  href={item.href}
                  className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-600"
                >
                  {item.shortLabel} <ArrowRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-10 grid gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="rounded-2xl border border-slate-200 p-6 hover:border-blue-300">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {formatBlogTaxonomyDisplayLabel(post.category, "Blog")}
              </div>
              <h2 className="mt-3 text-2xl font-bold">{post.title}</h2>
              <p className="mt-2 text-slate-600">{post.excerpt || stripMarkdown(post.contentMd).slice(0, 180)}</p>
            </Link>
          ))}
          {posts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
              No published posts with this tag yet.
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
