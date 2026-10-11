import {check, index, integer, text, timestamp, uniqueIndex} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authSession, authUser} from './auth.ts';
import {appSchema} from './ownership.ts';

export const operatorRoles = appSchema.table('operator_roles', {
  userId: text('user_id').primaryKey().references(() => authUser.id, {onDelete: 'cascade'}),
  role: text('role').notNull(),
  grantedAt: timestamp('granted_at', {withTimezone: true}).notNull(),
  revokedAt: timestamp('revoked_at', {withTimezone: true}),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  activeRoleIndex: index('operator_roles_active_idx').on(table.role, table.revokedAt),
  roleCheck: check('operator_roles_role_check', sql`${table.role} in ('support', 'operator', 'superadmin')`),
  versionCheck: check('operator_roles_version_check', sql`${table.version} > 0`),
}));

export const operatorStepUps = appSchema.table('operator_step_ups', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => authUser.id, {onDelete: 'cascade'}),
  sessionId: text('session_id').notNull().references(() => authSession.id, {onDelete: 'cascade'}),
  method: text('method').notNull(),
  verifiedAt: timestamp('verified_at', {withTimezone: true}).notNull(),
  expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  activeSessionIndex: index('operator_step_ups_active_session_idx').on(table.userId, table.sessionId, table.expiresAt),
  identityUnique: uniqueIndex('operator_step_ups_identity_uq').on(table.id, table.userId, table.sessionId),
  methodCheck: check('operator_step_ups_method_check', sql`${table.method} = 'trusted_second_factor'`),
  expiryCheck: check('operator_step_ups_expiry_check', sql`${table.expiresAt} > ${table.verifiedAt}`),
}));

export const OPERATOR_STEP_UP_TTL_MS = 10 * 60 * 1000;

export type OperatorRole = 'support' | 'operator' | 'superadmin';
