import {bigint, check, foreignKey, index, integer, jsonb, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {creditGrants, workspaces} from './workspace.ts';
import {appSchema} from './ownership.ts';

/** Immutable explanation for every credit bucket transition. */
export const creditLedgerEntries = appSchema.table('credit_ledger_entries', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  grantId: uuid('grant_id').notNull(),
  entryType: text('entry_type').notNull(),
  availableDelta: bigint('available_delta', {mode: 'bigint'}).notNull(),
  reservedDelta: bigint('reserved_delta', {mode: 'bigint'}).notNull(),
  consumedDelta: bigint('consumed_delta', {mode: 'bigint'}).notNull(),
  expiredDelta: bigint('expired_delta', {mode: 'bigint'}).notNull(),
  voidedDelta: bigint('voided_delta', {mode: 'bigint'}).notNull(),
  businessKey: text('business_key').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  grantWorkspaceForeignKey: foreignKey({
    columns: [table.grantId, table.workspaceId],
    foreignColumns: [creditGrants.id, creditGrants.workspaceId],
    name: 'credit_ledger_entries_grant_workspace_fk',
  }),
  businessKeyUnique: uniqueIndex('credit_ledger_entries_business_key_uq').on(table.businessKey),
  grantIndex: index('credit_ledger_entries_grant_idx').on(table.workspaceId, table.grantId, table.createdAt),
  typeCheck: check('credit_ledger_entries_type_check', sql`${table.entryType} in ('grant_issued', 'reserve', 'release', 'refund', 'consume', 'expire', 'void', 'compensation', 'opening_snapshot')`),
}));

/** Audit and outbox rows share the same transaction as a credit mutation. */
export const auditEvents = appSchema.table('audit_events', {
  id: uuid('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, {onDelete: 'restrict'}),
  commandName: text('command_name').notNull(),
  commandKey: text('command_key').notNull(),
  semanticHash: text('semantic_hash').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  commandUnique: uniqueIndex('audit_events_command_uq').on(table.actorUserId, table.workspaceId, table.commandName, table.commandKey),
  workspaceIndex: index('audit_events_workspace_idx').on(table.workspaceId, table.createdAt),
}));

export const outboxEvents = appSchema.table('outbox_events', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, {onDelete: 'restrict'}),
  eventType: text('event_type').notNull(),
  aggregateId: uuid('aggregate_id'),
  businessKey: text('business_key').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('pending'),
  availableAt: timestamp('available_at', {withTimezone: true}).notNull(),
  leaseUntil: timestamp('lease_until', {withTimezone: true}),
  leaseOwner: text('lease_owner'),
  leaseToken: uuid('lease_token'),
  leaseGeneration: bigint('lease_generation', {mode: 'bigint'}).notNull().default(0n),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  businessKeyUnique: uniqueIndex('outbox_events_business_key_uq').on(table.businessKey),
  pendingIndex: index('outbox_events_pending_idx').on(table.status, table.createdAt),
  statusCheck: check('outbox_events_status_check', sql`${table.status} in ('pending', 'published', 'failed')`),
  attemptsCheck: check('outbox_events_attempts_check', sql`${table.attempts} >= 0 and ${table.leaseGeneration} >= 0`),
}));

