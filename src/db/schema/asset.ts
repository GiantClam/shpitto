import {bigint, check, foreignKey, index, integer, text, timestamp, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {appSchema} from './ownership.ts';
import {generationTasks} from './generation.ts';
import {workspaces} from './workspace.ts';

export const assets = appSchema.table('assets', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  taskId: uuid('task_id'),
  purpose: text('purpose').notNull(),
  state: text('state').notNull().default('pending'),
  objectKey: text('object_key').notNull(),
  createdBy: text('created_by').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  mime: text('mime'),
  bytes: bigint('bytes', {mode: 'bigint'}),
  sha256: text('sha256'),
  durationMs: integer('duration_ms'),
  uploadExpiresAt: timestamp('upload_expires_at', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  taskWorkspaceForeignKey: foreignKey({
    columns: [table.taskId, table.workspaceId],
    foreignColumns: [generationTasks.id, generationTasks.workspaceId],
    name: 'assets_task_workspace_fk',
  }),
  workspaceStateIndex: index('assets_workspace_state_idx').on(table.workspaceId, table.state, table.createdAt),
  purposeCheck: check('assets_purpose_check', sql`${table.purpose} in ('input', 'output')`),
  stateCheck: check('assets_state_check', sql`${table.state} in ('pending', 'ready', 'quarantined', 'deleted')`),
  bytesCheck: check('assets_bytes_check', sql`${table.bytes} is null or ${table.bytes} >= 0`),
  durationCheck: check('assets_duration_check', sql`${table.durationMs} is null or ${table.durationMs} >= 0`),
}));
