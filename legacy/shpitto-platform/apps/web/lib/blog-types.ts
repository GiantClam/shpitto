export type BlogPostStatus = "draft" | "scheduled" | "published" | "archived";

export type BlogPostRecord = {
  id: string;
  projectId: string;
  accountId: string;
  ownerUserId: string;
  slug: string;
  title: string;
  excerpt: string;
  contentMd: string;
  contentHtml: string;
  status: BlogPostStatus;
  authorName: string;
  category: string;
  tags: string[];
  coverImageUrl: string;
  coverImageAlt: string;
  seoTitle: string;
  seoDescription: string;
  themeKey: string;
  layoutKey: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlogAssetRecord = {
  id: string;
  postId: string;
  projectId: string;
  accountId: string;
  ownerUserId: string;
  r2ObjectKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string;
  createdAt: string;
  updatedAt: string;
};

export type BlogSettingsRecord = {
  projectId: string;
  accountId: string;
  ownerUserId: string;
  enabled: boolean;
  navLabel: string;
  homeFeaturedCount: number;
  defaultLayoutKey: string;
  defaultThemeKey: string;
  rssEnabled: boolean;
  sitemapEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BlogPostUpsertInput = {
  slug?: string;
  title: string;
  excerpt?: string;
  contentMd: string;
  status?: BlogPostStatus;
  authorName?: string;
  category?: string;
  tags?: string[];
  coverImageUrl?: string;
  coverImageAlt?: string;
  seoTitle?: string;
  seoDescription?: string;
  themeKey?: string;
  layoutKey?: string;
  publishedAt?: string | null;
};
