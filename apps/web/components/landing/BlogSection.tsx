import Link from "next/link";
import { ArrowRight, Calendar, User } from "lucide-react";
import { getLandingCopy, type Locale } from "@/lib/i18n";

export function BlogSection({ locale = "en" }: { locale?: Locale }) {
  const copy = getLandingCopy(locale).blog;
  const posts = [
    {
      ...copy.posts[0],
      slug: "future-of-industrial-web-design",
      date: "Oct 24, 2025",
      author: "Sarah Chen",
      image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800",
    },
    {
      ...copy.posts[1],
      slug: "apex-robotics-case-study",
      date: "Nov 02, 2025",
      author: "Mike Ross",
      image: "https://images.unsplash.com/photo-1565514020176-dbf227780065?auto=format&fit=crop&q=80&w=800",
    },
    {
      ...copy.posts[2],
      slug: "seo-for-manufacturers-2026",
      date: "Nov 15, 2025",
      author: "Alex V.",
      image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800",
    },
  ];

  return (
    <section id="blog" className="border-t border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg-soft)_88%,#060606_12%)] py-24">
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
              <div className="relative mb-6 aspect-video overflow-hidden rounded-xl border border-[color-mix(in_oklab,var(--shp-border)_68%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_76%,transparent)]">
                <img src={post.image} alt={post.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                <div className="absolute left-4 top-4 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_65%,transparent)] bg-[color-mix(in_oklab,var(--shp-bg)_76%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--shp-primary)] backdrop-blur-sm">
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
            className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_oklab,var(--shp-border)_70%,transparent)] bg-[color-mix(in_oklab,var(--shp-surface)_72%,transparent)] px-6 py-3 font-bold text-[var(--shp-text)]"
          >
            {copy.viewAll}
          </Link>
        </div>
      </div>
    </section>
  );
}
