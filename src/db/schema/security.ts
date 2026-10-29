import {boolean, check, integer, text, timestamp} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {appSchema} from './ownership.ts';

/** One mutable security policy row for the installed template. */
export const securitySettings = appSchema.table('security_settings', {
  id: text('id').primaryKey(),
  emailVerificationEnabled: boolean('email_verification_enabled').notNull().default(false),
  twoFactorRequired: boolean('two_factor_required').notNull().default(false),
  turnstileEnabled: boolean('turnstile_enabled').notNull().default(false),
  turnstileSiteKey: text('turnstile_site_key'),
  turnstileSecretCiphertext: text('turnstile_secret_ciphertext'),
  smtpEnabled: boolean('smtp_enabled').notNull().default(false),
  smtpUrlCiphertext: text('smtp_url_ciphertext'),
  smtpFromEmail: text('smtp_from_email'),
  smtpFromName: text('smtp_from_name'),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  versionCheck: check('security_settings_version_check', sql`${table.version} > 0`),
}));
