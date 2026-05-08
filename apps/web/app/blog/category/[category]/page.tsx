import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Calendar } from "lucide-react";
import { getPublicBlogIndex } from "@/lib/blog";
import { stripMarkdown } from "@/lib/blog-markdown";

export const dynamic = "force-dynamic";

function formatDateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function normalizeFilter(value: string) {
  return decodeURIComponent(String(value || "")).trim().toLowerCase();
}

export async function generateMetadata({ params }: { params: { category: string } }): Promise<Metadata> {
  const category = decodeURIComponent(String(params.category || "").trim());
  return {
    title: `${category || "Blog"} Articles | Shpitto Blog`,
    description: `Articles in ${category || "this category"} from Shpitto Blog.`,
    alternates: {
      canonical: `/blog/category/${encodeURIComponent(category)}`,
    },
  };
}

export default async function BlogCategoryPage({ params }: { params: { category: string } }) {
  const category = decodeURIComponent(String(params.category || "").trim());
  const filter = normalizeFilter(category);
  const posts = (await getPublicBlogIndex()).filter((post) => post.category.trim().toLowerCase() === filter);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>
        <h1 className="mt-8 text-4xl font-bold">{category || "Blog"} Articles</h1>
        <div className="mt-10 grid gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="rounded-2xl border border-slate-200 p-6 hover:border-blue-300">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                {formatDateLabel(post.publishedAt || post.updatedAt)}
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
