import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, Clock3, Share2, User } from "lucide-react";
import { getPublicBlogPost } from "@/lib/blog";
import { renderMarkdownToHtml, stripMarkdown } from "@/lib/blog-markdown";
import { blogCategoryHref, blogTagHref, formatBlogTaxonomyDisplayLabel } from "@/lib/blog-taxonomy";
import { findUseCaseByBlogCategory } from "@/lib/use-cases";

export const dynamic = "force-dynamic";

function formatDateLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
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
  const authorName = post.authorName || "Shpitto";
  const categoryLabel = formatBlogTaxonomyDisplayLabel(post.category, "Blog");
  const relatedUseCase = findUseCaseByBlogCategory(post.category);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SHPITTO_SITE_URL || "https://shpitto.com").replace(
    /\/+$/,
    "",
  );
  const categoryHref = blogCategoryHref(post.category);
  const uniqueTags = Array.from(new Set(post.tags.map((tag) => String(tag || "").trim()).filter(Boolean)));
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${siteUrl}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${siteUrl}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: categoryLabel,
        item: `${siteUrl}${categoryHref}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: post.title,
        item: `${siteUrl}/blog/${post.slug}`,
      },
    ],
  };
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt || stripMarkdown(post.contentMd).slice(0, 160),
    articleSection: categoryLabel,
    keywords: uniqueTags,
    datePublished: publishedAt,
    dateModified: post.updatedAt || publishedAt,
    author: {
      "@type": authorName === "Shpitto" ? "Organization" : "Person",
      name: authorName,
    },
    publisher: {
      "@type": "Organization",
      name: "Shpitto",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/icon.png`,
      },
    },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
    image: post.coverImageUrl ? [post.coverImageUrl] : undefined,
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffaf5,#f4ebe3)] font-sans text-[var(--shp-text)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />

      <header className="sticky top-0 z-50 w-full border-b border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white/78 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-4xl items-center gap-4 px-6">
          <Link href="/blog" className="group -ml-2 rounded-full p-2 transition-colors hover:bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)]">
            <ArrowLeft className="h-5 w-5 text-[var(--shp-muted)] group-hover:text-[var(--shp-text)]" />
          </Link>
          <span className="text-sm font-bold uppercase tracking-wider text-[var(--shp-muted)]">Back to Blog</span>
        </div>
      </header>

      <main className="pb-24">
        <div className="relative h-[400px] w-full lg:h-[500px]">
          {post.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.coverImageUrl} alt={post.coverImageAlt || post.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#2f160f] via-[#4b2619] to-[#6b3422] text-center text-white">
              <div className="max-w-2xl px-6">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">{categoryLabel}</p>
                <h1 className="mt-4 text-3xl font-bold leading-tight lg:text-5xl">{post.title}</h1>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 w-full p-6 lg:p-12">
            <div className="mx-auto max-w-4xl">
              <div className="mb-4 inline-block rounded-full bg-[var(--shp-primary)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                {categoryLabel}
              </div>
              <h1 className="mb-6 max-w-3xl text-3xl font-bold leading-tight text-white lg:text-5xl">{post.title}</h1>
              <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-white/90">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                    <User className="h-4 w-4" />
                  </div>
                  {authorName}
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
            <nav
              aria-label="Breadcrumb"
              className="mb-6 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--shp-muted)] not-prose"
            >
              <Link href="/" className="transition-colors hover:text-[var(--shp-primary)]">
                Home
              </Link>
              <span>/</span>
              <Link href="/blog" className="transition-colors hover:text-[var(--shp-primary)]">
                Blog
              </Link>
              <span>/</span>
              <Link href={categoryHref} className="transition-colors hover:text-[var(--shp-primary)]">
                {categoryLabel}
              </Link>
              <span>/</span>
              <span className="text-[var(--shp-primary)]">{post.title}</span>
            </nav>

            <div className="mb-8 rounded-[1.75rem] border border-[color-mix(in_oklab,var(--shp-border)_76%,transparent)] bg-white/78 p-5 shadow-[0_18px_50px_rgba(66,39,28,0.08)] not-prose">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--shp-primary)]">Explore this topic</div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/blog"
                  className="rounded-full border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--shp-text)] transition-colors hover:border-[color-mix(in_oklab,var(--shp-primary)_36%,transparent)] hover:text-[var(--shp-primary)]"
                >
                  Blog Index
                </Link>
                <Link
                  href={categoryHref}
                  className="rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_28%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_8%,white_92%)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--shp-primary)] transition-colors hover:border-[color-mix(in_oklab,var(--shp-primary)_40%,transparent)]"
                >
                  Category: {categoryLabel}
                </Link>
                {uniqueTags.map((tag) => (
                  <Link
                    key={tag}
                    href={blogTagHref(tag)}
                    className="rounded-full border border-[color-mix(in_oklab,var(--shp-border)_74%,transparent)] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--shp-muted)] transition-colors hover:border-[color-mix(in_oklab,var(--shp-primary)_32%,transparent)] hover:text-[var(--shp-primary)]"
                  >
                    #{formatBlogTaxonomyDisplayLabel(tag, "Tag")}
                  </Link>
                ))}
                {relatedUseCase ? (
                  <Link
                    href={relatedUseCase.href}
                    className="rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_28%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_10%,white_90%)] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[var(--shp-primary)] transition-colors hover:border-[color-mix(in_oklab,var(--shp-primary)_42%,transparent)]"
                  >
                    Use Case: {relatedUseCase.shortLabel}
                  </Link>
                ) : null}
              </div>
            </div>

            <div dangerouslySetInnerHTML={{ __html: html }} />
          </article>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-8">
              <div className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white/76 p-6">
                <h3 className="mb-4 font-bold text-[var(--shp-text)]">Share this article</h3>
                <div className="flex gap-2">
                  <button className="rounded-lg border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white p-2 transition-colors hover:bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,white_12%)] hover:text-[var(--shp-primary)]">
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-primary)_24%,transparent)] bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,240,237,0.96))] p-6 text-[var(--shp-text)] shadow-[0_24px_70px_rgba(66,39,28,0.10)]">
                <h3 className="mb-2 text-lg font-bold">Plan export-ready website content in Shpitto</h3>
                <p className="mb-4 text-sm text-[var(--shp-muted)]">
                  Create company pages, product pages, and supporting articles from one workflow instead of starting from a blank page.
                </p>
                <Link
                  href="/launch-center"
                  className="block rounded-xl bg-[var(--shp-primary)] py-3 text-center font-bold text-white transition-opacity hover:opacity-95"
                >
                  See sample workflow
                </Link>
              </div>

              {relatedUseCase ? (
                <div className="rounded-2xl border border-[color-mix(in_oklab,var(--shp-border)_72%,transparent)] bg-white/78 p-6">
                  <h3 className="mb-2 text-lg font-bold text-[var(--shp-text)]">Related use case</h3>
                  <p className="mb-4 text-sm text-[var(--shp-muted)]">
                    Explore how Shpitto structures websites for {relatedUseCase.shortLabel.toLowerCase()}.
                  </p>
                  <Link
                    href={relatedUseCase.href}
                    className="block rounded-xl bg-[var(--shp-text)] py-3 text-center font-bold text-white transition-opacity hover:opacity-95"
                  >
                    View {relatedUseCase.label}
                  </Link>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
