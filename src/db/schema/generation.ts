import {bigint, check, foreignKey, index, integer, jsonb, timestamp, text, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {appSchema} from './ownership.ts';
import {workspaces} from './workspace.ts';

/** Durable task state. Terminal states are immutable after settlement. */
export const generationTasks = appSchema.table('generation_tasks', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  requestedBy: text('requested_by').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  mode: text('mode').notNull(),
  modelKey: text('model_key').notNull(),
  catalogVersion: integer('catalog_version').notNull(),
  catalogSnapshot: jsonb('catalog_snapshot').notNull(),
  inputSnapshot: jsonb('input_snapshot').notNull(),
  policySnapshot: jsonb('policy_snapshot').notNull(),
  quotedCredits: bigint('quoted_credits', {mode: 'bigint'}).notNull(),
  status: text('status').notNull().default('queued'),
  failureCode: text('failure_code'),
  deadlineAt: timestamp('deadline_at', {withTimezone: true}).notNull(),
  queueDeadlineAt: timestamp('queue_deadline_at', {withTimezone: true}).notNull(),
  stageDeadlineAt: timestamp('stage_deadline_at', {withTimezone: true}),
  overallDeadlineAt: timestamp('overall_deadline_at', {withTimezone: true}),
  materializationAttempts: integer('materialization_attempts').notNull().default(0),
  nextActionAt: timestamp('next_action_at', {withTimezone: true}).notNull(),
  dispatchStartedAt: timestamp('dispatch_started_at', {withTimezone: true}),
  /** Stable provider-independent identity used for one paid create attempt. */
  dispatchIdentity: uuid('dispatch_identity'),
  submissionStartedAt: timestamp('submission_started_at', {withTimezone: true}),
  providerCostState: text('provider_cost_state'),
  providerCostMinor: bigint('provider_cost_minor', {mode: 'bigint'}),
  providerCostCurrency: text('provider_cost_currency'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  workspaceIdPairUnique: uniqueIndex('generation_tasks_id_workspace_uq').on(table.id, table.workspaceId),
  workspaceCreatedIndex: index('generation_tasks_workspace_created_idx').on(table.workspaceId, table.createdAt, table.id),
  recoveryIndex: index('generation_tasks_recovery_idx').on(table.status, table.nextActionAt, table.id),
  statusCheck: check('generation_tasks_status_check', sql`${table.status} in ('queued', 'dispatching', 'submission_unknown', 'submitted', 'running', 'materializing', 'succeeded', 'failed', 'cancelled')`),
  quoteCheck: check('generation_tasks_quoted_credits_check', sql`${table.quotedCredits} > 0`),
  versionCheck: check('generation_tasks_version_check', sql`${table.version} > 0`),
  materializationAttemptsCheck: check('generation_tasks_materialization_attempts_check', sql`${table.materializationAttempts} >= 0 and ${table.materializationAttempts} <= 8`),
  failureCheck: check('generation_tasks_failure_check', sql`${table.status} not in ('failed') or ${table.failureCode} is not null`),
  providerCostCheck: check('generation_tasks_provider_cost_check', sql`${table.providerCostState} is null or ${table.providerCostState} in ('unknown', 'known', 'not_applicable')`),
}));

export const submissionAttempts = appSchema.table('submission_attempts', {
  id: uuid('id').primaryKey(),
  taskId: uuid('task_id').notNull(),
  workspaceId: uuid('workspace_id').notNull(),
  attemptNo: integer('attempt_no').notNull(),
  provider: text('provider').notNull(),
  clientReference: uuid('client_reference').notNull(),
  providerRequestId: text('provider_request_id'),
  /** Provider-supplied polling URLs are persisted with the request identity. */
  providerStatusUrl: text('provider_status_url'),
  providerResultUrl: text('provider_result_url'),
  state: text('state').notNull(),
  startedAt: timestamp('started_at', {withTimezone: true}).notNull(),
  reconcileDeadline: timestamp('reconcile_deadline', {withTimezone: true}).notNull(),
  probeCount: integer('probe_count').notNull().default(0),
  costMinor: bigint('cost_minor', {mode: 'bigint'}),
  costCurrency: text('cost_currency'),
  costState: text('cost_state').notNull().default('unknown'),
}, (table) => ({
  taskAttemptUnique: uniqueIndex('submission_attempts_task_no_uq').on(table.taskId, table.attemptNo),
  clientReferenceUnique: uniqueIndex('submission_attempts_client_reference_uq').on(table.clientReference),
  providerRequestUnique: uniqueIndex('submission_attempts_provider_request_uq').on(table.provider, table.providerRequestId).where(sql`${table.providerRequestId} is not null`),
  taskWorkspaceForeignKey: foreignKey({
    columns: [table.taskId, table.workspaceId],
    foreignColumns: [generationTasks.id, generationTasks.workspaceId],
    name: 'submission_attempts_task_workspace_fk',
  }),
  stateCheck: check('submission_attempts_state_check', sql`${table.state} in ('claimed', 'submitted', 'running', 'materializing', 'succeeded', 'failed', 'submission_unknown')`),
  providerStatusUrlCheck: check('submission_attempts_provider_status_url_check', sql`${table.providerStatusUrl} is null or (length(${table.providerStatusUrl}) <= 2048 and (${table.providerStatusUrl} ~ '^https://queue[.]fal[.]run(/|$)' or ${table.providerStatusUrl} ~ '^https://api[.]replicate[.]com(/|$)'))`),
  providerResultUrlCheck: check('submission_attempts_provider_result_url_check', sql`${table.providerResultUrl} is null or (length(${table.providerResultUrl}) <= 2048 and (${table.providerResultUrl} ~ '^https://queue[.]fal[.]run(/|$)' or ${table.providerResultUrl} ~ '^https://api[.]replicate[.]com(/|$)'))`),
  costStateCheck: check('submission_attempts_cost_state_check', sql`${table.costState} in ('unknown', 'known', 'not_applicable')`),
  probeCheck: check('submission_attempts_probe_check', sql`${table.probeCount} >= 0`),
}));

export const generationQuarantine = appSchema.table('generation_quarantine', {
  id: uuid('id').primaryKey(),
  taskId: uuid('task_id').notNull(),
  workspaceId: uuid('workspace_id').notNull(),
  eventType: text('event_type').notNull(),
  eventKey: text('event_key').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  taskWorkspaceForeignKey: foreignKey({
    columns: [table.taskId, table.workspaceId],
    foreignColumns: [generationTasks.id, generationTasks.workspaceId],
    name: 'generation_quarantine_task_workspace_fk',
  }),
  eventUnique: uniqueIndex('generation_quarantine_event_uq').on(table.taskId, table.eventKey),
  workspaceIndex: index('generation_quarantine_workspace_idx').on(table.workspaceId, table.createdAt),
}));

/** Authenticated provider observations are acknowledged before domain processing. */
export const providerWebhookInbox = appSchema.table('provider_webhook_inbox', {
  id: uuid('id').primaryKey(),
  provider: text('provider').notNull(),
  externalEventId: text('external_event_id').notNull(),
  attemptNonce: text('attempt_nonce').notNull(),
  providerRequestId: text('provider_request_id').notNull(),
  payloadHash: text('payload_hash').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('received'),
  receivedAt: timestamp('received_at', {withTimezone: true}).notNull(),
  processedAt: timestamp('processed_at', {withTimezone: true}),
}, (table) => ({
  identity: uniqueIndex('provider_webhook_inbox_identity_uq').on(table.provider, table.externalEventId),
  requestIndex: index('provider_webhook_inbox_request_idx').on(table.provider, table.providerRequestId, table.receivedAt),
  payloadHashCheck: check('provider_webhook_inbox_payload_hash_check', sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
  providerCheck: check('provider_webhook_inbox_provider_check', sql`${table.provider} in ('replicate', 'fal')`),
  statusCheck: check('provider_webhook_inbox_status_check', sql`${table.status} in ('received', 'processed', 'failed')`),
  identityCheck: check('provider_webhook_inbox_identity_check', sql`length(${table.externalEventId}) between 1 and 255 and length(${table.attemptNonce}) between 1 and 255 and length(${table.providerRequestId}) between 1 and 255`),
}));
