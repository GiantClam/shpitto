PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shpitto_accounts (
  id TEXT PRIMARY KEY,
  account_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shpitto_users (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shpitto_projects (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL DEFAULT 'shpitto',
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  r2_snapshot_key TEXT,
  project_status TEXT NOT NULL DEFAULT 'active',
  deleted_at TEXT,
  archived_at TEXT,
  cleanup_started_at TEXT,
  cleanup_completed_at TEXT,
  cleanup_status TEXT,
  cleanup_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shpitto_deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT,
  r2_bundle_prefix TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shpitto_project_sites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES shpitto_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL DEFAULT 'shpitto',
  site_key TEXT NOT NULL UNIQUE,
  deployment_host TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shpitto_project_auth_users (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL DEFAULT 'shpitto',
  site_key TEXT REFERENCES shpitto_project_sites(site_key),
  auth_user_id TEXT,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  last_event TEXT NOT NULL DEFAULT 'signup',
  signup_count INTEGER NOT NULL DEFAULT 0,
  login_count INTEGER NOT NULL DEFAULT 0,
  verification_count INTEGER NOT NULL DEFAULT 0,
  password_reset_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, email)
);

CREATE TABLE IF NOT EXISTS shpitto_contact_submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL DEFAULT 'shpitto',
  site_key TEXT NOT NULL REFERENCES shpitto_project_sites(site_key),
  submission_json TEXT NOT NULL,
  visitor_ip TEXT,
  user_agent TEXT,
  origin TEXT,
  referer TEXT,
  r2_object_key TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shpitto_blog_posts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL DEFAULT 'shpitto',
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content_md TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  author_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  cover_image_url TEXT NOT NULL DEFAULT '',
  cover_image_alt TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  theme_key TEXT NOT NULL DEFAULT '',
  layout_key TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, slug)
);

CREATE TABLE IF NOT EXISTS shpitto_blog_post_revisions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES shpitto_blog_posts(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL DEFAULT 'shpitto',
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shpitto_blog_assets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES shpitto_blog_posts(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL DEFAULT 'shpitto',
  r2_object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  alt TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shpitto_blog_settings (
  project_id TEXT PRIMARY KEY REFERENCES shpitto_projects(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL DEFAULT 'shpitto',
  enabled INTEGER NOT NULL DEFAULT 1,
  nav_label TEXT NOT NULL DEFAULT 'Blog',
  home_featured_count INTEGER NOT NULL DEFAULT 3,
  default_layout_key TEXT NOT NULL DEFAULT '',
  default_theme_key TEXT NOT NULL DEFAULT '',
  rss_enabled INTEGER NOT NULL DEFAULT 1,
  sitemap_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shpitto_projects_owner
  ON shpitto_projects(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_projects_billable_owner
  ON shpitto_projects(owner_user_id, cleanup_completed_at);

CREATE INDEX IF NOT EXISTS idx_shpitto_deployments_project
  ON shpitto_deployments(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_project_sites_owner
  ON shpitto_project_sites(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_project_auth_users_project
  ON shpitto_project_auth_users(project_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_project_auth_users_owner
  ON shpitto_project_auth_users(owner_user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_owner
  ON shpitto_contact_submissions(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_site
  ON shpitto_contact_submissions(site_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_blog_posts_project
  ON shpitto_blog_posts(project_id, status, published_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_blog_posts_owner
  ON shpitto_blog_posts(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_blog_post_revisions_post
  ON shpitto_blog_post_revisions(post_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_blog_assets_post
  ON shpitto_blog_assets(post_id, created_at DESC);
