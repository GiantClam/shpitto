import {eq, sql} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {securitySettings} from '../../db/schema/security.ts';
import {getServerEnv} from '../../config/env.ts';
import {decryptSecret, encryptSecret} from '../../security/secrets.ts';
import type {TransactionDatabase} from '../shared/transaction.ts';

const SETTINGS_ID = 'default';

export type SecuritySettingsInput = Readonly<{
  expectedVersion: number;
  emailVerificationEnabled: boolean;
  twoFactorRequired: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string;
  turnstileSecretKey?: string;
  clearTurnstileSecret?: boolean;
  smtpEnabled: boolean;
  smtpUrl?: string;
  clearSmtpUrl?: boolean;
  smtpFromEmail?: string;
  smtpFromName?: string;
}>;

export type PublicSecuritySettings = Readonly<{
  emailVerificationEnabled: boolean;
  twoFactorRequired: boolean;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
  turnstileConfigured: boolean;
  smtpEnabled: boolean;
  smtpConfigured: boolean;
  emailDeliveryAvailable: boolean;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  version: number;
}>;

export type RuntimeSecuritySettings = PublicSecuritySettings & Readonly<{
  turnstileSecretKey: string | null;
  smtpUrl: string | null;
}>;

export type SecurityPolicy = Readonly<Pick<PublicSecuritySettings, 'emailVerificationEnabled' | 'twoFactorRequired' | 'turnstileEnabled'>>;
export type PublicAuthSecuritySettings = Readonly<Pick<PublicSecuritySettings, 'emailVerificationEnabled' | 'emailDeliveryAvailable' | 'turnstileEnabled' | 'turnstileSiteKey'>>;

type SecurityDatabase = AppDatabase | TransactionDatabase;

const DEFAULTS = Object.freeze({
  emailVerificationEnabled: false,
  twoFactorRequired: false,
  turnstileEnabled: false,
  turnstileSiteKey: '',
  smtpEnabled: false,
  smtpFromEmail: '',
  smtpFromName: 'Shpitto',
});

function text(value: unknown, field: string, max = 512): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new DomainError('VALIDATION', `${field} is invalid.`);
  return value.trim();
}

function optionalText(value: unknown, field: string, max = 2048): string | undefined {
  return value === undefined ? undefined : text(value, field, max);
}

function optionalBoolean(value: unknown, field: string): boolean {
  return value === undefined ? false : boolean(value, field);
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new DomainError('VALIDATION', `${field} must be boolean.`);
  return value;
}

function url(value: string, field: string): string {
  try {
    const parsed = new URL(value);
    if (!['smtp:', 'smtps:'].includes(parsed.protocol) || !parsed.hostname || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname) || parsed.username && !parsed.password) throw new Error();
    return parsed.toString();
  } catch {
    throw new DomainError('VALIDATION', `${field} must be a valid SMTP URL.`);
  }
}

function email(value: string): string {
  if (!value || value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new DomainError('VALIDATION', 'smtpFromEmail is invalid.');
  return value.toLowerCase();
}

function rowOrDefaults(row: typeof securitySettings.$inferSelect | undefined): RuntimeSecuritySettings {
  const env = getServerEnv();
  const decrypt = (ciphertext: string | null | undefined): string | null => {
    if (!ciphertext) return null;
    try { return decryptSecret(ciphertext, env.betterAuthSecret); } catch { return null; }
  };
  const turnstileSecretKey = decrypt(row?.turnstileSecretCiphertext);
  const smtpUrl = decrypt(row?.smtpUrlCiphertext);
  return {
    emailVerificationEnabled: row?.emailVerificationEnabled ?? DEFAULTS.emailVerificationEnabled,
    twoFactorRequired: row?.twoFactorRequired ?? DEFAULTS.twoFactorRequired,
    turnstileEnabled: row?.turnstileEnabled ?? DEFAULTS.turnstileEnabled,
    turnstileSiteKey: row?.turnstileSiteKey || null,
    turnstileConfigured: Boolean(turnstileSecretKey),
    smtpEnabled: row?.smtpEnabled ?? DEFAULTS.smtpEnabled,
    smtpConfigured: Boolean(smtpUrl),
    emailDeliveryAvailable: Boolean(smtpUrl && row?.smtpEnabled) || (env.nodeEnv !== 'production' && env.mailDriver === 'local'),
    smtpFromEmail: row?.smtpFromEmail || null,
    smtpFromName: row?.smtpFromName || null,
    version: row?.version ?? 1,
    turnstileSecretKey,
    smtpUrl,
  };
}

export async function readSecuritySettings(db: SecurityDatabase): Promise<RuntimeSecuritySettings> {
  const row = (await db.select().from(securitySettings).where(eq(securitySettings.id, SETTINGS_ID)).limit(1))[0];
  return rowOrDefaults(row);
}

export async function readSecurityPolicy(db: SecurityDatabase): Promise<SecurityPolicy> {
  const row = (await db.select({emailVerificationEnabled: securitySettings.emailVerificationEnabled, twoFactorRequired: securitySettings.twoFactorRequired, turnstileEnabled: securitySettings.turnstileEnabled}).from(securitySettings).where(eq(securitySettings.id, SETTINGS_ID)).limit(1))[0];
  return {
    emailVerificationEnabled: row?.emailVerificationEnabled ?? DEFAULTS.emailVerificationEnabled,
    twoFactorRequired: row?.twoFactorRequired ?? DEFAULTS.twoFactorRequired,
    turnstileEnabled: row?.turnstileEnabled ?? DEFAULTS.turnstileEnabled,
  };
}

export async function readPublicSecuritySettings(db: SecurityDatabase): Promise<PublicSecuritySettings> {
  const row = (await db.select({
    emailVerificationEnabled: securitySettings.emailVerificationEnabled,
    twoFactorRequired: securitySettings.twoFactorRequired,
    turnstileEnabled: securitySettings.turnstileEnabled,
    turnstileSiteKey: securitySettings.turnstileSiteKey,
    turnstileConfigured: sql<boolean>`${securitySettings.turnstileSecretCiphertext} is not null`,
    smtpEnabled: securitySettings.smtpEnabled,
    smtpConfigured: sql<boolean>`${securitySettings.smtpUrlCiphertext} is not null`,
    smtpFromEmail: securitySettings.smtpFromEmail,
    smtpFromName: securitySettings.smtpFromName,
    version: securitySettings.version,
  }).from(securitySettings).where(eq(securitySettings.id, SETTINGS_ID)).limit(1))[0];
  const env = getServerEnv();
  const smtpConfigured = row?.smtpConfigured ?? false;
  return {
    emailVerificationEnabled: row?.emailVerificationEnabled ?? DEFAULTS.emailVerificationEnabled,
    twoFactorRequired: row?.twoFactorRequired ?? DEFAULTS.twoFactorRequired,
    turnstileEnabled: row?.turnstileEnabled ?? DEFAULTS.turnstileEnabled,
    turnstileSiteKey: row?.turnstileSiteKey ?? null,
    turnstileConfigured: row?.turnstileConfigured ?? false,
    smtpEnabled: row?.smtpEnabled ?? DEFAULTS.smtpEnabled,
    smtpConfigured,
    emailDeliveryAvailable: Boolean(smtpConfigured && row?.smtpEnabled) || (env.nodeEnv !== 'production' && env.mailDriver === 'local'),
    smtpFromEmail: row?.smtpFromEmail ?? null,
    smtpFromName: row?.smtpFromName ?? null,
    version: row?.version ?? 1,
  };
}

export async function readPublicAuthSecuritySettings(db: SecurityDatabase): Promise<PublicAuthSecuritySettings> {
  const settings = await readPublicSecuritySettings(db);
  return {
    emailVerificationEnabled: settings.emailVerificationEnabled,
    emailDeliveryAvailable: settings.emailDeliveryAvailable,
    turnstileEnabled: settings.turnstileEnabled,
    turnstileSiteKey: settings.turnstileSiteKey,
  };
}

export function publicSecuritySettings(settings: RuntimeSecuritySettings): PublicSecuritySettings {
  const {turnstileSecretKey: _turnstileSecretKey, smtpUrl: _smtpUrl, ...publicSettings} = settings;
  return publicSettings;
}

export async function updateSecuritySettings(db: SecurityDatabase, input: SecuritySettingsInput): Promise<PublicSecuritySettings> {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new DomainError('VALIDATION', 'expectedVersion must be a positive integer.');
  const turnstileSecretInput = optionalText(input.turnstileSecretKey, 'turnstileSecretKey');
  const smtpUrlInput = optionalText(input.smtpUrl, 'smtpUrl');
  const clearTurnstileSecret = optionalBoolean(input.clearTurnstileSecret, 'clearTurnstileSecret');
  const clearSmtpUrl = optionalBoolean(input.clearSmtpUrl, 'clearSmtpUrl');
  const normalized = {
    emailVerificationEnabled: boolean(input.emailVerificationEnabled, 'emailVerificationEnabled'),
    twoFactorRequired: boolean(input.twoFactorRequired, 'twoFactorRequired'),
    turnstileEnabled: boolean(input.turnstileEnabled, 'turnstileEnabled'),
    turnstileSiteKey: text(input.turnstileSiteKey ?? '', 'turnstileSiteKey', 256),
    smtpEnabled: boolean(input.smtpEnabled, 'smtpEnabled'),
    smtpFromEmail: text(input.smtpFromEmail ?? '', 'smtpFromEmail', 320),
    smtpFromName: text(input.smtpFromName ?? 'Shpitto', 'smtpFromName', 120),
  };
  if (normalized.turnstileEnabled && !normalized.turnstileSiteKey) throw new DomainError('VALIDATION', 'Turnstile requires a site key.');
  if (normalized.smtpFromEmail) normalized.smtpFromEmail = email(normalized.smtpFromEmail);
  const current = await readSecuritySettings(db);
  if (input.expectedVersion !== current.version) throw new DomainError('CONFLICT', 'Security settings changed since they were loaded. Reload and retry.');
  const env = getServerEnv();
  const turnstileSecretKey = clearTurnstileSecret ? null : turnstileSecretInput ? turnstileSecretInput : current.turnstileSecretKey;
  const smtpUrl = clearSmtpUrl ? null : smtpUrlInput ? url(smtpUrlInput, 'smtpUrl') : current.smtpUrl;
  if (normalized.turnstileEnabled && !turnstileSecretKey) throw new DomainError('VALIDATION', 'Turnstile requires a secret key.');
  if (normalized.smtpEnabled && !smtpUrl) throw new DomainError('VALIDATION', 'SMTP requires an SMTP URL.');
  if (normalized.smtpEnabled && !normalized.smtpFromEmail) throw new DomainError('VALIDATION', 'SMTP requires a sender email.');
  if (normalized.emailVerificationEnabled && !(normalized.smtpEnabled && smtpUrl) && !(env.nodeEnv !== 'production' && env.mailDriver === 'local')) throw new DomainError('VALIDATION', 'Email verification requires a configured email delivery method.');
  const now = new Date();
  await db.insert(securitySettings).values({
    id: SETTINGS_ID,
    emailVerificationEnabled: normalized.emailVerificationEnabled,
    twoFactorRequired: normalized.twoFactorRequired,
    turnstileEnabled: normalized.turnstileEnabled,
    turnstileSiteKey: normalized.turnstileSiteKey || null,
    turnstileSecretCiphertext: turnstileSecretKey ? encryptSecret(turnstileSecretKey, env.betterAuthSecret) : null,
    smtpEnabled: normalized.smtpEnabled,
    smtpUrlCiphertext: smtpUrl ? encryptSecret(smtpUrl, env.betterAuthSecret) : null,
    smtpFromEmail: normalized.smtpFromEmail || null,
    smtpFromName: normalized.smtpFromName || null,
    version: current.version + 1,
    updatedAt: now,
  }).onConflictDoUpdate({target: securitySettings.id, set: {
    emailVerificationEnabled: normalized.emailVerificationEnabled,
    twoFactorRequired: normalized.twoFactorRequired,
    turnstileEnabled: normalized.turnstileEnabled,
    turnstileSiteKey: normalized.turnstileSiteKey || null,
    turnstileSecretCiphertext: turnstileSecretKey ? encryptSecret(turnstileSecretKey, env.betterAuthSecret) : null,
    smtpEnabled: normalized.smtpEnabled,
    smtpUrlCiphertext: smtpUrl ? encryptSecret(smtpUrl, env.betterAuthSecret) : null,
    smtpFromEmail: normalized.smtpFromEmail || null,
    smtpFromName: normalized.smtpFromName || null,
    version: current.version + 1,
    updatedAt: now,
  }});
  return publicSecuritySettings(await readSecuritySettings(db));
}
