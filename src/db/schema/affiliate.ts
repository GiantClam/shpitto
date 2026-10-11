import {check, index, integer, jsonb, text, timestamp, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {appSchema} from './ownership.ts';
import {workspaces} from './workspace.ts';

export const affiliateSettings = appSchema.table('affiliate_settings', {
  id: text('id').primaryKey(),
  enabled: text('enabled').notNull().default('disabled'),
  provider: text('provider').notNull().default('firstpromoter'),
  accountId: text('account_id'),
  programId: text('program_id'),
  providerCampaignRevision: text('provider_campaign_revision').notNull().default('first-payment-v1'),
  commissionPolicy: text('commission_policy').notNull().default('first_payment'),
  autoPayoutEnabled: text('auto_payout_enabled').notNull().default('disabled'),
  dashboardUrl: text('dashboard_url'),
  approvedDashboardOrigin: text('approved_dashboard_origin'),
  policyVersion: integer('policy_version').notNull().default(1),
  accountCheckpointAt: timestamp('account_checkpoint_at', {withTimezone: true}),
  accountCheckpointVersion: integer('account_checkpoint_version').notNull().default(0),
  accountSyncStatus: text('account_sync_status').notNull().default('pending'),
  reviewedCampaignRevision: text('reviewed_campaign_revision'),
  lastSyncAttemptAt: timestamp('last_sync_attempt_at', {withTimezone: true}),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  enabledCheck: check('affiliate_settings_enabled_check', sql`${table.enabled} in ('enabled', 'disabled')`),
  providerCheck: check('affiliate_settings_provider_check', sql`${table.provider} = 'firstpromoter'`),
  policyCheck: check('affiliate_settings_policy_check', sql`${table.commissionPolicy} in ('first_payment', 'provider_campaign')`),
  payoutCheck: check('affiliate_settings_payout_check', sql`${table.autoPayoutEnabled} = 'disabled'`),
  versionCheck: check('affiliate_settings_version_check', sql`${table.policyVersion} > 0`),
  checkpointCheck: check('affiliate_settings_checkpoint_check', sql`${table.accountCheckpointVersion} >= 0 and ${table.accountSyncStatus} in ('pending', 'succeeded', 'failed')`),
}));

export const affiliateAttributions = appSchema.table('affiliate_attributions', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, {onDelete: 'restrict'}),
  creatorUserId: text('creator_user_id').references(() => authUser.id, {onDelete: 'restrict'}),
  workspaceUid: text('workspace_uid').notNull(),
  affiliateId: text('affiliate_id'),
  touchReference: text('touch_reference'),
  programId: text('program_id'),
  capturedAt: timestamp('captured_at', {withTimezone: true}),
  expiresAt: timestamp('expires_at', {withTimezone: true}),
  verifiedAt: timestamp('verified_at', {withTimezone: true}),
  status: text('status').notNull().default('unattributed'),
  policyVersion: integer('policy_version').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  uidUnique: uniqueIndex('affiliate_attributions_uid_uq').on(table.workspaceUid),
  statusIndex: index('affiliate_attributions_status_idx').on(table.status, table.createdAt),
  statusCheck: check('affiliate_attributions_status_check', sql`${table.status} in ('unattributed', 'pending', 'verified', 'invalid', 'held')`),
  uidCheck: check('affiliate_attributions_uid_check', sql`${table.workspaceUid} ~ '^workspace:[0-9a-f-]{36}$'`),
  policyCheck: check('affiliate_attributions_policy_check', sql`${table.policyVersion} > 0`),
}));

export const affiliatePayments = appSchema.table('affiliate_payments', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  paymentReference: text('payment_reference').notNull(),
  kind: text('kind').notNull(),
  paidAt: timestamp('paid_at', {withTimezone: true}).notNull(),
  amountMinor: text('amount_minor').notNull(),
  currency: text('currency').notNull(),
  historyComplete: text('history_complete').notNull().default('yes'),
  firstPayment: text('first_payment').notNull().default('unknown'),
  saleStatus: text('sale_status').notNull().default('pending'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  paymentUnique: uniqueIndex('affiliate_payments_reference_uq').on(table.workspaceId, table.paymentReference),
  paymentIndex: index('affiliate_payments_order_idx').on(table.workspaceId, table.paidAt, table.paymentReference),
  firstPaymentUnique: uniqueIndex('affiliate_payments_first_uq').on(table.workspaceId).where(sql`${table.firstPayment} = 'yes'`),
  kindCheck: check('affiliate_payments_kind_check', sql`${table.kind} in ('subscription', 'pack')`),
  historyCheck: check('affiliate_payments_history_check', sql`${table.historyComplete} in ('yes', 'no', 'unknown')`),
  firstCheck: check('affiliate_payments_first_check', sql`${table.firstPayment} in ('yes', 'no', 'unknown')`),
  saleCheck: check('affiliate_payments_sale_check', sql`${table.saleStatus} in ('pending', 'acknowledged', 'held', 'denied', 'failed')`),
  moneyCheck: check('affiliate_payments_money_check', sql`${table.amountMinor} ~ '^[0-9]+$' and ${table.currency} ~ '^[a-z]{3}$'`),
}));

export const affiliateDeliveryEvents = appSchema.table('affiliate_delivery_events', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  eventKind: text('event_kind').notNull(),
  eventReference: text('event_reference').notNull(),
  payloadDigest: text('payload_digest').notNull(),
  payload: jsonb('payload').notNull().default({}),
  paymentReference: text('payment_reference'),
  amountMinor: text('amount_minor'),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextActionAt: timestamp('next_action_at', {withTimezone: true}).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', {withTimezone: true}),
  leaseToken: text('lease_token'),
  leaseUntil: timestamp('lease_until', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  identity: uniqueIndex('affiliate_delivery_events_identity_uq').on(table.eventKind, table.eventReference),
  workspaceIndex: index('affiliate_delivery_events_workspace_idx').on(table.workspaceId, table.createdAt),
  statusCheck: check('affiliate_delivery_events_status_check', sql`${table.status} in ('pending', 'acknowledged', 'held', 'failed')`),
  digestCheck: check('affiliate_delivery_events_digest_check', sql`${table.payloadDigest} ~ '^[a-f0-9]{64}$'`),
  attemptsCheck: check('affiliate_delivery_events_attempts_check', sql`${table.attempts} >= 0`),
  moneyCheck: check('affiliate_delivery_events_amount_check', sql`${table.amountMinor} is null or ${table.amountMinor} ~ '^[0-9]+$'`),
}));

export const affiliateReviewRecords = appSchema.table('affiliate_review_records', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  paymentReference: text('payment_reference'),
  status: text('status').notNull().default('held'),
  reason: text('reason').notNull(),
  policyVersion: integer('policy_version').notNull(),
  reviewVersion: integer('review_version').notNull().default(1),
  accountCheckpointVersion: integer('account_checkpoint_version').notNull().default(0),
  accountCheckpointAt: timestamp('account_checkpoint_at', {withTimezone: true}),
  refreshedAt: timestamp('refreshed_at', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  workspaceIndex: index('affiliate_review_records_workspace_idx').on(table.workspaceId, table.updatedAt),
  paymentUnique: uniqueIndex('affiliate_review_records_payment_uq').on(table.workspaceId, table.paymentReference),
  statusCheck: check('affiliate_review_records_status_check', sql`${table.status} in ('eligible', 'held', 'approve_pending', 'deny_pending', 'denied', 'approved')`),
  reasonCheck: check('affiliate_review_records_reason_check', sql`length(trim(${table.reason})) between 1 and 500`),
  versionCheck: check('affiliate_review_records_version_check', sql`${table.policyVersion} > 0`),
  evidenceVersionCheck: check('affiliate_review_records_evidence_version_check', sql`${table.reviewVersion} > 0 and ${table.accountCheckpointVersion} >= 0`),
}));

export const affiliateCorrectionCases = appSchema.table('affiliate_correction_cases', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  paymentReference: text('payment_reference'),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  resolvedAt: timestamp('resolved_at', {withTimezone: true}),
}, (table) => ({
  identity: uniqueIndex('affiliate_correction_cases_identity_uq').on(table.workspaceId, table.paymentReference, table.reason),
  statusCheck: check('affiliate_correction_cases_status_check', sql`${table.status} in ('open', 'resolved')`),
  resolutionCheck: check('affiliate_correction_cases_resolution_check', sql`(${table.status} = 'open' and ${table.resolvedAt} is null) or (${table.status} = 'resolved' and ${table.resolvedAt} is not null)`),
}));

export const affiliateReviewActions = appSchema.table('affiliate_review_actions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, {onDelete: 'restrict'}),
  reviewId: uuid('review_id').notNull().references(() => affiliateReviewRecords.id, {onDelete: 'restrict'}),
  actorUserId: text('actor_user_id').notNull().references(() => authUser.id, {onDelete: 'restrict'}),
  action: text('action').notNull(),
  payload: jsonb('payload').notNull(),
  payloadDigest: text('payload_digest').notNull(),
  policyVersion: integer('policy_version').notNull(),
  reviewVersion: integer('review_version').notNull(),
  status: text('status').notNull().default('pending'),
  providerBatchReference: text('provider_batch_reference'),
  providerStatus: text('provider_status'),
  attempts: integer('attempts').notNull().default(0),
  leaseToken: text('lease_token'),
  leaseUntil: timestamp('lease_until', {withTimezone: true}),
  nextActionAt: timestamp('next_action_at', {withTimezone: true}).notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  pendingIndex: index('affiliate_review_actions_pending_idx').on(table.status, table.nextActionAt),
  actionCheck: check('affiliate_review_actions_action_check', sql`${table.action} in ('approve', 'deny')`),
  statusCheck: check('affiliate_review_actions_status_check', sql`${table.status} in ('pending', 'submitted', 'succeeded', 'failed')`),
  versionsCheck: check('affiliate_review_actions_versions_check', sql`${table.policyVersion} > 0 and ${table.reviewVersion} > 0 and ${table.attempts} >= 0`),
}));
