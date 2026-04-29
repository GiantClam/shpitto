import Link from "next/link";
import { ArrowRight, Calendar, User } from "lucide-react";
import { getLandingCopy, type Locale } from "@/lib/i18n";

export function BlogSection({ locale = "en" }: { locale?: Locale }) {
  const copy = getLandingCopy(locale).blog;
  const posts = [
    {
      ...copy.posts[0],
      slug: "personal-blog-from-ai-notes",
      date: "Oct 24, 2025",
      author: "Sarah Chen",
      image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800",
    },
    {
      ...copy.posts[1],
      slug: "company-site-generate-deploy-measure",
      date: "Nov 02, 2025",
      author: "Mike Ross",
      image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800",
    },
    {
      ...copy.posts[2],
      slug: "launch-ai-tool-site-without-cms",
      date: "Nov 15, 2025",
      author: "Alex V.",
      image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800",
    },
  ];

  return (
    <section id="blog" className="border-t border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_95%,white_5%)] py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-12 flex items-end justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-primary)_35%,transparent)] bg-[color-mix(in_oklab,var(--shp-primary)_15%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--shp-primary)]">
              {copy.badge}
            </div>
            <h2 className="text-3xl font-bold text-[var(--shp-text)] lg:text-4xl">{copy.title}</h2>
          </div>
          <Link href="/blog" className="hidden items-center gap-2 font-bold text-[var(--shp-primary)] transition-all hover:gap-3 md:flex">
            {copy.viewAll} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {posts.map((post, i) => (
            <Link key={i} href={`/blog/${post.slug}`} className="group flex h-full cursor-pointer flex-col">
              <div className="relative mb-6 aspect-video overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,transparent)]">
                <img src={post.image} alt={post.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute left-4 top-4 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_65%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_86%,white_14%)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--shp-primary)] backdrop-blur-sm">
                  {post.category}
                </div>
              </div>

              <div className="mb-3 flex items-center gap-4 text-xs text-[var(--shp-muted)]">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {post.date}
                </div>
                <div className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {post.author}
                </div>
              </div>

              <h3 className="mb-3 line-clamp-2 text-xl font-bold text-[var(--shp-text)] transition-colors group-hover:text-[var(--shp-primary)]">
                {post.title}
              </h3>

              <p className="mb-4 line-clamp-3 flex-grow text-sm leading-relaxed text-[var(--shp-muted)]">{post.excerpt}</p>

              <div className="mt-auto flex items-center gap-2 text-sm font-bold text-[var(--shp-primary)] transition-all group-hover:gap-3">
                {copy.readArticle} <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center md:hidden">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_88%,transparent)] px-6 py-3 font-bold text-[var(--shp-text)]"
          >
            {copy.viewAll}
          </Link>
        </div>
      </div>
    </section>
  );
}
