const SOURCE_APP = "shpitto";
const ACCOUNT_KEY = "shpitto";
let schemaReadyPromise = null;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function getCorsHeaders(request, env) {
  const allowOrigin = env.CORS_ALLOW_ORIGIN || request.headers.get("origin") || "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "POST,GET,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function extractClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return "";
  return xff.split(",")[0]?.trim() || "";
}

function buildRedirectTarget(request, env) {
  const referer = request.headers.get("referer") || "";
  if (referer) {
    try {
      const url = new URL(referer);
      url.searchParams.set("contact_submitted", "1");
      return url.toString();
    } catch {
      // Fallback below.
    }
  }

  if (env.DEFAULT_REDIRECT_URL) {
    try {
      const url = new URL(env.DEFAULT_REDIRECT_URL);
      url.searchParams.set("contact_submitted", "1");
      return url.toString();
    } catch {
      // Ignore malformed fallback.
    }
  }

  return null;
}

function formDataToObject(formData) {
  const data = {};
  for (const [key, value] of formData.entries()) {
    if (key === "_site_key" || key === "site_key") continue;
    if (typeof value === "string") data[key] = value;
  }
  return data;
}

async function parseIncomingPayload(request) {
  const url = new URL(request.url);
  const siteKeyFromQuery = url.searchParams.get("site_key") || "";
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const siteKey = String(body.siteKey || body.site_key || siteKeyFromQuery || "").trim();
    const data = body.data && typeof body.data === "object" ? body.data : { ...body };
    delete data.siteKey;
    delete data.site_key;
    return { siteKey, data, shouldRedirect: false };
  }

  const formData = await request.formData();
  const siteKey = String(
    formData.get("_site_key") || formData.get("site_key") || siteKeyFromQuery || "",
  ).trim();
  const data = formDataToObject(formData);
  return { siteKey, data, shouldRedirect: true };
}

async function resolveSiteBinding(env, siteKey) {
  const sql = `
    SELECT project_id, account_id, owner_user_id
    FROM shpitto_project_sites
    WHERE site_key = ?
      AND source_app = ?
    LIMIT 1;
  `;
  const row = await env.CONTACT_DB.prepare(sql).bind(siteKey, SOURCE_APP).first();
  return row || null;
}

async function ensureSchema(env) {
  if (schemaReadyPromise) {
    await schemaReadyPromise;
    return;
  }

  schemaReadyPromise = (async () => {
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
      "CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_owner ON shpitto_contact_submissions(owner_user_id, created_at DESC);",
      "CREATE INDEX IF NOT EXISTS idx_shpitto_contact_submissions_site ON shpitto_contact_submissions(site_key, created_at DESC);",
    ];

    for (const statement of statements) {
      await env.CONTACT_DB.prepare(statement).run();
    }

    const now = new Date().toISOString();
    await env.CONTACT_DB.prepare(
      `
      INSERT INTO shpitto_accounts (id, account_key, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(account_key) DO NOTHING;
      `,
    ).bind(ACCOUNT_KEY, ACCOUNT_KEY, now).run();
  })();

  await schemaReadyPromise;
}

async function archiveToR2(env, binding, siteKey, submissionId, submissionData, meta, createdAt) {
  if (!env.CONTACT_ARCHIVE_BUCKET) return null;

  const key = `contact/${binding.owner_user_id}/${binding.project_id}/${submissionId}.json`;
  const payload = {
    id: submissionId,
    siteKey,
    projectId: binding.project_id,
    ownerUserId: binding.owner_user_id,
    accountId: binding.account_id,
    accountKey: ACCOUNT_KEY,
    sourceApp: SOURCE_APP,
    submission: submissionData || {},
    meta,
    createdAt,
  };

  await env.CONTACT_ARCHIVE_BUCKET.put(key, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return key;
}

async function insertSubmission(env, binding, siteKey, submissionId, submissionData, meta, r2ObjectKey, createdAt) {
  const sql = `
    INSERT INTO shpitto_contact_submissions (
      id, project_id, account_id, owner_user_id, source_app, site_key, submission_json,
      visitor_ip, user_agent, origin, referer, r2_object_key, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  await env.CONTACT_DB.prepare(sql)
    .bind(
      submissionId,
      binding.project_id,
      binding.account_id,
      binding.owner_user_id,
      SOURCE_APP,
      siteKey,
      JSON.stringify(submissionData || {}),
      meta.ip || null,
      meta.user_agent || null,
      meta.origin || null,
      meta.referer || null,
      r2ObjectKey,
      createdAt,
    )
    .run();
}

async function handleContact(request, env) {
  await ensureSchema(env);
  const payload = await parseIncomingPayload(request);
  if (!payload.siteKey) {
    return json({ ok: false, error: "Missing site_key." }, 400);
  }

  const binding = await resolveSiteBinding(env, payload.siteKey);
  if (!binding) {
    return json({ ok: false, error: "Invalid site key." }, 400);
  }

  const submissionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const meta = {
    ip: extractClientIp(request),
    user_agent: request.headers.get("user-agent") || "",
    origin: request.headers.get("origin") || "",
    referer: request.headers.get("referer") || "",
  };

  const r2ObjectKey = await archiveToR2(
    env,
    binding,
    payload.siteKey,
    submissionId,
    payload.data,
    meta,
    createdAt,
  );

  await insertSubmission(
    env,
    binding,
    payload.siteKey,
    submissionId,
    payload.data,
    meta,
    r2ObjectKey,
    createdAt,
  );

  if (payload.shouldRedirect) {
    const redirectUrl = buildRedirectTarget(request, env);
    if (redirectUrl) return Response.redirect(redirectUrl, 303);
  }

  return json({
    ok: true,
    submissionId,
    projectId: binding.project_id,
    ownerUserId: binding.owner_user_id,
  });
}

async function handleHealth(env) {
  await ensureSchema(env);
  let d1Ok = false;
  try {
    const r = await env.CONTACT_DB.prepare("SELECT 1 AS ok;").first();
    d1Ok = Boolean(r?.ok);
  } catch {
    d1Ok = false;
  }

  return json({
    ok: true,
    service: "shpitto-contact-worker",
    d1: d1Ok,
    r2: Boolean(env.CONTACT_ARCHIVE_BUCKET),
    sourceApp: SOURCE_APP,
    accountKey: ACCOUNT_KEY,
    now: new Date().toISOString(),
  });
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
        return handleHealth(env);
      }

      if (request.method === "POST" && url.pathname === "/api/contact") {
        const response = await handleContact(request, env);
        const headers = new Headers(response.headers);
        for (const [key, value] of Object.entries(corsHeaders)) {
          headers.set(key, value);
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return json({ ok: false, error: "Not found." }, 404, corsHeaders);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected worker error.";
      return json({ ok: false, error: message }, 500, corsHeaders);
    }
  },
};
