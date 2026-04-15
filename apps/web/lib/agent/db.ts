import { createHash, randomUUID } from "node:crypto";
import { getD1Client } from "../d1";
import { getR2Client } from "../r2";

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
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

function buildStableSiteKey(projectId: string, userId: string) {
  const digest = createHash("sha256").update(`${ACCOUNT_KEY}:${userId}:${projectId}`).digest("hex");
  return `sp_${digest.slice(0, 32)}`;
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

async function ensureUserLink(userId: string, email?: string | null) {
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

  await d1.execute(
    `
    INSERT INTO shpitto_project_sites (
      id, project_id, account_id, owner_user_id, source_app, site_key, deployment_host, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      account_id = excluded.account_id,
      owner_user_id = excluded.owner_user_id,
      source_app = excluded.source_app,
      site_key = excluded.site_key,
      deployment_host = COALESCE(excluded.deployment_host, shpitto_project_sites.deployment_host),
      updated_at = excluded.updated_at;
    `,
    [randomUUID(), projectId, ACCOUNT_KEY, userId, SOURCE_APP, siteKey, deploymentHost, now, now],
  );

  return siteKey;
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

export async function listContactSubmissionsByOwner(userId: string, limit = 100) {
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
    LIMIT ?;
    `,
    [userId, SOURCE_APP, Math.max(1, Math.min(limit, 500))],
  );
}
