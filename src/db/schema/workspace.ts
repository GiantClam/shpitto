import {bigint, check, foreignKey, index, integer, primaryKey, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {appSchema} from './ownership.ts';

export const workspaces = appSchema.table('workspaces', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  status: text('status').notNull().default('active'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  creatorIndex: index('workspaces_created_by_idx').on(table.createdBy),
  statusIndex: index('workspaces_status_idx').on(table.status),
  personalCreatorUnique: uniqueIndex('workspaces_personal_creator_uq').on(table.createdBy).where(sql`${table.kind} = 'personal'`),
  kindCheck: check('workspaces_kind_check', sql`${table.kind} in ('personal', 'team')`),
  statusCheck: check('workspaces_status_check', sql`${table.status} in ('active', 'suspended')`),
  versionCheck: check('workspaces_version_check', sql`${table.version} > 0`),
}));

export const workspaceMembers = appSchema.table('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'cascade'}),
  userId: text('user_id').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  primaryKey: primaryKey({columns: [table.workspaceId, table.userId], name: 'workspace_members_pk'}),
  userWorkspaceIndex: index('workspace_members_user_workspace_idx').on(table.userId, table.workspaceId),
  roleCheck: check('workspace_members_role_check', sql`${table.role} in ('owner', 'member')`),
}));

export const workspaceSetups = appSchema.table('workspace_setups', {
  id: uuid('id').primaryKey(),
  userId: text('user_id').notNull().references(() => authUser.id, {onDelete: 'cascade'}),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, {onDelete: 'restrict'}),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  userUnique: uniqueIndex('workspace_setups_user_uq').on(table.userId),
  statusCheck: check('workspace_setups_status_check', sql`${table.status} in ('pending', 'complete')`),
}));

/** Credit ownership starts here; later milestones add grants, reservations and settlement commands. */
export const creditAccounts = appSchema.table('credit_accounts', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, {onDelete: 'restrict'}),
  version: bigint('version', {mode: 'bigint'}).notNull().default(0n),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  versionCheck: check('credit_accounts_version_check', sql`${table.version} >= 0`),
}));

export const creditGrants = appSchema.table('credit_grants', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  source: text('source').notNull(),
  issued: bigint('issued', {mode: 'bigint'}).notNull(),
  available: bigint('available', {mode: 'bigint'}).notNull(),
  reserved: bigint('reserved', {mode: 'bigint'}).notNull(),
  consumed: bigint('consumed', {mode: 'bigint'}).notNull(),
  expired: bigint('expired', {mode: 'bigint'}).notNull(),
  voided: bigint('voided', {mode: 'bigint'}).notNull(),
  expiresAt: timestamp('expires_at', {withTimezone: true}),
  /** Set only for a failure-compensation grant; preserves the refunded allocation lineage. */
  originAllocationId: uuid('origin_allocation_id'),
  businessKey: text('business_key').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  businessKeyUnique: uniqueIndex('credit_grants_business_key_uq').on(table.businessKey),
  workspaceIdPairUnique: uniqueIndex('credit_grants_id_workspace_uq').on(table.id, table.workspaceId),
  workspaceExpiryIndex: index('credit_grants_workspace_expiry_idx').on(table.workspaceId, table.expiresAt, table.id),
  sourceCheck: check('credit_grants_source_check', sql`${table.source} in ('subscription', 'purchase', 'compensation', 'manual', 'demo')`),
  nonNegativeCheck: check('credit_grants_non_negative_check', sql`${table.issued} >= 0 and ${table.available} >= 0 and ${table.reserved} >= 0 and ${table.consumed} >= 0 and ${table.expired} >= 0 and ${table.voided} >= 0`),
  balanceCheck: check('credit_grants_balance_check', sql`${table.issued} = ${table.available} + ${table.reserved} + ${table.consumed} + ${table.expired} + ${table.voided}`),
}));

export const creditReservations = appSchema.table('credit_reservations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  /** Set by the generation create command in the same transaction. Nullable for M2 history. */
  taskId: uuid('task_id'),
  actorUserId: text('actor_user_id').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  commandName: text('command_name').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  modelId: text('model_id').notNull(),
  catalogVersion: integer('catalog_version').notNull(),
  quantity: bigint('quantity', {mode: 'bigint'}).notNull(),
  unitCost: bigint('unit_cost', {mode: 'bigint'}).notNull(),
  totalCost: bigint('total_cost', {mode: 'bigint'}).notNull(),
  quoteHash: text('quote_hash').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  workspaceIdPairUnique: uniqueIndex('credit_reservations_id_workspace_uq').on(table.id, table.workspaceId),
  taskUnique: uniqueIndex('credit_reservations_task_uq').on(table.taskId),
  commandUnique: uniqueIndex('credit_reservations_command_uq').on(table.workspaceId, table.commandName, table.idempotencyKey),
  workspaceCreatedIndex: index('credit_reservations_workspace_created_idx').on(table.workspaceId, table.createdAt),
  positiveCheck: check('credit_reservations_positive_check', sql`${table.quantity} > 0 and ${table.unitCost} > 0 and ${table.totalCost} > 0`),
  totalCheck: check('credit_reservations_total_check', sql`${table.totalCost} = ${table.quantity} * ${table.unitCost}`),
  catalogVersionCheck: check('credit_reservations_catalog_version_check', sql`${table.catalogVersion} > 0`),
  statusCheck: check('credit_reservations_status_check', sql`${table.status} in ('active', 'released', 'consumed')`),
}));

export const creditAllocations = appSchema.table('credit_allocations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  reservationId: uuid('reservation_id').notNull(),
  grantId: uuid('grant_id').notNull(),
  amount: bigint('amount', {mode: 'bigint'}).notNull(),
  sourceExpiry: timestamp('source_expiry', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  workspaceIdPairUnique: uniqueIndex('credit_allocations_id_workspace_uq').on(table.id, table.workspaceId),
  reservationGrantUnique: uniqueIndex('credit_allocations_reservation_grant_uq').on(table.reservationId, table.grantId),
  reservationWorkspaceForeignKey: foreignKey({
    columns: [table.reservationId, table.workspaceId],
    foreignColumns: [creditReservations.id, creditReservations.workspaceId],
    name: 'credit_allocations_reservation_workspace_fk',
  }),
  grantWorkspaceForeignKey: foreignKey({
    columns: [table.grantId, table.workspaceId],
    foreignColumns: [creditGrants.id, creditGrants.workspaceId],
    name: 'credit_allocations_grant_workspace_fk',
  }),
  amountCheck: check('credit_allocations_amount_check', sql`${table.amount} > 0`),
}));
