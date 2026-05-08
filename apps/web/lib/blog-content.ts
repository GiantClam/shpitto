import type { BlogPostRecord } from "./blog-types";

export const BLOG_FALLBACK_POSTS: BlogPostRecord[] = [
  {
    id: "demo-1",
    projectId: "demo",
    accountId: "demo",
    ownerUserId: "demo",
    slug: "future-of-industrial-web-design",
    title: "The Future of Industrial Web Design: AI-Driven & Data-First",
    excerpt:
      "How AI is transforming the way manufacturing companies build their digital presence, moving from static brochures to dynamic lead generation engines.",
    contentMd:
      "# The Future of Industrial Web Design\n\nThe industrial sector has historically lagged behind in digital adoption. That is changing rapidly.\n\n## The Shift to Semantic Search\n\nSearch engines are no longer just matching keywords; they are understanding intent.\n\n## Data-First Design\n\nModern buyers want to see structured information, strong evidence, and clear calls to action.",
    contentHtml: "",
    status: "published",
    authorName: "Sarah Chen",
    category: "Industry Trends",
    tags: ["seo", "industrial", "design"],
    coverImageUrl:
      "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=1200",
    coverImageAlt: "Industrial web design workspace",
    seoTitle: "The Future of Industrial Web Design",
    seoDescription:
      "How AI and structured content reshape industrial web design, SEO, and lead generation.",
    themeKey: "editorial",
    layoutKey: "feature",
    publishedAt: "2025-10-24T00:00:00.000Z",
    createdAt: "2025-10-24T00:00:00.000Z",
    updatedAt: "2025-10-24T00:00:00.000Z",
  },
  {
    id: "demo-2",
    projectId: "demo",
    accountId: "demo",
    ownerUserId: "demo",
    slug: "seo-for-manufacturers-2026",
    title: "SEO for Manufacturers: 5 Key Strategies for 2026",
    excerpt:
      "Why traditional B2B SEO is evolving, and how to structure product content for the semantic search era.",
    contentMd:
      "# SEO for Manufacturers\n\nLearn how to adapt your content strategy for topic clusters, structured data, and long-form evidence pages.",
    contentHtml: "",
    status: "published",
    authorName: "Alex V.",
    category: "Growth Strategy",
    tags: ["seo", "growth"],
    coverImageUrl:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200",
    coverImageAlt: "SEO and analytics dashboard",
    seoTitle: "SEO for Manufacturers in 2026",
    seoDescription: "A practical SEO playbook for manufacturers and industrial brands.",
    themeKey: "editorial",
    layoutKey: "grid",
    publishedAt: "2025-11-15T00:00:00.000Z",
    createdAt: "2025-11-15T00:00:00.000Z",
    updatedAt: "2025-11-15T00:00:00.000Z",
  },
];
