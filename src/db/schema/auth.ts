import {boolean, index, integer, pgTable, text, timestamp, uniqueIndex} from 'drizzle-orm/pg-core';

/** Better Auth keeps its native text identifiers; the application never coerces them to UUIDs. */
export const authUser = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  image: text('image'),
  disabledAt: timestamp('disabled_at', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  emailUnique: uniqueIndex('user_email_uq').on(table.email),
}));

export const authSession = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
  token: text('token').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => authUser.id, {onDelete: 'cascade'}),
}, (table) => ({
  tokenUnique: uniqueIndex('session_token_uq').on(table.token),
  userIndex: index('session_user_id_idx').on(table.userId),
}));

export const authAccount = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, {onDelete: 'cascade'}),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', {withTimezone: true}),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {withTimezone: true}),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  providerAccountUnique: uniqueIndex('account_provider_account_uq').on(table.providerId, table.accountId),
  userIndex: index('account_user_id_idx').on(table.userId),
}));

export const authVerification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  identifierIndex: index('verification_identifier_idx').on(table.identifier),
}));

/** Better Auth two-factor data; secrets and backup codes are encrypted by the plugin. */
export const authTwoFactor = pgTable('two_factor', {
  id: text('id').primaryKey(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, {onDelete: 'cascade'}),
  verified: boolean('verified').notNull().default(true),
  failedVerificationCount: integer('failed_verification_count').notNull().default(0),
  lockedUntil: timestamp('locked_until', {withTimezone: true}),
}, (table) => ({
  userIndex: index('two_factor_user_id_idx').on(table.userId),
  secretIndex: index('two_factor_secret_idx').on(table.secret),
}));
