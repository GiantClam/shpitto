import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("shpitto_accounts", {
  id: text("id").primaryKey(),
  accountKey: text("account_key").notNull(),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("shpitto_users", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  email: text("email"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projects = sqliteTable("shpitto_projects", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  name: text("name").notNull(),
  configJson: text("config_json").notNull(),
  r2SnapshotKey: text("r2_snapshot_key"),
  projectStatus: text("project_status").notNull(),
  deletedAt: text("deleted_at"),
  archivedAt: text("archived_at"),
  cleanupStartedAt: text("cleanup_started_at"),
  cleanupCompletedAt: text("cleanup_completed_at"),
  cleanupStatus: text("cleanup_status"),
  cleanupError: text("cleanup_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const deployments = sqliteTable("shpitto_deployments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  environment: text("environment").notNull(),
  status: text("status").notNull(),
  url: text("url"),
  r2BundlePrefix: text("r2_bundle_prefix"),
  createdAt: text("created_at").notNull(),
});

export const projectSites = sqliteTable("shpitto_project_sites", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  siteKey: text("site_key").notNull(),
  deploymentHost: text("deployment_host"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectAuthUsers = sqliteTable("shpitto_project_auth_users", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  siteKey: text("site_key").references(() => projectSites.siteKey),
  authUserId: text("auth_user_id"),
  email: text("email").notNull(),
  emailVerified: integer("email_verified").notNull(),
  lastEvent: text("last_event").notNull(),
  signupCount: integer("signup_count").notNull(),
  loginCount: integer("login_count").notNull(),
  verificationCount: integer("verification_count").notNull(),
  passwordResetCount: integer("password_reset_count").notNull(),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const contactSubmissions = sqliteTable("shpitto_contact_submissions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  siteKey: text("site_key").notNull().references(() => projectSites.siteKey),
  submissionJson: text("submission_json").notNull(),
  visitorIp: text("visitor_ip"),
  userAgent: text("user_agent"),
  origin: text("origin"),
  referer: text("referer"),
  r2ObjectKey: text("r2_object_key"),
  createdAt: text("created_at").notNull(),
});

export const blogPosts = sqliteTable("shpitto_blog_posts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  contentMd: text("content_md").notNull(),
  contentHtml: text("content_html").notNull(),
  status: text("status").notNull(),
  authorName: text("author_name").notNull(),
  category: text("category").notNull(),
  tagsJson: text("tags_json").notNull(),
  coverImageUrl: text("cover_image_url").notNull(),
  coverImageAlt: text("cover_image_alt").notNull(),
  seoTitle: text("seo_title").notNull(),
  seoDescription: text("seo_description").notNull(),
  themeKey: text("theme_key").notNull(),
  layoutKey: text("layout_key").notNull(),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const blogPostRevisions = sqliteTable("shpitto_blog_post_revisions", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => blogPosts.id),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  version: integer("version").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const blogAssets = sqliteTable("shpitto_blog_assets", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => blogPosts.id),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  r2ObjectKey: text("r2_object_key").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  width: integer("width"),
  height: integer("height"),
  alt: text("alt").notNull(),
  caption: text("caption").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const blogSettings = sqliteTable("shpitto_blog_settings", {
  projectId: text("project_id").primaryKey().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  enabled: integer("enabled").notNull(),
  navLabel: text("nav_label").notNull(),
  homeFeaturedCount: integer("home_featured_count").notNull(),
  defaultLayoutKey: text("default_layout_key").notNull(),
  defaultThemeKey: text("default_theme_key").notNull(),
  rssEnabled: integer("rss_enabled").notNull(),
  sitemapEnabled: integer("sitemap_enabled").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
