import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Calendar } from "lucide-react";
import { getPublicBlogIndex } from "@/lib/blog";
import { stripMarkdown } from "@/lib/blog-markdown";
import { blogCategoryHref, blogTaxonomyMatches, formatBlogTaxonomyDisplayLabel, humanizeBlogTaxonomySlug } from "@/lib/blog-taxonomy";
import { findUseCaseByBlogCategory } from "@/lib/use-cases";

export const dynamic = "force-dynamic";

function formatDateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function getCategoryPageData(rawCategory: string) {
  const categorySlug = decodeURIComponent(String(rawCategory || "").trim());
  const allPosts = await getPublicBlogIndex();
  const posts = allPosts.filter((post) => blogTaxonomyMatches(post.category, categorySlug));
  const categoryLabel = formatBlogTaxonomyDisplayLabel(posts[0]?.category || humanizeBlogTaxonomySlug(categorySlug, "Blog"), "Blog");
  return { categorySlug, categoryLabel, posts };
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const { categorySlug, categoryLabel } = await getCategoryPageData(resolvedParams.category);
  return {
    title: `${categoryLabel} Articles | Shpitto Blog`,
    description: `Articles in ${categoryLabel} from Shpitto Blog.`,
    alternates: {
      canonical: blogCategoryHref(categorySlug),
    },
  };
}

export default async function BlogCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const resolvedParams = await params;
  const { categoryLabel, posts } = await getCategoryPageData(resolvedParams.category);
  const relatedUseCase = findUseCaseByBlogCategory(posts[0]?.category || categoryLabel);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>
        <h1 className="mt-8 text-4xl font-bold">{categoryLabel} Articles</h1>
        {relatedUseCase ? (
          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Related use case</div>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">{relatedUseCase.label}</h2>
            <p className="mt-2 max-w-3xl text-slate-600">{relatedUseCase.description}</p>
            <Link href={relatedUseCase.href} className="mt-4 inline-flex items-center gap-2 font-bold text-blue-600">
              Explore this use case <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : null}
        <div className="mt-10 grid gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="rounded-2xl border border-slate-200 p-6 hover:border-blue-300">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                {formatDateLabel(post.publishedAt || post.updatedAt)}
              </div>
              <div className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {formatBlogTaxonomyDisplayLabel(post.category, "Blog")}
              </div>
              <h2 className="mt-3 text-2xl font-bold">{post.title}</h2>
              <p className="mt-2 text-slate-600">{post.excerpt || stripMarkdown(post.contentMd).slice(0, 180)}</p>
            </Link>
          ))}
          {posts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
              No published posts in this category yet.
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
