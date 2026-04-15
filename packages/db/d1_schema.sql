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

CREATE INDEX IF NOT EXISTS idx_shpitto_projects_owner
  ON shpitto_projects(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_deployments_project
  ON shpitto_deployments(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_project_sites_owner
  ON shpitto_project_sites(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_owner
  ON shpitto_contact_submissions(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_site
  ON shpitto_contact_submissions(site_key, created_at DESC);

