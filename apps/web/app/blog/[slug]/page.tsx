import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Clock3, Share2, User } from "lucide-react";
import { getPublicBlogPost } from "@/lib/blog";
import { renderMarkdownToHtml, stripMarkdown } from "@/lib/blog-markdown";

export const dynamic = "force-dynamic";

function formatDateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function estimateReadTime(markdown: string) {
  const words = stripMarkdown(markdown).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = decodeURIComponent(String(resolvedParams.slug || "").trim());
  const post = await getPublicBlogPost(process.env.SHPITTO_PUBLIC_BLOG_PROJECT_ID || "", slug);
  if (!post) {
    return {
      title: "Blog post not found",
      description: "The requested blog post could not be found.",
      alternates: {
        canonical: `/blog/${slug}`,
      },
    };
  }

  const description = post.seoDescription || post.excerpt || stripMarkdown(post.contentMd).slice(0, 160);
  const title = post.seoTitle || post.title;
  const image = post.coverImageUrl || undefined;
  return {
    title,
    description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `/blog/${post.slug}`,
      type: "article",
      images: image ? [{ url: image, alt: post.coverImageAlt || post.title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const slug = decodeURIComponent(String(resolvedParams.slug || "").trim());
  const post = await getPublicBlogPost(process.env.SHPITTO_PUBLIC_BLOG_PROJECT_ID || "", slug);
  if (!post) {
    notFound();
  }

  const html = post.contentHtml || renderMarkdownToHtml(post.contentMd);
  const readTime = estimateReadTime(post.contentMd);
  const publishedAt = post.publishedAt || post.updatedAt;

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-4xl items-center gap-4 px-6">
          <Link href="/blog" className="group rounded-full p-2 -ml-2 transition-colors hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5 text-slate-500 group-hover:text-slate-900" />
          </Link>
          <span className="text-sm font-bold uppercase tracking-wider text-slate-500">Back to Blog</span>
        </div>
      </header>

      <main className="pb-24">
        <div className="relative h-[400px] w-full lg:h-[500px]">
          {post.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.coverImageUrl} alt={post.coverImageAlt || post.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-center text-white">
              <div className="max-w-2xl px-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">{post.category || "Blog"}</p>
                <h1 className="mt-4 text-3xl font-bold leading-tight lg:text-5xl">{post.title}</h1>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full p-6 lg:p-12">
            <div className="mx-auto max-w-4xl">
              <div className="mb-4 inline-block rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                {post.category || "Blog"}
              </div>
              <h1 className="mb-6 max-w-3xl text-3xl font-bold leading-tight text-white lg:text-5xl">{post.title}</h1>
              <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-white/90">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                    <User className="h-4 w-4" />
                  </div>
                  {post.authorName || "Shpitto"}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDateLabel(publishedAt)}
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  {readTime} min read
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-12 px-6 py-12 lg:grid-cols-[1fr_250px]">
          <article className="prose prose-lg prose-slate max-w-none">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-8">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6">
                <h3 className="mb-4 font-bold text-slate-900">Share this article</h3>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-slate-200 bg-white p-2 transition-colors hover:bg-blue-50 hover:text-blue-600">
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl bg-blue-600 p-6 text-white">
                <h3 className="mb-2 text-lg font-bold">Build your project blog in Shpitto</h3>
                <p className="mb-4 text-sm text-blue-100">Edit project-scoped blog content from the data page and publish with SEO metadata.</p>
                <Link href="/login" className="block rounded-xl bg-white py-3 text-center font-bold text-blue-600 transition-colors hover:bg-blue-50">
                  Get Started
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
