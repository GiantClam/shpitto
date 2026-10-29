import {check, index, integer, jsonb, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {appSchema} from './ownership.ts';
import {workspaces} from './workspace.ts';

/** Durable operator read purpose. The payload is always redacted at write time. */
export const operatorTenantAccess = appSchema.table('operator_tenant_access', {
  id: uuid('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  purpose: text('purpose').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  actorIndex: index('operator_tenant_access_actor_idx').on(table.actorUserId, table.createdAt),
  workspaceIndex: index('operator_tenant_access_workspace_idx').on(table.workspaceId, table.createdAt),
  purposeCheck: check('operator_tenant_access_purpose_check', sql`length(trim(${table.purpose})) between 3 and 500`),
}));

/** Small, redacted operational facts used by the admin read model. */
export const operatorRecoveryNotes = appSchema.table('operator_recovery_notes', {
  id: uuid('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, {onDelete: 'restrict'}),
  subjectType: text('subject_type').notNull(),
  subjectId: text('subject_id').notNull(),
  status: text('status').notNull().default('open'),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  resolvedAt: timestamp('resolved_at', {withTimezone: true}),
}, (table) => ({
  subjectIndex: index('operator_recovery_notes_subject_idx').on(table.subjectType, table.subjectId, table.createdAt),
  statusCheck: check('operator_recovery_notes_status_check', sql`${table.status} in ('open', 'resolved')`),
  subjectCheck: check('operator_recovery_notes_subject_check', sql`length(${table.subjectType}) between 1 and 64 and length(${table.subjectId}) between 1 and 255`),
  reasonCheck: check('operator_recovery_notes_reason_check', sql`length(trim(${table.reason})) between 3 and 500`),
  resolutionCheck: check('operator_recovery_notes_resolution_check', sql`(${table.status} = 'open' and ${table.resolvedAt} is null) or (${table.status} = 'resolved' and ${table.resolvedAt} is not null)`),
}));

export const OPERATOR_QUERY_PAGE_SIZE = 50;
export const OPERATOR_QUERY_MAX_PAGE_SIZE = 100;
