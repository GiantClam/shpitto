import {sql} from 'drizzle-orm';
import {check, foreignKey, integer, primaryKey, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {appSchema} from './ownership.ts';
import {workspaces} from './workspace.ts';

export const recoveryHeartbeats = appSchema.table('recovery_heartbeats', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  workerKey: text('worker_key').notNull(),
  expectedAt: timestamp('expected_at', {withTimezone: true}).notNull(),
  lastSuccessAt: timestamp('last_success_at', {withTimezone: true}),
}, (table) => ({
  scope: primaryKey({columns: [table.workspaceId, table.workerKey]}),
  workerCheck: check('recovery_heartbeat_worker_check', sql`${table.workerKey} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'`),
}));

/** One durable incident per outage, retaining the original redacted delivery snapshot. */
export const recoveryHeartbeatIncidents = appSchema.table('recovery_heartbeat_incidents', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  workerKey: text('worker_key').notNull(),
  openedAt: timestamp('opened_at', {withTimezone: true}).notNull(),
  expectedAt: timestamp('expected_at', {withTimezone: true}).notNull(),
  lastSweepAt: timestamp('last_sweep_at', {withTimezone: true}),
  ageSeconds: integer('age_seconds').notNull(),
  recoveredAt: timestamp('recovered_at', {withTimezone: true}),
  deliveredAt: timestamp('delivered_at', {withTimezone: true}),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', {withTimezone: true}).notNull(),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', {withTimezone: true}),
}, (table) => ({
  scope: foreignKey({columns: [table.workspaceId, table.workerKey], foreignColumns: [recoveryHeartbeats.workspaceId, recoveryHeartbeats.workerKey]}).onDelete('restrict'),
  openScope: uniqueIndex('recovery_heartbeat_open_scope_idx').on(table.workspaceId, table.workerKey).where(sql`${table.recoveredAt} is null`),
  counts: check('recovery_heartbeat_counts_check', sql`${table.attempts} >= 0 and ${table.ageSeconds} between 180 and 31536000`),
  lease: check('recovery_heartbeat_lease_check', sql`(${table.leaseToken} is null) = (${table.leaseUntil} is null)`),
}));
