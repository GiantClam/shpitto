const SOURCE_APP = "shpitto";
const EMAIL_API_BASE = "https://api.cloudflare.com/client/v4/accounts";

type Env = {
  EMAIL_QUEUE_DB: D1Database;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_EMAIL_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_EMAIL_API_TOKEN?: string;
  CLOUDFLARE_EMAIL_FROM?: string;
  SHPITTO_CONTACT_EMAIL_MAX_RETRIES?: string;
  CONTACT_EMAIL_BATCH_SIZE?: string;
  CONTACT_EMAIL_HEALTH_TOKEN?: string;
};

type ContactEmailJobRow = {
  id: string;
  project_id: string;
  account_id: string;
  owner_user_id: string;
  submission_id: string | null;
  site_key: string | null;
  kind: string;
  to_email: string;
  subject: string;
  payload_json: string;
  status: string;
  retry_count: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type ContactEmailPayload = {
  html: string;
  text: string;
  replyTo?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function parseIntEnv(raw: string | undefined, fallback: number, min = 1, max = 100) {
  const value = Number(raw || "");
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function getMaxRetries(env: Env) {
  return parseIntEnv(env.SHPITTO_CONTACT_EMAIL_MAX_RETRIES, 3, 1, 10);
}

function getBatchSize(env: Env) {
  return parseIntEnv(env.CONTACT_EMAIL_BATCH_SIZE, 10, 1, 50);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getEmailConfig(env: Env) {
  const accountId = String(env.CLOUDFLARE_EMAIL_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(env.CLOUDFLARE_EMAIL_API_TOKEN || env.CLOUDFLARE_API_TOKEN || "").trim();
  const from = String(env.CLOUDFLARE_EMAIL_FROM || "").trim();
  if (!accountId || !apiToken || !from) return null;
  return { accountId, apiToken, from };
}

function getChangeCount(result: unknown) {
  const meta = (result as { meta?: { changes?: number; rows_written?: number } } | null)?.meta;
  return Number(meta?.changes || meta?.rows_written || 0);
}

function isMissingQueueTableError(error: unknown) {
  const message = String((error as Error)?.message || error || "");
  return /no such table:\s*shpitto_outbound_emails/i.test(message);
}

async function loadQueueStats(env: Env) {
  const counts: Record<string, number> = {};
  try {
    for (const status of ["queued", "sending", "sent", "failed", "dead"]) {
      const row = await env.EMAIL_QUEUE_DB.prepare(
        `
        SELECT COUNT(*) AS count
        FROM shpitto_outbound_emails
        WHERE source_app = ?
          AND status = ?
        `,
      )
        .bind(SOURCE_APP, status)
        .first<{ count: number }>();
      counts[status] = Number(row?.count || 0);
    }
  } catch (error) {
    if (!isMissingQueueTableError(error)) throw error;
    for (const status of ["queued", "sending", "sent", "failed", "dead"]) {
      counts[status] = 0;
    }
  }
  return counts;
}

async function selectNextJob(env: Env) {
  try {
    return await env.EMAIL_QUEUE_DB.prepare(
      `
      SELECT
        id,
        project_id,
        account_id,
        owner_user_id,
        submission_id,
        site_key,
        kind,
        to_email,
        subject,
        payload_json,
        status,
        retry_count,
        last_error,
        sent_at,
        created_at,
        updated_at
      FROM shpitto_outbound_emails
      WHERE source_app = ?
        AND status IN ('queued', 'failed')
        AND retry_count < ?
      ORDER BY created_at ASC
      LIMIT 1
      `,
    )
      .bind(SOURCE_APP, getMaxRetries(env))
      .first<ContactEmailJobRow>();
  } catch (error) {
    if (isMissingQueueTableError(error)) return null;
    throw error;
  }
}

async function claimNextJob(env: Env): Promise<ContactEmailJobRow | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await selectNextJob(env);
    if (!row?.id) return null;

    const result = await env.EMAIL_QUEUE_DB.prepare(
      `
      UPDATE shpitto_outbound_emails
      SET status = 'sending',
          updated_at = ?
      WHERE id = ?
        AND status IN ('queued', 'failed')
        AND retry_count = ?
      `,
    )
      .bind(nowIso(), row.id, Number(row.retry_count || 0))
      .run();

    if (getChangeCount(result) > 0) return row;
  }

  return null;
}

async function markJobSent(env: Env, jobId: string) {
  const now = nowIso();
  await env.EMAIL_QUEUE_DB.prepare(
    `
    UPDATE shpitto_outbound_emails
    SET status = 'sent',
        sent_at = ?,
        updated_at = ?,
        last_error = NULL
    WHERE id = ?
    `,
  )
    .bind(now, now, jobId)
    .run();
}

async function markJobFailed(env: Env, jobId: string, error: unknown) {
  const current = await env.EMAIL_QUEUE_DB.prepare(
    "SELECT retry_count FROM shpitto_outbound_emails WHERE id = ? LIMIT 1",
  )
    .bind(jobId)
    .first<{ retry_count: number }>();

  const nextRetryCount = Math.max(0, Number(current?.retry_count || 0)) + 1;
  const nextStatus = nextRetryCount >= getMaxRetries(env) ? "dead" : "failed";
  const message = String(error instanceof Error ? error.message : error || "email_send_failed").slice(0, 1000);

  await env.EMAIL_QUEUE_DB.prepare(
    `
    UPDATE shpitto_outbound_emails
    SET status = ?,
        retry_count = ?,
        last_error = ?,
        updated_at = ?
    WHERE id = ?
    `,
  )
    .bind(nextStatus, nextRetryCount, message, nowIso(), jobId)
    .run();
}

async function sendCloudflareEmail(env: Env, job: ContactEmailJobRow) {
  const config = getEmailConfig(env);
  if (!config) throw new Error("cloudflare_email_service_not_configured");

  let payload: ContactEmailPayload;
  try {
    payload = JSON.parse(String(job.payload_json || "{}")) as ContactEmailPayload;
  } catch {
    throw new Error("contact_email_payload_invalid_json");
  }

  const response = await fetch(`${EMAIL_API_BASE}/${config.accountId}/email/sending/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: normalizeEmail(job.to_email),
      from: config.from,
      reply_to: payload.replyTo ? normalizeEmail(payload.replyTo) : undefined,
      subject: String(job.subject || "").trim(),
      html: String(payload.html || "").trim(),
      text: String(payload.text || "").trim(),
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || (body as { success?: boolean } | null)?.success === false) {
    const detail =
      (body as { errors?: Array<{ message?: string }>; error?: string } | null)?.errors?.[0]?.message ||
      (body as { errors?: Array<{ message?: string }>; error?: string } | null)?.error ||
      `status_${response.status}`;
    throw new Error(`cloudflare_email_send_failed:${detail}`);
  }
}

async function processOneJob(env: Env) {
  const job = await claimNextJob(env);
  if (!job) return false;

  try {
    await sendCloudflareEmail(env, job);
    await markJobSent(env, job.id);
    console.log(`[contact-email-worker] sent ${job.kind} to ${job.to_email}`);
  } catch (error) {
    await markJobFailed(env, job.id, error);
    console.error(
      `[contact-email-worker] failed ${job.kind} to ${job.to_email}: ${String((error as Error)?.message || error || "unknown error")}`,
    );
  }

  return true;
}

async function processBatch(env: Env, limit = getBatchSize(env)) {
  let processed = 0;
  try {
    for (let index = 0; index < limit; index += 1) {
      const handled = await processOneJob(env);
      if (!handled) break;
      processed += 1;
    }
  } catch (error) {
    if (!isMissingQueueTableError(error)) throw error;
  }
  return processed;
}

function isAuthorized(request: Request, env: Env) {
  const token = String(env.CONTACT_EMAIL_HEALTH_TOKEN || "").trim();
  if (!token) return true;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${token}`;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return json({
        ok: true,
        service: "contact-email-worker",
        batchSize: getBatchSize(env),
        maxRetries: getMaxRetries(env),
        emailConfigured: Boolean(getEmailConfig(env)),
        time: nowIso(),
      });
    }

    if (url.pathname === "/stats" && request.method === "GET") {
      if (!isAuthorized(request, env)) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      try {
        return json({
          ok: true,
          service: "contact-email-worker",
          batchSize: getBatchSize(env),
          maxRetries: getMaxRetries(env),
          counts: await loadQueueStats(env),
          time: nowIso(),
        });
      } catch (error) {
        if (isMissingQueueTableError(error)) {
          return json({
            ok: true,
            service: "contact-email-worker",
            batchSize: getBatchSize(env),
            maxRetries: getMaxRetries(env),
            counts: {
              queued: 0,
              sending: 0,
              sent: 0,
              failed: 0,
              dead: 0,
            },
            time: nowIso(),
          });
        }
        return json(
          {
            ok: false,
            error: String((error as Error)?.message || error || "stats_failed"),
            service: "contact-email-worker",
            time: nowIso(),
          },
          500,
        );
      }
    }

    if (url.pathname === "/drain" && request.method === "POST") {
      if (!isAuthorized(request, env)) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      const processed = await processBatch(env);
      return json({ ok: true, processed });
    }

    return json({ ok: false, error: "not_found" }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(processBatch(env));
  },
};
