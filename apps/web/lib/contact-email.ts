import { randomUUID } from "node:crypto";
import { getD1Client } from "./d1";
import { normalizeAuthEmail, sendCloudflareEmail } from "./auth/cloudflare-email-auth";
import { getProjectContactSettingsState } from "./project-settings";

const SOURCE_APP = "shpitto";
const MAX_EMAIL_RETRY_COUNT = Math.max(1, Number(process.env.SHPITTO_CONTACT_EMAIL_MAX_RETRIES || 3));

export type ContactEmailQueueParams = {
  projectId: string;
  accountId: string;
  ownerUserId: string;
  siteKey: string;
  submissionId: string;
  submissionData: Record<string, unknown>;
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickRecordValue(record: Record<string, unknown>, keys: string[]): string {
  const lowered = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) lowered.set(key.toLowerCase(), value);
  for (const key of keys) {
    const direct = normalizeText(record[key]);
    if (direct) return direct;
    const loweredValue = normalizeText(lowered.get(key.toLowerCase()));
    if (loweredValue) return loweredValue;
  }
  return "";
}

function extractContactEmail(submissionData: Record<string, unknown>) {
  const email = pickRecordValue(submissionData, ["email", "mail", "contactEmail", "contact_email"]);
  return email ? normalizeAuthEmail(email) : "";
}

function extractContactName(submissionData: Record<string, unknown>) {
  const firstName = pickRecordValue(submissionData, ["firstName", "firstname", "first_name", "givenName"]);
  const lastName = pickRecordValue(submissionData, ["lastName", "lastname", "last_name", "familyName"]);
  return (
    pickRecordValue(submissionData, ["name", "fullName", "contactName", "customerName"]) ||
    normalizeText(`${firstName} ${lastName}`) ||
    "there"
  );
}

function extractContactMessage(submissionData: Record<string, unknown>) {
  return pickRecordValue(submissionData, ["message", "content", "details", "description", "requirements"]);
}

function envBool(name: string, fallback: boolean) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function envEmailList(name: string) {
  return String(process.env[name] || "")
    .split(/[\n,;]+/g)
    .map((item) => normalizeText(item).toLowerCase())
    .filter(Boolean);
}

function buildUserAckEmail(params: {
  brandName: string;
  recipientName: string;
  submissionId: string;
}) {
  const safeBrand = escapeHtml(params.brandName);
  const safeName = escapeHtml(params.recipientName);
  const safeSubmissionId = escapeHtml(params.submissionId);
  const subject = `${params.brandName} received your inquiry`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#15211d;">
      <h1 style="margin:0 0 16px;font-size:22px;">We received your inquiry</h1>
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 12px;">${safeBrand} has received your inquiry. Our team will review it and follow up soon.</p>
      <p style="margin:0 0 12px;"><strong>Reference ID:</strong> ${safeSubmissionId}</p>
    </div>
  `;
  const text = [
    "We received your inquiry",
    "",
    `Hi ${params.recipientName},`,
    `${params.brandName} has received your inquiry. Our team will review it and follow up soon.`,
    `Reference ID: ${params.submissionId}`,
  ].join("\n");
  return { subject, html, text };
}

function buildForwardEmail(params: {
  brandName: string;
  submissionId: string;
  siteKey: string;
  submissionData: Record<string, unknown>;
}) {
  const customerName = extractContactName(params.submissionData);
  const customerEmail = extractContactEmail(params.submissionData);
  const message = extractContactMessage(params.submissionData) || "No message provided.";
  const subject = `[${params.brandName}] New inquiry - ${customerName}`;
  const safeMessage = escapeHtml(message);
  const details = Object.entries(toRecord(params.submissionData))
    .map(([key, value]) => `${key}: ${normalizeText(value)}`)
    .filter((line) => line.trim())
    .join("\n");
  const safeDetails = escapeHtml(details || "(empty)");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#15211d;">
      <h1 style="margin:0 0 16px;font-size:22px;">New inquiry received</h1>
      <p style="margin:0 0 12px;"><strong>Submission ID:</strong> ${escapeHtml(params.submissionId)}</p>
      <p style="margin:0 0 12px;"><strong>Site Key:</strong> ${escapeHtml(params.siteKey)}</p>
      <p style="margin:0 0 12px;"><strong>Name:</strong> ${escapeHtml(customerName)}</p>
      <p style="margin:0 0 12px;"><strong>Email:</strong> ${escapeHtml(customerEmail || "-")}</p>
      <p style="margin:0 0 12px;"><strong>Message:</strong></p>
      <pre style="white-space:pre-wrap;background:#f5f7f6;border-radius:12px;padding:12px;">${safeMessage}</pre>
      <p style="margin:16px 0 12px;"><strong>Submission data:</strong></p>
      <pre style="white-space:pre-wrap;background:#f5f7f6;border-radius:12px;padding:12px;">${safeDetails}</pre>
    </div>
  `;
  const text = [
    "New inquiry received",
    "",
    `Submission ID: ${params.submissionId}`,
    `Site Key: ${params.siteKey}`,
    `Name: ${customerName}`,
    `Email: ${customerEmail || "-"}`,
    "",
    "Message:",
    message,
    "",
    "Submission data:",
    details || "(empty)",
  ].join("\n");
  return { subject, html, text, replyTo: customerEmail || undefined };
}

async function ensureEmailSchemaReady() {
  const d1 = getD1Client();
  await d1.ensureShpittoSchema();
  return d1;
}

export async function queueContactEmailJobs(params: ContactEmailQueueParams) {
  const d1 = await ensureEmailSchemaReady();
  if (!d1.isConfigured()) return [];

  const settingsState = await getProjectContactSettingsState(params.projectId, params.ownerUserId);
  const configuredForwardTo = settingsState?.settings.forwardTo || [];
  const shouldUseEnvForwardTo = !settingsState?.hasStoredForwardTo;
  const forwardTo = (configuredForwardTo.length > 0 ? configuredForwardTo : shouldUseEnvForwardTo ? envEmailList("SHPITTO_CONTACT_FORWARD_TO") : [])
    .map((value) => normalizeAuthEmail(value))
    .filter(Boolean);

  const sendUserAck =
    settingsState?.hasStoredSendUserAck
      ? Boolean(settingsState.settings.sendUserAck)
      : envBool("SHPITTO_CONTACT_ACK_ENABLED", true);
  const brandName = settingsState?.settings.brandName || "Shpitto";
  const recipientName = extractContactName(params.submissionData);
  const recipientEmail = extractContactEmail(params.submissionData);
  const createdAt = nowIso();

  const jobs: Array<{
    kind: string;
    toEmail: string;
    subject: string;
    payload: ContactEmailPayload;
  }> = [];

  if (sendUserAck && recipientEmail) {
    const content = buildUserAckEmail({
      brandName,
      recipientName,
      submissionId: params.submissionId,
    });
    jobs.push({
      kind: "contact_user_ack",
      toEmail: recipientEmail,
      subject: content.subject,
      payload: { html: content.html, text: content.text },
    });
  }

  for (const toEmail of forwardTo) {
    const content = buildForwardEmail({
      brandName,
      submissionId: params.submissionId,
      siteKey: params.siteKey,
      submissionData: params.submissionData,
    });
    jobs.push({
      kind: "contact_owner_forward",
      toEmail,
      subject: content.subject,
      payload: { html: content.html, text: content.text, replyTo: content.replyTo },
    });
  }

  for (const job of jobs) {
    await d1.execute(
      `
      INSERT INTO shpitto_outbound_emails (
        id, project_id, account_id, owner_user_id, source_app, submission_id, site_key, kind,
        to_email, subject, payload_json, status, retry_count, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?);
      `,
      [
        randomUUID(),
        params.projectId,
        params.accountId,
        params.ownerUserId,
        SOURCE_APP,
        params.submissionId,
        params.siteKey,
        job.kind,
        job.toEmail,
        job.subject,
        JSON.stringify(job.payload),
        createdAt,
        createdAt,
      ],
    );
  }

  return jobs;
}

export async function claimNextOutboundEmailJob(): Promise<ContactEmailJobRow | null> {
  const d1 = await ensureEmailSchemaReady();
  if (!d1.isConfigured()) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await d1.queryOne<ContactEmailJobRow>(
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
      LIMIT 1;
      `,
      [SOURCE_APP, MAX_EMAIL_RETRY_COUNT],
    );

    if (!row?.id) return null;

    const claimResult = await d1.execute(
      `
      UPDATE shpitto_outbound_emails
      SET status = 'sending',
          updated_at = ?
      WHERE id = ?
        AND status IN ('queued', 'failed')
        AND retry_count = ?;
      `,
      [nowIso(), row.id, Number(row.retry_count || 0)],
    );

    const claimed = Number((claimResult as { meta?: { changes?: number; rows_written?: number } })?.meta?.changes || 0) > 0
      || Number((claimResult as { meta?: { changes?: number; rows_written?: number } })?.meta?.rows_written || 0) > 0;
    if (claimed) return row;
  }

  return null;
}

export async function markOutboundEmailJobSent(jobId: string) {
  const d1 = await ensureEmailSchemaReady();
  if (!d1.isConfigured()) return;
  const now = nowIso();
  await d1.execute(
    `
    UPDATE shpitto_outbound_emails
    SET status = 'sent',
        sent_at = ?,
        updated_at = ?,
        last_error = NULL
    WHERE id = ?;
    `,
    [now, now, jobId],
  );
}

export async function markOutboundEmailJobFailed(jobId: string, error: unknown) {
  const d1 = await ensureEmailSchemaReady();
  if (!d1.isConfigured()) return;
  const row = await d1.queryOne<{ retry_count: number }>(
    "SELECT retry_count FROM shpitto_outbound_emails WHERE id = ? LIMIT 1;",
    [jobId],
  );
  const nextRetryCount = Math.max(0, Number(row?.retry_count || 0)) + 1;
  const nextStatus = nextRetryCount >= MAX_EMAIL_RETRY_COUNT ? "dead" : "failed";
  const message = String(error instanceof Error ? error.message : error || "email_send_failed").slice(0, 1000);
  await d1.execute(
    `
    UPDATE shpitto_outbound_emails
    SET status = ?,
        retry_count = ?,
        last_error = ?,
        updated_at = ?
    WHERE id = ?;
    `,
    [nextStatus, nextRetryCount, message, nowIso(), jobId],
  );
}

export async function deliverOutboundEmailJob(job: ContactEmailJobRow) {
  const payload = JSON.parse(String(job.payload_json || "{}")) as ContactEmailPayload;
  await sendCloudflareEmail({
    to: normalizeAuthEmail(job.to_email),
    subject: String(job.subject || "").trim(),
    html: String(payload.html || "").trim(),
    text: String(payload.text || "").trim(),
    replyTo: payload.replyTo ? normalizeAuthEmail(payload.replyTo) : undefined,
  });
}
