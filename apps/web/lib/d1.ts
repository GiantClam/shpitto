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
          "CREATE INDEX IF NOT EXISTS idx_shpitto_projects_owner ON shpitto_projects(owner_user_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_deployments_project ON shpitto_deployments(project_id, created_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_project_sites_owner ON shpitto_project_sites(owner_user_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_project_domains_project ON shpitto_project_domains(project_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_project_domains_owner ON shpitto_project_domains(owner_user_id, updated_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_owner ON shpitto_contact_submissions(owner_user_id, created_at DESC);",
          "CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_site ON shpitto_contact_submissions(site_key, created_at DESC);",
        ];

        for (const statement of statements) {
          await this.execute(statement);
        }

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
