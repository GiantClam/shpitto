import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { buildAppUrl } from "../app-url.ts";
import { createSupabaseAdminClient, getSupabaseAdminConfig } from "../supabase/admin.ts";
import { safeAuthNextPath } from "./next-path.ts";
import { safeAuthTheme, serializeAuthTheme } from "./theme.ts";

const CLOUDFLARE_EMAIL_API_BASE = "https://api.cloudflare.com/client/v4/accounts";
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const MAX_ADMIN_USER_SCAN_PAGES = 10;

const AUTH_USERS_TABLE = "shpitto_auth_users";
const EMAIL_VERIFICATION_TOKENS_TABLE = "shpitto_email_verification_tokens";
const PASSWORD_RESET_TOKENS_TABLE = "shpitto_password_reset_tokens";

type AuthUserRecord = {
  userId: string;
  email: string;
  emailVerified: boolean;
};

export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function getCloudflareEmailConfig() {
  const accountId =
    process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim() ||
    process.env.EMAIL_PROVIDER_ACCOUNT_ID?.trim() ||
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken =
    process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim() ||
    process.env.EMAIL_PROVIDER_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim();
  const from = process.env.CLOUDFLARE_EMAIL_FROM?.trim() || process.env.EMAIL_FROM?.trim();

  if (!accountId || !apiToken || !from) return null;
  return { accountId, apiToken, from };
}

export function getAuthEmailRuntimeConfig() {
  const supabase = getSupabaseAdminConfig();
  const cloudflareEmail = getCloudflareEmailConfig();

  if (!supabase || !cloudflareEmail) return null;
  return { supabase, cloudflareEmail };
}

function createAdminOrThrow() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) throw new Error("supabase_admin_not_configured");
  return supabase;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}

function buildActionUrl(path: string, token: string, request: NextRequest, extraParams?: Record<string, string | undefined>) {
  const url = new URL(buildAppUrl(path, request));
  url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(extraParams || {})) {
    const safeValue = key === "next" ? safeAuthNextPath(value, "") : String(value || "").trim();
    if (safeValue) url.searchParams.set(key, safeValue);
  }
  return url.toString();
}

function buildVerificationEmailContent(verificationUrl: string) {
  const safeUrl = escapeHtml(verificationUrl);
  const subject = "Verify your Shpitto email";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#15211d;">
      <h1 style="margin:0 0 16px;font-size:22px;">Verify your Shpitto email</h1>
      <p style="margin:0 0 12px;">Open the link below to finish creating your Shpitto account.</p>
      <p style="margin:24px 0;">
        <a href="${safeUrl}" style="display:inline-block;background:#1e6f5c;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;">Verify email</a>
      </p>
      <p style="margin:0;color:#66736e;">This link expires in 24 hours. If you did not create a Shpitto account, you can ignore this email.</p>
    </div>
  `;
  const text = [
    "Verify your Shpitto email",
    "",
    "Open this link to finish creating your Shpitto account:",
    verificationUrl,
    "",
    "This link expires in 24 hours. If you did not create a Shpitto account, you can ignore this email.",
  ].join("\n");

  return { subject, html, text };
}

function buildPasswordResetEmailContent(resetUrl: string) {
  const safeUrl = escapeHtml(resetUrl);
  const subject = "Reset your Shpitto password";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#15211d;">
      <h1 style="margin:0 0 16px;font-size:22px;">Reset your Shpitto password</h1>
      <p style="margin:0 0 12px;">Use the link below to set a new password for your account.</p>
      <p style="margin:24px 0;">
        <a href="${safeUrl}" style="display:inline-block;background:#1e6f5c;color:#ffffff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:700;">Reset password</a>
      </p>
      <p style="margin:0;color:#66736e;">This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>
    </div>
  `;
  const text = [
    "Reset your Shpitto password",
    "",
    "Use this link to set a new password:",
    resetUrl,
    "",
    "This link expires in 30 minutes. If you did not request it, you can ignore this email.",
  ].join("\n");

  return { subject, html, text };
}

async function sendCloudflareEmail(options: { to: string; subject: string; html: string; text: string }) {
  const config = getCloudflareEmailConfig();
  if (!config) throw new Error("cloudflare_email_service_not_configured");

  const response = await fetch(`${CLOUDFLARE_EMAIL_API_BASE}/${config.accountId}/email/sending/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: options.to,
      from: config.from,
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    const detail = body?.errors?.[0]?.message || body?.error || `status_${response.status}`;
    throw new Error(`cloudflare_email_send_failed:${detail}`);
  }

  return body;
}

export async function syncAuthUser(record: AuthUserRecord) {
  const supabase = createAdminOrThrow();
  const now = new Date().toISOString();
  const { error } = await supabase.from(AUTH_USERS_TABLE).upsert(
    {
      user_id: record.userId,
      email: normalizeAuthEmail(record.email),
      email_verified: record.emailVerified,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) throw error;
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const normalizedEmail = normalizeAuthEmail(email);
  const supabase = createAdminOrThrow();

  const { data: existing, error: profileError } = await supabase
    .from(AUTH_USERS_TABLE)
    .select("user_id,email,email_verified")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (profileError) throw profileError;
  if (existing) {
    return {
      userId: existing.user_id,
      email: existing.email,
      emailVerified: Boolean(existing.email_verified),
    };
  }

  for (let page = 1; page <= MAX_ADMIN_USER_SCAN_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const user = data.users.find((candidate) => normalizeAuthEmail(candidate.email || "") === normalizedEmail);
    if (user?.email) {
      const authUser = {
        userId: user.id,
        email: normalizeAuthEmail(user.email),
        emailVerified: Boolean(user.email_confirmed_at),
      };
      await syncAuthUser(authUser);
      return authUser;
    }

    if (data.users.length < 100) break;
  }

  return null;
}

export async function createAuthUserWithVerification(params: {
  email: string;
  password: string;
  request: NextRequest;
  theme?: string;
  projectId?: string;
  siteKey?: string;
}) {
  const email = normalizeAuthEmail(params.email);
  const supabase = createAdminOrThrow();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: false,
  });

  if (error || !data.user?.id) throw error || new Error("supabase_user_create_failed");

  await syncAuthUser({
    userId: data.user.id,
    email,
    emailVerified: false,
  });

  try {
    await sendEmailVerification({
      userId: data.user.id,
      email,
      request: params.request,
      theme: params.theme,
      projectId: params.projectId,
      siteKey: params.siteKey,
    });
  } catch (error) {
    await supabase.from(EMAIL_VERIFICATION_TOKENS_TABLE).delete().eq("user_id", data.user.id);
    await supabase.from(AUTH_USERS_TABLE).delete().eq("user_id", data.user.id);
    await supabase.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw error;
  }

  return { userId: data.user.id, email };
}

export async function issueEmailVerificationToken(userId: string, email: string) {
  const supabase = createAdminOrThrow();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString();

  await supabase.from(EMAIL_VERIFICATION_TOKENS_TABLE).delete().eq("user_id", userId);
  const { error } = await supabase.from(EMAIL_VERIFICATION_TOKENS_TABLE).insert({
    user_id: userId,
    email: normalizeAuthEmail(email),
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_at: now,
    updated_at: now,
  });

  if (error) throw error;
  return { token, expiresAt };
}

export async function sendEmailVerification(params: {
  userId: string;
  email: string;
  request: NextRequest;
  theme?: string;
  projectId?: string;
  siteKey?: string;
}) {
  const { token } = await issueEmailVerificationToken(params.userId, params.email);
  const verificationUrl = buildActionUrl("/verify-email", token, params.request, {
    theme: serializeAuthTheme(safeAuthTheme(params.theme)),
    projectId: params.projectId,
    siteKey: params.siteKey,
  });
  const content = buildVerificationEmailContent(verificationUrl);

  await sendCloudflareEmail({
    to: normalizeAuthEmail(params.email),
    ...content,
  });

  return { verificationUrl };
}

export async function consumeEmailVerificationToken(token: string) {
  const supabase = createAdminOrThrow();
  const tokenHash = hashToken(token);
  const now = new Date();

  const { data: record, error } = await supabase
    .from(EMAIL_VERIFICATION_TOKENS_TABLE)
    .select("id,user_id,email,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!record) return null;

  if (!record.expires_at || new Date(record.expires_at).getTime() <= now.getTime()) {
    await supabase.from(EMAIL_VERIFICATION_TOKENS_TABLE).delete().eq("id", record.id);
    return null;
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(record.user_id, {
    email_confirm: true,
  });
  if (updateError) throw updateError;

  const timestamp = now.toISOString();
  await supabase
    .from(AUTH_USERS_TABLE)
    .upsert(
      { user_id: record.user_id, email: normalizeAuthEmail(record.email), email_verified: true, updated_at: timestamp },
      { onConflict: "user_id" },
    );
  await supabase
    .from(EMAIL_VERIFICATION_TOKENS_TABLE)
    .update({ used_at: timestamp, updated_at: timestamp })
    .eq("id", record.id);
  await supabase.from(EMAIL_VERIFICATION_TOKENS_TABLE).delete().eq("user_id", record.user_id);

  return { userId: record.user_id, email: normalizeAuthEmail(record.email) };
}

export async function sendPasswordReset(params: {
  userId: string;
  email: string;
  request: NextRequest;
  requestedIp: string;
  userAgent: string;
  nextPath?: string;
  theme?: string;
  projectId?: string;
  siteKey?: string;
}) {
  const supabase = createAdminOrThrow();
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

  await supabase.from(PASSWORD_RESET_TOKENS_TABLE).delete().eq("user_id", params.userId);
  const { error } = await supabase.from(PASSWORD_RESET_TOKENS_TABLE).insert({
    user_id: params.userId,
    email: normalizeAuthEmail(params.email),
    token_hash: tokenHash,
    expires_at: expiresAt,
    requested_ip: params.requestedIp,
    user_agent: params.userAgent,
    created_at: now,
    updated_at: now,
  });

  if (error) throw error;

  const resetUrl = buildActionUrl("/reset-password", token, params.request, {
    next: params.nextPath,
    theme: serializeAuthTheme(safeAuthTheme(params.theme)),
    projectId: params.projectId,
    siteKey: params.siteKey,
  });
  const content = buildPasswordResetEmailContent(resetUrl);
  try {
    await sendCloudflareEmail({
      to: normalizeAuthEmail(params.email),
      ...content,
    });
  } catch (error) {
    await supabase.from(PASSWORD_RESET_TOKENS_TABLE).delete().eq("user_id", params.userId);
    throw error;
  }

  return { resetUrl, expiresAt };
}

export async function resetPasswordWithToken(token: string, password: string) {
  const supabase = createAdminOrThrow();
  const tokenHash = hashToken(token);
  const now = new Date();

  const { data: record, error } = await supabase
    .from(PASSWORD_RESET_TOKENS_TABLE)
    .select("id,user_id,email,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!record) return null;

  if (!record.expires_at || new Date(record.expires_at).getTime() <= now.getTime()) {
    await supabase.from(PASSWORD_RESET_TOKENS_TABLE).delete().eq("id", record.id);
    return null;
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(record.user_id, {
    password,
    email_confirm: true,
  });
  if (updateError) throw updateError;

  const timestamp = now.toISOString();
  await supabase
    .from(PASSWORD_RESET_TOKENS_TABLE)
    .update({ used_at: timestamp, updated_at: timestamp })
    .eq("id", record.id);
  await supabase.from(PASSWORD_RESET_TOKENS_TABLE).delete().eq("user_id", record.user_id);
  await supabase
    .from(AUTH_USERS_TABLE)
    .upsert(
      { user_id: record.user_id, email: normalizeAuthEmail(record.email), email_verified: true, updated_at: timestamp },
      { onConflict: "user_id" },
    );

  return { userId: record.user_id, email: normalizeAuthEmail(record.email) };
}
