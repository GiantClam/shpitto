import {check, index, jsonb, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {appSchema} from './ownership.ts';
import {workspaces} from './workspace.ts';

/**
 * Domain command results outlive queue/webhook deduplication windows. The
 * semantic hash makes accidental idempotency-key reuse a visible conflict.
 */
export const commandResults = appSchema.table('command_results', {
  id: uuid('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, {onDelete: 'restrict'}),
  scopeKey: text('scope_key').notNull(),
  commandName: text('command_name').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  semanticHash: text('semantic_hash').notNull(),
  status: text('status').notNull().default('pending'),
  result: jsonb('result'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  committedAt: timestamp('committed_at', {withTimezone: true}),
}, (table) => ({
  identityUnique: uniqueIndex('command_results_identity_uq').on(table.scopeKey, table.idempotencyKey),
  actorIndex: index('command_results_actor_idx').on(table.actorUserId, table.createdAt),
  workspaceIndex: index('command_results_workspace_idx').on(table.workspaceId, table.createdAt),
  keyLengthCheck: check('command_results_key_length_check', sql`char_length(${table.idempotencyKey}) between 1 and 128`),
  nameLengthCheck: check('command_results_name_length_check', sql`char_length(${table.commandName}) between 1 and 120`),
  statusCheck: check('command_results_status_check', sql`${table.status} in ('pending', 'committed')`),
  committedResultCheck: check('command_results_committed_result_check', sql`${table.status} = 'pending' or ${table.result} is not null`),
}));
