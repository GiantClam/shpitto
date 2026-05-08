type D1ApiError = {
  code?: number;
  message?: string;
};

type D1Result = {
  success?: boolean;
  results?: Record<string, unknown>[];
  meta?: Record<string, unknown>;
  errors?: D1ApiError[];
};

type D1ApiResponse = {
  success?: boolean;
  errors?: D1ApiError[];
  result?: D1Result[] | D1Result;
};

const SOURCE_APP = "shpitto";

function nowIso() {
  return new Date().toISOString();
}

function normalizeParams(params: unknown[]) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object" && value !== null) return JSON.stringify(value);
    return value;
  });
}

export class CloudflareD1Client {
  private readonly accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  private readonly apiToken = process.env.CLOUDFLARE_API_TOKEN || "";
  private readonly databaseId =
    process.env.CLOUDFLARE_D1_DATABASE_ID ||
    process.env.CLOUDFLARE_D1_DB_ID ||
    process.env.D1_DATABASE_ID ||
    "";
  private readonly baseUrl = process.env.CLOUDFLARE_BASE_URL || "https://api.cloudflare.com/client/v4";

  private schemaReady = false;
  private schemaPromise: Promise<void> | null = null;

  isConfigured() {
    return Boolean(this.accountId && this.apiToken && this.databaseId);
  }

  private get endpoint() {
    return `${this.baseUrl}/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
  }

  private async request(sql: string, params: unknown[] = []): Promise<D1Result> {
    if (!this.isConfigured()) {
      throw new Error("Cloudflare D1 is not configured. Missing account/token/database id.");
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql,
        params: normalizeParams(params),
      }),
    });

    const payload = (await response.json()) as D1ApiResponse;
    if (!response.ok || payload.success === false) {
      const message =
        payload?.errors?.[0]?.message ||
        `D1 query failed with status ${response.status}`;
      throw new Error(message);
    }

    if (Array.isArray(payload.result)) {
      return payload.result[0] || {};
    }

    return payload.result || {};
  }

  async query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.request(sql, params);
    return (result.results || []) as T[];
  }

  async queryOne<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] || null;
  }

  async execute(sql: string, params: unknown[] = []) {
    return this.request(sql, params);
  }

  private async ensureTableColumns(
    tableName: string,
    columns: Array<{ name: string; definition: string }>,
  ) {
    const tableInfo = await this.query<Record<string, unknown>>(
      `PRAGMA table_info(${tableName});`,
    );
    const existingColumns = new Set(
      (tableInfo || []).map((row) => String((row as any)?.name || "").trim().toLowerCase()).filter(Boolean),
    );
    for (const column of columns) {
      const columnName = String(column?.name || "").trim();
      if (!columnName) continue;
      if (existingColumns.has(columnName.toLowerCase())) continue;
      await this.execute(`ALTER TABLE ${tableName} ADD COLUMN ${column.definition};`);
      existingColumns.add(columnName.toLowerCase());
    }
  }

  async ensureShpittoSchema() {
    if (!this.isConfigured()) return;
    if (this.schemaReady) return;

    if (!this.schemaPromise) {
      this.schemaPromise = (async () => {
        const statements = [
          "PRAGMA foreign_keys = ON;",
          `
          CREATE TABLE IF NOT EXISTS shpitto_accounts (
            id TEXT PRIMARY KEY,
            account_key TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
          );
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_users (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            email TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_projects (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
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
          `,
          `
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
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_project_sites (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL UNIQUE REFERENCES shpitto_projects(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
            site_key TEXT NOT NULL UNIQUE,
            deployment_host TEXT UNIQUE,
            analytics_provider TEXT NOT NULL DEFAULT 'cloudflare_web_analytics',
            analytics_status TEXT NOT NULL DEFAULT 'pending',
            analytics_last_sync_at TEXT,
            cf_wa_site_id TEXT,
            cf_wa_site_tag TEXT,
            cf_wa_site_token TEXT,
            cf_wa_host TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_project_domains (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
            hostname TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'pending',
            custom_hostname_id TEXT,
            ssl_status TEXT,
            verification_errors_json TEXT,
            origin_host TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_project_auth_users (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
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
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_contact_submissions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
            site_key TEXT NOT NULL REFERENCES shpitto_project_sites(site_key),
            submission_json TEXT NOT NULL,
            visitor_ip TEXT,
            user_agent TEXT,
            origin TEXT,
            referer TEXT,
            r2_object_key TEXT,
            created_at TEXT NOT NULL
          );
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_blog_posts (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
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
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_blog_post_revisions (
            id TEXT PRIMARY KEY,
            post_id TEXT NOT NULL REFERENCES shpitto_blog_posts(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
            version INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_blog_assets (
            id TEXT PRIMARY KEY,
            post_id TEXT NOT NULL REFERENCES shpitto_blog_posts(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL REFERENCES shpitto_projects(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
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
          `,
          `
          CREATE TABLE IF NOT EXISTS shpitto_blog_settings (
            project_id TEXT PRIMARY KEY REFERENCES shpitto_projects(id) ON DELETE CASCADE,
            account_id TEXT NOT NULL REFERENCES shpitto_accounts(id) ON DELETE CASCADE,
            owner_user_id TEXT NOT NULL REFERENCES shpitto_users(id) ON DELETE CASCADE,
            source_app TEXT NOT NULL DEFAULT '${SOURCE_APP}',
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
          `,
          "CREATE INDEX IF NOT EXISTS idx_shpitto_projects_owner ON shpitto_projects(owner_user_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_deployments_project ON shpitto_deployments(project_id, created_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_project_sites_owner ON shpitto_project_sites(owner_user_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_project_domains_project ON shpitto_project_domains(project_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_project_domains_owner ON shpitto_project_domains(owner_user_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_project_auth_users_project ON shpitto_project_auth_users(project_id, last_seen_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_project_auth_users_owner ON shpitto_project_auth_users(owner_user_id, last_seen_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_owner ON shpitto_contact_submissions(owner_user_id, created_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_site ON shpitto_contact_submissions(site_key, created_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_blog_posts_project ON shpitto_blog_posts(project_id, status, published_at DESC, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_blog_posts_owner ON shpitto_blog_posts(owner_user_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_blog_post_revisions_post ON shpitto_blog_post_revisions(post_id, version DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_blog_assets_post ON shpitto_blog_assets(post_id, created_at DESC);",
        ];

        for (const statement of statements) {
          await this.execute(statement);
        }

        await this.ensureTableColumns("shpitto_projects", [
          { name: "project_status", definition: "project_status TEXT NOT NULL DEFAULT 'active'" },
          { name: "deleted_at", definition: "deleted_at TEXT" },
          { name: "archived_at", definition: "archived_at TEXT" },
          { name: "cleanup_started_at", definition: "cleanup_started_at TEXT" },
          { name: "cleanup_completed_at", definition: "cleanup_completed_at TEXT" },
          { name: "cleanup_status", definition: "cleanup_status TEXT" },
          { name: "cleanup_error", definition: "cleanup_error TEXT" },
        ]);
        await this.execute(
          "CREATE INDEX IF NOT EXISTS idx_shpitto_projects_billable_owner ON shpitto_projects(owner_user_id, cleanup_completed_at);",
        );
        await this.ensureTableColumns("shpitto_project_sites", [
          { name: "analytics_provider", definition: "analytics_provider TEXT NOT NULL DEFAULT 'cloudflare_web_analytics'" },
          { name: "analytics_status", definition: "analytics_status TEXT NOT NULL DEFAULT 'pending'" },
          { name: "analytics_last_sync_at", definition: "analytics_last_sync_at TEXT" },
          { name: "cf_wa_site_id", definition: "cf_wa_site_id TEXT" },
          { name: "cf_wa_site_tag", definition: "cf_wa_site_tag TEXT" },
          { name: "cf_wa_site_token", definition: "cf_wa_site_token TEXT" },
          { name: "cf_wa_host", definition: "cf_wa_host TEXT" },
        ]);
        await this.ensureTableColumns("shpitto_project_domains", [
          { name: "status", definition: "status TEXT NOT NULL DEFAULT 'pending'" },
          { name: "custom_hostname_id", definition: "custom_hostname_id TEXT" },
          { name: "ssl_status", definition: "ssl_status TEXT" },
          { name: "verification_errors_json", definition: "verification_errors_json TEXT" },
          { name: "origin_host", definition: "origin_host TEXT" },
        ]);
        await this.ensureTableColumns("shpitto_blog_posts", [
          { name: "excerpt", definition: "excerpt TEXT NOT NULL DEFAULT ''" },
          { name: "content_md", definition: "content_md TEXT NOT NULL DEFAULT ''" },
          { name: "content_html", definition: "content_html TEXT NOT NULL DEFAULT ''" },
          { name: "status", definition: "status TEXT NOT NULL DEFAULT 'draft'" },
          { name: "author_name", definition: "author_name TEXT NOT NULL DEFAULT ''" },
          { name: "category", definition: "category TEXT NOT NULL DEFAULT ''" },
          { name: "tags_json", definition: "tags_json TEXT NOT NULL DEFAULT '[]'" },
          { name: "cover_image_url", definition: "cover_image_url TEXT NOT NULL DEFAULT ''" },
          { name: "cover_image_alt", definition: "cover_image_alt TEXT NOT NULL DEFAULT ''" },
          { name: "seo_title", definition: "seo_title TEXT NOT NULL DEFAULT ''" },
          { name: "seo_description", definition: "seo_description TEXT NOT NULL DEFAULT ''" },
          { name: "theme_key", definition: "theme_key TEXT NOT NULL DEFAULT ''" },
          { name: "layout_key", definition: "layout_key TEXT NOT NULL DEFAULT ''" },
          { name: "published_at", definition: "published_at TEXT" },
        ]);
        await this.ensureTableColumns("shpitto_blog_settings", [
          { name: "enabled", definition: "enabled INTEGER NOT NULL DEFAULT 1" },
          { name: "nav_label", definition: "nav_label TEXT NOT NULL DEFAULT 'Blog'" },
          { name: "home_featured_count", definition: "home_featured_count INTEGER NOT NULL DEFAULT 3" },
          { name: "default_layout_key", definition: "default_layout_key TEXT NOT NULL DEFAULT ''" },
          { name: "default_theme_key", definition: "default_theme_key TEXT NOT NULL DEFAULT ''" },
          { name: "rss_enabled", definition: "rss_enabled INTEGER NOT NULL DEFAULT 1" },
          { name: "sitemap_enabled", definition: "sitemap_enabled INTEGER NOT NULL DEFAULT 1" },
        ]);

        const accountKey = process.env.SHPITTO_ACCOUNT_KEY || SOURCE_APP;
        const timestamp = nowIso();
        await this.execute(
          `
          INSERT INTO shpitto_accounts (id, account_key, created_at)
          VALUES (?, ?, ?)
          ON CONFLICT(account_key) DO NOTHING;
          `,
          [accountKey, accountKey, timestamp],
        );

        this.schemaReady = true;
      })();
    }

    await this.schemaPromise;
  }
}

const d1Client = new CloudflareD1Client();

export function getD1Client() {
  return d1Client;
}
