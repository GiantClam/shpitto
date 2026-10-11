import {check, index, integer, jsonb, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {appSchema} from './ownership.ts';
import {workspaces} from './workspace.ts';

export const workspaceInvitations = appSchema.table('workspace_invitations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'cascade'}),
  emailNormalized: text('email_normalized').notNull(),
  role: text('role').notNull().default('member'),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', {withTimezone: true}).notNull(),
  acceptedAt: timestamp('accepted_at', {withTimezone: true}),
  acceptedBy: text('accepted_by').references(() => authUser.id, {onDelete: 'restrict'}),
  inviterId: text('inviter_id').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  tokenHashUnique: uniqueIndex('workspace_invitations_token_hash_uq').on(table.tokenHash),
  pendingEmailUnique: uniqueIndex('workspace_invitations_pending_email_uq')
    .on(table.workspaceId, table.emailNormalized)
    .where(sql`${table.acceptedAt} is null`),
  workspaceIndex: index('workspace_invitations_workspace_idx').on(table.workspaceId, table.createdAt),
  tokenHashIndex: index('workspace_invitations_token_hash_idx').on(table.tokenHash),
  roleCheck: check('workspace_invitations_role_check', sql`${table.role} = 'member'`),
  expiryCheck: check('workspace_invitations_expiry_check', sql`${table.expiresAt} = ${table.createdAt} + interval '7 days'`),
}));

/** Durable mail intent. A later worker can claim and deliver this row. */
export const mailOutbox = appSchema.table('mail_outbox', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  invitationId: uuid('invitation_id').notNull().references(() => workspaceInvitations.id, {onDelete: 'cascade'}),
  businessKey: text('business_key').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  payload: jsonb('payload').$type<Readonly<Record<string, unknown>>>().notNull(),
  status: text('status').notNull().default('pending'),
  availableAt: timestamp('available_at', {withTimezone: true}).notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  businessKeyUnique: uniqueIndex('mail_outbox_business_key_uq').on(table.businessKey),
  invitationUnique: uniqueIndex('mail_outbox_invitation_uq').on(table.invitationId),
  statusIndex: index('mail_outbox_status_available_idx').on(table.status, table.availableAt),
  kindCheck: check('mail_outbox_kind_check', sql`${table.kind} = 'workspace_invitation'`),
  statusCheck: check('mail_outbox_status_check', sql`${table.status} in ('pending', 'sending', 'sent', 'failed')`),
}));
