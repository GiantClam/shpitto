import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Tag } from "lucide-react";
import { getPublicBlogIndex } from "@/lib/blog";
import { stripMarkdown } from "@/lib/blog-markdown";

export const dynamic = "force-dynamic";

function normalizeFilter(value: string) {
  return decodeURIComponent(String(value || "")).trim().toLowerCase();
}

export async function generateMetadata({ params }: { params: { tag: string } }): Promise<Metadata> {
  const tag = decodeURIComponent(String(params.tag || "").trim());
  return {
    title: `${tag || "Tag"} Articles | Shpitto Blog`,
    description: `Articles tagged ${tag || "blog"} from Shpitto Blog.`,
    alternates: {
      canonical: `/blog/tag/${encodeURIComponent(tag)}`,
    },
  };
}

export default async function BlogTagPage({ params }: { params: { tag: string } }) {
  const tag = decodeURIComponent(String(params.tag || "").trim());
  const filter = normalizeFilter(tag);
  const posts = (await getPublicBlogIndex()).filter((post) =>
    (post.tags || []).some((item) => item.trim().toLowerCase() === filter),
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600">
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>
        <h1 className="mt-8 flex items-center gap-3 text-4xl font-bold">
          <Tag className="h-8 w-8 text-blue-600" />
          {tag || "Tag"}
        </h1>
        <div className="mt-10 grid gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="rounded-2xl border border-slate-200 p-6 hover:border-blue-300">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{post.category || "Blog"}</div>
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
