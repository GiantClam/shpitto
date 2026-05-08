import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Calendar, User } from "lucide-react";
import { getPublicBlogIndex } from "@/lib/blog";
import { stripMarkdown } from "@/lib/blog-markdown";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Shpitto Blog",
    description: "Project blogs managed in Shpitto with SEO-friendly server rendering.",
    alternates: {
      canonical: "/blog",
      types: {
        "application/rss+xml": "/blog/rss.xml",
      },
    },
    openGraph: {
      title: "Shpitto Blog",
      description: "Project blogs managed in Shpitto with SEO-friendly server rendering.",
      url: "/blog",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "Shpitto Blog",
      description: "Project blogs managed in Shpitto with SEO-friendly server rendering.",
    },
  };
}

function formatDateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default async function BlogIndexPage() {
  const posts = await getPublicBlogIndex();

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="rounded-full p-2 -ml-2 transition-colors hover:bg-slate-100">
              <ArrowLeft className="h-5 w-5 text-slate-500" />
            </Link>
            <span className="text-xl font-bold tracking-tight">Shpitto Blog</span>
          </div>
          <Link
            href="/login"
            className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700"
          >
            Start Building
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-16">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <h1 className="mb-6 text-4xl font-bold text-slate-900 lg:text-5xl">Insights for Industrial Growth</h1>
          <p className="text-lg text-slate-600">
            Project blogs can be authored in Shpitto data pages and rendered on the public site with server-side SEO.
          </p>
        </div>

        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => {
            const description = post.excerpt || stripMarkdown(post.contentMd).slice(0, 160);
            const heroImage = post.coverImageUrl || "";
            return (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group flex cursor-pointer flex-col">
                <div className="relative mb-6 aspect-[16/10] overflow-hidden rounded-2xl bg-slate-100 shadow-sm transition-all duration-500 hover:shadow-xl">
                  {heroImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={heroImage}
                      alt={post.coverImageAlt || post.title}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-8 text-center">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{post.category || "Blog"}</p>
                        <p className="mt-3 text-2xl font-bold text-slate-900">{post.title}</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-700 backdrop-blur-sm">
                    {post.category || "Blog"}
                  </div>
                </div>

                <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDateLabel(post.publishedAt || post.updatedAt)}
                  </div>
                  <div className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {post.authorName || "Shpitto"}
                  </div>
                </div>

                <h2 className="mb-3 text-2xl font-bold text-slate-900 transition-colors group-hover:text-blue-600">
                  {post.title}
                </h2>

                <p className="mb-4 flex-grow leading-relaxed text-slate-600 line-clamp-3">{description}</p>

                <div className="mt-auto flex items-center gap-2 font-bold text-blue-600 transition-all group-hover:gap-3">
                  Read Full Story <ArrowRight className="h-4 w-4" />
                </div>
              </Link>
            );
          })}
        </div>

        {posts.length === 0 ? (
          <div className="mx-auto mt-12 max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            No published blog posts yet.
          </div>
        ) : null}
      </main>

      <footer className="mt-20 border-t border-slate-200 bg-slate-50 py-12 text-center text-sm text-slate-500">
        <p>(c) {new Date().getFullYear()} Shpitto Inc. All rights reserved.</p>
      </footer>
    </div>
  );
}
