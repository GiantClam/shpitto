import { createHash, randomUUID } from "node:crypto";
import { getD1Client } from "../d1.ts";
import { getR2Client } from "../r2.ts";
import { normalizeAuthEmail } from "../auth/cloudflare-email-auth.ts";

const SOURCE_APP = "shpitto";
const ACCOUNT_KEY = (process.env.SHPITTO_ACCOUNT_KEY || SOURCE_APP).trim();
const CONTACT_API_URL = (process.env.SHPITTO_CONTACT_API_URL || "").trim();
const APP_BASE_URL = (process.env.SHPITTO_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();

type ContactMeta = {
  ip?: string;
  user_agent?: string;
  origin?: string;
  referer?: string;
};

type SiteBindingRow = {
  projectId: string;
  accountId: string;
  ownerUserId: string;
};

type ProjectBindingRow = SiteBindingRow & {
  siteKey: string | null;
};

export type ProjectSiteAnalyticsBinding = {
  analyticsProvider?: string;
  analyticsStatus?: string;
  analyticsLastSyncAt?: string | null;
  cfWaSiteId?: string | null;
  cfWaSiteTag?: string | null;
  cfWaSiteToken?: string | null;
  cfWaHost?: string | null;
};

export type ProjectAnalyticsBinding = {
  projectId: string;
  ownerUserId: string;
  projectName: string;
  deploymentHost: string | null;
  latestDeploymentUrl: string | null;
  latestDeploymentAt: string | null;
  analyticsProvider: string | null;
  analyticsStatus: string | null;
  analyticsLastSyncAt: string | null;
  cfWaSiteId: string | null;
  cfWaSiteTag: string | null;
  cfWaSiteToken: string | null;
  cfWaHost: string | null;
};

export type ProjectCustomDomainRecord = {
  id: string;
  projectId: string;
  hostname: string;
  status: string;
  customHostnameId: string | null;
  sslStatus: string | null;
  originHost: string | null;
  verificationErrors: unknown[] | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAuthUserRecord = {
  id: string;
  projectId: string;
  siteKey: string | null;
  authUserId: string | null;
  email: string;
  emailVerified: boolean;
  lastEvent: string;
  signupCount: number;
  loginCount: number;
  verificationCount: number;
  passwordResetCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactSubmissionRecord = {
  id: string;
  project_id: string;
  site_key: string;
  submission_json: string;
  visitor_ip: string | null;
  user_agent: string | null;
  origin: string | null;
  referer: string | null;
  created_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeHost(url?: string | null) {
  if (!url) return null;
  const raw = String(url || "").trim().toLowerCase();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    return raw.replace(/^\/+|\/+$/g, "");
  }
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

function buildStableSiteKey(projectId: string, userId: string) {
  const digest = createHash("sha256").update(`${ACCOUNT_KEY}:${userId}:${projectId}`).digest("hex");
  return `sp_${digest.slice(0, 32)}`;
}

export function deriveProjectSiteKey(projectId: string, userId: string) {
  return buildStableSiteKey(projectId, userId);
}

function baseContactUrl() {
  if (CONTACT_API_URL) return CONTACT_API_URL;
  if (APP_BASE_URL) {
    const base = APP_BASE_URL.endsWith("/") ? APP_BASE_URL.slice(0, -1) : APP_BASE_URL;
    return `${base}/api/contact`;
  }
  throw new Error(
    "Missing contact API base URL. Set SHPITTO_CONTACT_API_URL or SHPITTO_APP_BASE_URL/NEXT_PUBLIC_APP_URL.",
  );
}

async function ensureSchemaReady() {
  const d1 = getD1Client();
  await d1.ensureShpittoSchema();
}

export async function ensureUserLink(userId: string, email?: string | null) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return;

  const timestamp = nowIso();
  await d1.execute(
    `
    INSERT INTO shpitto_accounts (id, account_key, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(account_key) DO NOTHING;
    `,
    [ACCOUNT_KEY, ACCOUNT_KEY, timestamp],
  );

  await d1.execute(
    `
    INSERT INTO shpitto_users (id, account_id, email, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      account_id = excluded.account_id,
      email = COALESCE(excluded.email, shpitto_users.email),
      updated_at = excluded.updated_at;
    `,
    [userId, ACCOUNT_KEY, email || null, timestamp, timestamp],
  );
}

export async function saveProjectState(
  userId: string,
  projectJson: unknown,
  _accessToken?: string,
  existingProjectId?: string,
) {
  const d1 = getD1Client();
  await ensureSchemaReady();

  const projectName =
    (projectJson as any)?.branding?.name?.trim?.() ||
    "Untitled Project";

  if (!d1.isConfigured()) {
    return existingProjectId || randomUUID();
  }

  await ensureUserLink(userId);

  const timestamp = nowIso();
  let projectId = existingProjectId;

  if (!projectId) {
    const byName = await d1.queryOne<{ id: string }>(
      `
      SELECT id
      FROM shpitto_projects
      WHERE owner_user_id = ?
        AND source_app = ?
        AND name = ?
      ORDER BY updated_at DESC
      LIMIT 1;
      `,
      [userId, SOURCE_APP, projectName],
    );
    projectId = byName?.id || randomUUID();
  }

  const existing = await d1.queryOne<{ id: string }>(
    "SELECT id FROM shpitto_projects WHERE id = ? LIMIT 1;",
    [projectId],
  );

  const configJson = JSON.stringify(projectJson || {});
  const r2 = getR2Client();
  let snapshotKey: string | null = null;
  if (r2.isConfigured()) {
    snapshotKey = `projects/${userId}/${projectId}/latest.json`;
    await r2.putJson(snapshotKey, projectJson || {});
  }

  if (existing) {
    await d1.execute(
      `
      UPDATE shpitto_projects
      SET name = ?,
          config_json = ?,
          r2_snapshot_key = COALESCE(?, r2_snapshot_key),
          updated_at = ?
      WHERE id = ?
        AND owner_user_id = ?
        AND source_app = ?;
      `,
      [projectName, configJson, snapshotKey, timestamp, projectId, userId, SOURCE_APP],
    );
  } else {
    await d1.execute(
      `
      INSERT INTO shpitto_projects (
        id, account_id, owner_user_id, source_app, name, config_json, r2_snapshot_key, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [projectId, ACCOUNT_KEY, userId, SOURCE_APP, projectName, configJson, snapshotKey, timestamp, timestamp],
    );
  }

  return projectId;
}

export async function upsertProjectSiteBinding(
  projectId: string,
  userId: string,
  deploymentUrl?: string | null,
  analytics?: ProjectSiteAnalyticsBinding,
) {
  const d1 = getD1Client();
  await ensureSchemaReady();

  if (!d1.isConfigured()) {
    return buildStableSiteKey(projectId, userId);
  }

  await ensureUserLink(userId);

  const now = nowIso();
  const siteKey = buildStableSiteKey(projectId, userId);
  const deploymentHost = normalizeHost(deploymentUrl);
  const analyticsProvider = String(analytics?.analyticsProvider || "cloudflare_web_analytics").trim() || "cloudflare_web_analytics";
  const analyticsStatus = String(analytics?.analyticsStatus || "pending").trim() || "pending";
  const analyticsLastSyncAt = analytics?.analyticsLastSyncAt || null;
  const cfWaSiteId = analytics?.cfWaSiteId || null;
  const cfWaSiteTag = analytics?.cfWaSiteTag || null;
  const cfWaSiteToken = analytics?.cfWaSiteToken || null;
  const cfWaHost = analytics?.cfWaHost || deploymentHost || null;

  await d1.execute(
    `
    INSERT INTO shpitto_project_sites (
      id, project_id, account_id, owner_user_id, source_app, site_key, deployment_host,
      analytics_provider, analytics_status, analytics_last_sync_at,
      cf_wa_site_id, cf_wa_site_tag, cf_wa_site_token, cf_wa_host,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      account_id = excluded.account_id,
      owner_user_id = excluded.owner_user_id,
      source_app = excluded.source_app,
      site_key = excluded.site_key,
      deployment_host = COALESCE(excluded.deployment_host, shpitto_project_sites.deployment_host),
      analytics_provider = COALESCE(excluded.analytics_provider, shpitto_project_sites.analytics_provider),
      analytics_status = COALESCE(excluded.analytics_status, shpitto_project_sites.analytics_status),
      analytics_last_sync_at = COALESCE(excluded.analytics_last_sync_at, shpitto_project_sites.analytics_last_sync_at),
      cf_wa_site_id = COALESCE(excluded.cf_wa_site_id, shpitto_project_sites.cf_wa_site_id),
      cf_wa_site_tag = COALESCE(excluded.cf_wa_site_tag, shpitto_project_sites.cf_wa_site_tag),
      cf_wa_site_token = COALESCE(excluded.cf_wa_site_token, shpitto_project_sites.cf_wa_site_token),
      cf_wa_host = COALESCE(excluded.cf_wa_host, shpitto_project_sites.cf_wa_host),
      updated_at = excluded.updated_at;
    `,
    [
      randomUUID(),
      projectId,
      ACCOUNT_KEY,
      userId,
      SOURCE_APP,
      siteKey,
      deploymentHost,
      analyticsProvider,
      analyticsStatus,
      analyticsLastSyncAt,
      cfWaSiteId,
      cfWaSiteTag,
      cfWaSiteToken,
      cfWaHost,
      now,
      now,
    ],
  );

  return siteKey;
}

export async function getProjectAnalyticsBinding(projectId: string, userId: string): Promise<ProjectAnalyticsBinding | null> {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return null;

  const row = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT
      p.id AS projectId,
      p.owner_user_id AS ownerUserId,
      p.name AS projectName,
      s.deployment_host AS deploymentHost,
      s.analytics_provider AS analyticsProvider,
      s.analytics_status AS analyticsStatus,
      s.analytics_last_sync_at AS analyticsLastSyncAt,
      s.cf_wa_site_id AS cfWaSiteId,
      s.cf_wa_site_tag AS cfWaSiteTag,
      s.cf_wa_site_token AS cfWaSiteToken,
      s.cf_wa_host AS cfWaHost,
      d.url AS latestDeploymentUrl,
      d.created_at AS latestDeploymentAt
    FROM shpitto_projects p
    LEFT JOIN shpitto_project_sites s ON s.project_id = p.id
    LEFT JOIN shpitto_deployments d ON d.id = (
      SELECT id
      FROM shpitto_deployments
      WHERE project_id = p.id
      ORDER BY created_at DESC
      LIMIT 1
    )
    WHERE p.id = ?
      AND p.owner_user_id = ?
      AND p.source_app = ?
    LIMIT 1;
    `,
    [projectId, userId, SOURCE_APP],
  );
  if (!row) return null;

  return {
    projectId: String(row.projectId || ""),
    ownerUserId: String(row.ownerUserId || ""),
    projectName: String(row.projectName || "Project"),
    deploymentHost: row.deploymentHost ? String(row.deploymentHost) : null,
    latestDeploymentUrl: row.latestDeploymentUrl ? String(row.latestDeploymentUrl) : null,
    latestDeploymentAt: row.latestDeploymentAt ? String(row.latestDeploymentAt) : null,
    analyticsProvider: row.analyticsProvider ? String(row.analyticsProvider) : null,
    analyticsStatus: row.analyticsStatus ? String(row.analyticsStatus) : null,
    analyticsLastSyncAt: row.analyticsLastSyncAt ? String(row.analyticsLastSyncAt) : null,
    cfWaSiteId: row.cfWaSiteId ? String(row.cfWaSiteId) : null,
    cfWaSiteTag: row.cfWaSiteTag ? String(row.cfWaSiteTag) : null,
    cfWaSiteToken: row.cfWaSiteToken ? String(row.cfWaSiteToken) : null,
    cfWaHost: row.cfWaHost ? String(row.cfWaHost) : null,
  };
}

export async function getOwnedProjectSummary(projectId: string, userId: string): Promise<{
  projectId: string;
  projectName: string;
  deploymentHost: string | null;
  latestDeploymentUrl: string | null;
} | null> {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return null;

  const row = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT
      p.id AS projectId,
      p.name AS projectName,
      s.deployment_host AS deploymentHost,
      d.url AS latestDeploymentUrl
    FROM shpitto_projects p
    LEFT JOIN shpitto_project_sites s ON s.project_id = p.id
    LEFT JOIN shpitto_deployments d ON d.id = (
      SELECT id
      FROM shpitto_deployments
      WHERE project_id = p.id
      ORDER BY created_at DESC
      LIMIT 1
    )
    WHERE p.id = ?
      AND p.owner_user_id = ?
      AND p.source_app = ?
    LIMIT 1;
    `,
    [projectId, userId, SOURCE_APP],
  );
  if (!row) return null;
  return {
    projectId: String(row.projectId || ""),
    projectName: String(row.projectName || "Project"),
    deploymentHost: row.deploymentHost ? String(row.deploymentHost) : null,
    latestDeploymentUrl: row.latestDeploymentUrl ? String(row.latestDeploymentUrl) : null,
  };
}

export async function upsertProjectCustomDomain(params: {
  projectId: string;
  userId: string;
  hostname: string;
  status?: string;
  customHostnameId?: string | null;
  sslStatus?: string | null;
  verificationErrors?: unknown[] | null;
  originHost?: string | null;
}) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return null;

  const projectId = String(params.projectId || "").trim();
  const userId = String(params.userId || "").trim();
  const hostname = normalizeHost(params.hostname || "");
  if (!projectId || !userId || !hostname) {
    throw new Error("upsertProjectCustomDomain requires projectId/userId/hostname.");
  }

  const project = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT id, account_id
    FROM shpitto_projects
    WHERE id = ?
      AND owner_user_id = ?
      AND source_app = ?
    LIMIT 1;
    `,
    [projectId, userId, SOURCE_APP],
  );
  if (!project) {
    throw new Error("Project not found or unauthorized.");
  }

  const status = String(params.status || "pending").trim() || "pending";
  const customHostnameId = String(params.customHostnameId || "").trim() || null;
  const sslStatus = String(params.sslStatus || "").trim() || null;
  const verificationErrorsJson = Array.isArray(params.verificationErrors)
    ? JSON.stringify(params.verificationErrors)
    : null;
  const originHost = normalizeHost(params.originHost || "") || null;
  const now = nowIso();

  await d1.execute(
    `
    INSERT INTO shpitto_project_domains (
      id, project_id, account_id, owner_user_id, source_app, hostname, status,
      custom_hostname_id, ssl_status, verification_errors_json, origin_host, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(hostname) DO UPDATE SET
      project_id = excluded.project_id,
      account_id = excluded.account_id,
      owner_user_id = excluded.owner_user_id,
      source_app = excluded.source_app,
      status = COALESCE(excluded.status, shpitto_project_domains.status),
      custom_hostname_id = COALESCE(excluded.custom_hostname_id, shpitto_project_domains.custom_hostname_id),
      ssl_status = COALESCE(excluded.ssl_status, shpitto_project_domains.ssl_status),
      verification_errors_json = COALESCE(excluded.verification_errors_json, shpitto_project_domains.verification_errors_json),
      origin_host = COALESCE(excluded.origin_host, shpitto_project_domains.origin_host),
      updated_at = excluded.updated_at;
    `,
    [
      randomUUID(),
      projectId,
      String(project.account_id || ACCOUNT_KEY),
      userId,
      SOURCE_APP,
      hostname,
      status,
      customHostnameId,
      sslStatus,
      verificationErrorsJson,
      originHost,
      now,
      now,
    ],
  );

  return hostname;
}

export async function listProjectCustomDomains(projectId: string, userId: string): Promise<ProjectCustomDomainRecord[]> {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return [];

  const rows = await d1.query<Record<string, unknown>>(
    `
    SELECT
      id,
      project_id AS projectId,
      hostname,
      status,
      custom_hostname_id AS customHostnameId,
      ssl_status AS sslStatus,
      origin_host AS originHost,
      verification_errors_json AS verificationErrorsJson,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_project_domains
    WHERE project_id = ?
      AND owner_user_id = ?
      AND source_app = ?
    ORDER BY updated_at DESC;
    `,
    [projectId, userId, SOURCE_APP],
  );

  return rows.map((row) => {
    let verificationErrors: unknown[] | null = null;
    try {
      const parsed = JSON.parse(String(row.verificationErrorsJson || "null"));
      verificationErrors = Array.isArray(parsed) ? parsed : null;
    } catch {
      verificationErrors = null;
    }
    return {
      id: String(row.id || ""),
      projectId: String(row.projectId || ""),
      hostname: String(row.hostname || ""),
      status: String(row.status || "pending"),
      customHostnameId: row.customHostnameId ? String(row.customHostnameId) : null,
      sslStatus: row.sslStatus ? String(row.sslStatus) : null,
      originHost: row.originHost ? String(row.originHost) : null,
      verificationErrors,
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
    };
  });
}

export async function syncProjectCustomDomainOrigin(
  projectId: string,
  userId: string,
  originHost: string,
) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return;

  const normalizedOriginHost = normalizeHost(originHost || "");
  if (!normalizedOriginHost) return;

  await d1.execute(
    `
    UPDATE shpitto_project_domains
    SET origin_host = ?,
        updated_at = ?
    WHERE project_id = ?
      AND owner_user_id = ?
      AND source_app = ?;
    `,
    [normalizedOriginHost, nowIso(), projectId, userId, SOURCE_APP],
  );
}

export function buildContactActionUrl(siteKey: string) {
  const base = baseContactUrl();
  try {
    const asUrl = new URL(base);
    asUrl.searchParams.set("site_key", siteKey);
    return asUrl.toString();
  } catch {
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}site_key=${encodeURIComponent(siteKey)}`;
  }
}

export async function recordDeployment(
  projectId: string,
  url: string,
  environment = "production",
  _accessToken?: string,
  r2BundlePrefix?: string,
) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return;

  const project = await d1.queryOne<{ account_id: string; owner_user_id: string }>(
    `
    SELECT account_id, owner_user_id
    FROM shpitto_projects
    WHERE id = ?
    LIMIT 1;
    `,
    [projectId],
  );

  if (!project) return;

  await d1.execute(
    `
    INSERT INTO shpitto_deployments (
      id, project_id, account_id, owner_user_id, environment, status, url, r2_bundle_prefix, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      randomUUID(),
      projectId,
      project.account_id,
      project.owner_user_id,
      environment,
      "success",
      url,
      r2BundlePrefix || null,
      nowIso(),
    ],
  );
}

export async function archiveSiteArtifactsToR2(params: {
  projectId: string;
  ownerUserId: string;
  projectJson: unknown;
  bundle: {
    manifest: Record<string, string>;
    fileEntries: Array<{ path: string; content: string; type: string }>;
  };
}) {
  const r2 = getR2Client();
  if (!r2.isConfigured()) return null;

  const revision = Date.now().toString();
  const prefix = `sites/${params.ownerUserId}/${params.projectId}/${revision}`;
  const projectKey = `${prefix}/project.json`;
  const manifestKey = `${prefix}/manifest.json`;

  await r2.putJson(projectKey, params.projectJson || {});
  await r2.putJson(manifestKey, params.bundle.manifest || {});

  for (const entry of params.bundle.fileEntries || []) {
    const cleanedPath = entry.path.replace(/^\/+/, "");
    const key = `${prefix}/pages/${cleanedPath}`;
    await r2.putObject(key, entry.content || "", {
      contentType: entry.type || "text/html; charset=utf-8",
    });
  }

  return {
    prefix,
    projectKey,
    manifestKey,
  };
}

async function resolveSiteBinding(siteKey: string): Promise<SiteBindingRow | null> {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return null;

  return d1.queryOne<SiteBindingRow>(
    `
    SELECT project_id AS projectId, account_id AS accountId, owner_user_id AS ownerUserId
    FROM shpitto_project_sites
    WHERE site_key = ?
      AND source_app = ?
    LIMIT 1;
    `,
    [siteKey, SOURCE_APP],
  );
}

async function resolveProjectBinding(params: { projectId?: string | null; siteKey?: string | null }): Promise<ProjectBindingRow | null> {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return null;

  const projectId = String(params.projectId || "").trim();
  const siteKey = String(params.siteKey || "").trim();

  if (siteKey) {
    const bySiteKey = await d1.queryOne<Record<string, unknown>>(
      `
      SELECT
        p.id AS projectId,
        p.account_id AS accountId,
        p.owner_user_id AS ownerUserId,
        s.site_key AS siteKey
      FROM shpitto_project_sites s
      INNER JOIN shpitto_projects p ON p.id = s.project_id
      WHERE s.site_key = ?
        AND s.source_app = ?
      LIMIT 1;
      `,
      [siteKey, SOURCE_APP],
    );

    if (bySiteKey) {
      if (projectId && String(bySiteKey.projectId || "") !== projectId) return null;
      return {
        projectId: String(bySiteKey.projectId || ""),
        accountId: String(bySiteKey.accountId || ""),
        ownerUserId: String(bySiteKey.ownerUserId || ""),
        siteKey: bySiteKey.siteKey ? String(bySiteKey.siteKey) : null,
      };
    }
  }

  if (!projectId) return null;

  const byProjectId = await d1.queryOne<Record<string, unknown>>(
    `
    SELECT
      p.id AS projectId,
      p.account_id AS accountId,
      p.owner_user_id AS ownerUserId,
      s.site_key AS siteKey
    FROM shpitto_projects p
    LEFT JOIN shpitto_project_sites s ON s.project_id = p.id
    WHERE p.id = ?
      AND p.source_app = ?
    LIMIT 1;
    `,
    [projectId, SOURCE_APP],
  );

  if (!byProjectId) return null;

  return {
    projectId: String(byProjectId.projectId || ""),
    accountId: String(byProjectId.accountId || ""),
    ownerUserId: String(byProjectId.ownerUserId || ""),
    siteKey: byProjectId.siteKey ? String(byProjectId.siteKey) : null,
  };
}

export async function submitContactForm(
  siteKey: string,
  submissionData: Record<string, unknown>,
  meta: ContactMeta = {},
) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) {
    throw new Error("Cloudflare D1 is not configured.");
  }

  const binding = await resolveSiteBinding(siteKey);
  if (!binding) {
    throw new Error("Invalid site key.");
  }

  const submissionId = randomUUID();
  const timestamp = nowIso();
  const payload = JSON.stringify(submissionData || {});

  let r2ObjectKey: string | null = null;
  const r2 = getR2Client();
  if (r2.isConfigured()) {
    r2ObjectKey = `contact/${binding.ownerUserId}/${binding.projectId}/${submissionId}.json`;
    await r2.putJson(r2ObjectKey, {
      id: submissionId,
      siteKey,
      projectId: binding.projectId,
      ownerUserId: binding.ownerUserId,
      accountId: binding.accountId,
      submission: submissionData || {},
      meta,
      createdAt: timestamp,
    });
  }

  await d1.execute(
    `
    INSERT INTO shpitto_contact_submissions (
      id, project_id, account_id, owner_user_id, source_app, site_key, submission_json,
      visitor_ip, user_agent, origin, referer, r2_object_key, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      submissionId,
      binding.projectId,
      binding.accountId,
      binding.ownerUserId,
      SOURCE_APP,
      siteKey,
      payload,
      meta.ip || null,
      meta.user_agent || null,
      meta.origin || null,
      meta.referer || null,
      r2ObjectKey,
      timestamp,
    ],
  );

  return {
    submissionId,
    projectId: binding.projectId,
    ownerUserId: binding.ownerUserId,
    accountId: binding.accountId,
    r2ObjectKey,
  };
}

export async function recordProjectAuthUserActivity(params: {
  projectId?: string | null;
  siteKey?: string | null;
  authUserId?: string | null;
  email: string;
  emailVerified?: boolean;
  event:
    | "signup"
    | "login"
    | "oauth_login"
    | "email_verified"
    | "verification_resend"
    | "password_reset_requested"
    | "password_reset_completed";
}) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return null;

  const binding = await resolveProjectBinding({ projectId: params.projectId, siteKey: params.siteKey });
  if (!binding) return null;

  const now = nowIso();
  const event = String(params.event || "").trim().toLowerCase();
  const email = normalizeAuthEmail(params.email);
  const authUserId = String(params.authUserId || "").trim() || null;
  const isSignup = event === "signup";
  const isLogin = event === "login" || event === "oauth_login";
  const isVerification = event === "email_verified" || event === "verification_resend";
  const isPasswordReset = event === "password_reset_requested" || event === "password_reset_completed";

  await d1.execute(
    `
    INSERT INTO shpitto_project_auth_users (
      id, project_id, account_id, owner_user_id, source_app, site_key, auth_user_id,
      email, email_verified, last_event, signup_count, login_count, verification_count,
      password_reset_count, first_seen_at, last_seen_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, email) DO UPDATE SET
      account_id = excluded.account_id,
      owner_user_id = excluded.owner_user_id,
      source_app = excluded.source_app,
      site_key = COALESCE(excluded.site_key, shpitto_project_auth_users.site_key),
      auth_user_id = COALESCE(excluded.auth_user_id, shpitto_project_auth_users.auth_user_id),
      email_verified = CASE
        WHEN excluded.email_verified = 1 THEN 1
        ELSE shpitto_project_auth_users.email_verified
      END,
      last_event = excluded.last_event,
      signup_count = shpitto_project_auth_users.signup_count + CASE WHEN excluded.last_event = 'signup' THEN 1 ELSE 0 END,
      login_count = shpitto_project_auth_users.login_count + CASE WHEN excluded.last_event IN ('login', 'oauth_login') THEN 1 ELSE 0 END,
      verification_count = shpitto_project_auth_users.verification_count + CASE WHEN excluded.last_event IN ('email_verified', 'verification_resend') THEN 1 ELSE 0 END,
      password_reset_count = shpitto_project_auth_users.password_reset_count + CASE WHEN excluded.last_event IN ('password_reset_requested', 'password_reset_completed') THEN 1 ELSE 0 END,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at;
    `,
    [
      randomUUID(),
      binding.projectId,
      binding.accountId,
      binding.ownerUserId,
      SOURCE_APP,
      binding.siteKey || params.siteKey || null,
      authUserId,
      email,
      params.emailVerified ? 1 : 0,
      event,
      isSignup ? 1 : 0,
      isLogin ? 1 : 0,
      isVerification ? 1 : 0,
      isPasswordReset ? 1 : 0,
      now,
      now,
      now,
      now,
    ],
  );

  return {
    projectId: binding.projectId,
    siteKey: binding.siteKey,
    email,
  };
}

export async function listProjectAuthUsersByProject(userId: string, projectId: string, limit = 100, offset = 0) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return [] as ProjectAuthUserRecord[];

  return d1.query<ProjectAuthUserRecord>(
    `
    SELECT
      id,
      project_id AS projectId,
      site_key AS siteKey,
      auth_user_id AS authUserId,
      email,
      email_verified AS emailVerified,
      last_event AS lastEvent,
      signup_count AS signupCount,
      login_count AS loginCount,
      verification_count AS verificationCount,
      password_reset_count AS passwordResetCount,
      first_seen_at AS firstSeenAt,
      last_seen_at AS lastSeenAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM shpitto_project_auth_users
    WHERE owner_user_id = ?
      AND project_id = ?
      AND source_app = ?
    ORDER BY last_seen_at DESC, created_at DESC
    LIMIT ?
    OFFSET ?;
    `,
    [userId, projectId, SOURCE_APP, Math.max(1, Math.min(limit, 500)), Math.max(0, Math.floor(offset))],
  );
}

export async function listContactSubmissionsByOwner(userId: string, limit = 100, offset = 0) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return [] as ContactSubmissionRecord[];

  return d1.query<ContactSubmissionRecord>(
    `
    SELECT
      id,
      project_id,
      site_key,
      submission_json,
      visitor_ip,
      user_agent,
      origin,
      referer,
      created_at
    FROM shpitto_contact_submissions
    WHERE owner_user_id = ?
      AND source_app = ?
    ORDER BY created_at DESC
    LIMIT ?
    OFFSET ?;
    `,
    [userId, SOURCE_APP, Math.max(1, Math.min(limit, 500)), Math.max(0, Math.floor(offset))],
  );
}

export async function listContactSubmissionsByProject(userId: string, projectId: string, limit = 100, offset = 0) {
  const d1 = getD1Client();
  await ensureSchemaReady();
  if (!d1.isConfigured()) return [] as ContactSubmissionRecord[];

  return d1.query<ContactSubmissionRecord>(
    `
    SELECT
      id,
      project_id,
      site_key,
      submission_json,
      visitor_ip,
      user_agent,
      origin,
      referer,
      created_at
    FROM shpitto_contact_submissions
    WHERE owner_user_id = ?
      AND project_id = ?
      AND source_app = ?
    ORDER BY created_at DESC
    LIMIT ?
    OFFSET ?;
    `,
    [userId, projectId, SOURCE_APP, Math.max(1, Math.min(limit, 500)), Math.max(0, Math.floor(offset))],
  );
}
