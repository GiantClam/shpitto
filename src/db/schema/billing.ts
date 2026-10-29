import {bigint, boolean, check, foreignKey, index, integer, jsonb, primaryKey, timestamp, text, uniqueIndex, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {appSchema} from './ownership.ts';
import {workspaces} from './workspace.ts';

/** Workspace-owned billing state used by the shared access policy. */
export const billingAccounts = appSchema.table('billing_accounts', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, {onDelete: 'restrict'}),
  status: text('status').notNull().default('active'),
  holdReason: text('hold_reason'),
  version: integer('version').notNull().default(1),
  reconciliationLeaseOwner: text('reconciliation_lease_owner'),
  reconciliationLeaseToken: uuid('reconciliation_lease_token'),
  reconciliationGeneration: bigint('reconciliation_generation', {mode: 'bigint'}).notNull().default(0n),
  reconciliationLeaseUntil: timestamp('reconciliation_lease_until', {withTimezone: true}),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  statusIndex: index('billing_accounts_status_idx').on(table.status),
  statusCheck: check('billing_accounts_status_check', sql`${table.status} in ('active', 'hold')`),
  versionCheck: check('billing_accounts_version_check', sql`${table.version} > 0`),
  reconciliationGenerationCheck: check('billing_accounts_reconciliation_generation_check', sql`${table.reconciliationGeneration} >= 0`),
  reconciliationLeaseCheck: check('billing_accounts_reconciliation_lease_check', sql`(${table.reconciliationLeaseOwner} is null and ${table.reconciliationLeaseToken} is null and ${table.reconciliationLeaseUntil} is null) or (${table.reconciliationLeaseOwner} is not null and length(${table.reconciliationLeaseOwner}) > 0 and ${table.reconciliationLeaseToken} is not null and ${table.reconciliationLeaseUntil} is not null and ${table.reconciliationGeneration} > 0)`),
}));

/** Customer identities remain mapped forever; replacement closes one interval and appends another. */
export const billingCustomerHistory = appSchema.table('billing_customer_history', {
  workspaceId: uuid('workspace_id').notNull().references(() => billingAccounts.workspaceId, {onDelete: 'restrict'}),
  provider: text('provider').notNull(),
  customerId: text('customer_id').notNull(),
  previousCustomerId: text('previous_customer_id'),
  validFrom: timestamp('valid_from', {withTimezone: true}).notNull(),
  validUntil: timestamp('valid_until', {withTimezone: true}),
  changeReason: text('change_reason').notNull(),
}, (table) => ({
  identity: primaryKey({name: 'billing_customer_history_pk', columns: [table.provider, table.customerId]}),
  tenantIdentity: uniqueIndex('billing_customer_history_tenant_uq').on(table.provider, table.customerId, table.workspaceId),
  currentCustomer: uniqueIndex('billing_customer_history_current_uq').on(table.workspaceId, table.provider).where(sql`${table.validUntil} is null`),
  providerCheck: check('billing_customer_history_provider_check', sql`${table.provider} in ('fixture', 'stripe')`),
  intervalCheck: check('billing_customer_history_interval_check', sql`${table.validUntil} is null or ${table.validUntil} >= ${table.validFrom}`),
  identityCheck: check('billing_customer_history_identity_check', sql`length(${table.customerId}) between 1 and 255 and length(trim(${table.changeReason})) > 0 and (${table.previousCustomerId} is null or ${table.previousCustomerId} <> ${table.customerId})`),
  previousCustomerForeignKey: foreignKey({name: 'billing_customer_history_previous_fk', columns: [table.provider, table.previousCustomerId, table.workspaceId], foreignColumns: [table.provider, table.customerId, table.workspaceId]}).onDelete('restrict'),
}));

export const billingCheckoutAttempts = appSchema.table('billing_checkout_attempts', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => billingAccounts.workspaceId, {onDelete: 'restrict'}),
  provider: text('provider').notNull(),
  customerId: text('customer_id').notNull(),
  kind: text('kind').notNull(),
  catalogSnapshot: jsonb('catalog_snapshot').notNull(),
  stripeSessionId: text('stripe_session_id'),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('creating'),
  expiresAt: timestamp('expires_at', {withTimezone: true}),
  resolvedAt: timestamp('resolved_at', {withTimezone: true}),
  resolutionReference: text('resolution_reference'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  tenantIdentity: uniqueIndex('billing_checkout_attempts_tenant_uq').on(table.id, table.workspaceId, table.provider),
  liveSlot: uniqueIndex('billing_checkout_attempts_live_recurring_uq').on(table.workspaceId).where(sql`${table.kind} = 'subscription' and ${table.status} in ('creating', 'open', 'unknown')`),
  sessionIdentity: uniqueIndex('billing_checkout_attempts_session_uq').on(table.provider, table.stripeSessionId),
  commandIdentity: uniqueIndex('billing_checkout_attempts_key_uq').on(table.provider, table.idempotencyKey),
  customerForeignKey: foreignKey({name: 'billing_checkout_attempts_customer_fk', columns: [table.provider, table.customerId, table.workspaceId], foreignColumns: [billingCustomerHistory.provider, billingCustomerHistory.customerId, billingCustomerHistory.workspaceId]}),
  kindCheck: check('billing_checkout_attempts_kind_check', sql`${table.kind} in ('subscription', 'pack')`),
  statusCheck: check('billing_checkout_attempts_status_check', sql`${table.status} in ('creating', 'open', 'unknown', 'paid', 'expired', 'canceled')`),
  snapshotCheck: check('billing_checkout_attempts_snapshot_check', sql`app.billing_catalog_snapshot_valid(${table.catalogSnapshot}, ${table.kind}) and ${table.catalogSnapshot}->>'provider' = ${table.provider}`),
  keyCheck: check('billing_checkout_attempts_key_check', sql`length(${table.idempotencyKey}) between 8 and 255`),
  resolutionCheck: check('billing_checkout_attempts_resolution_check', sql`(${table.status} in ('creating', 'open', 'unknown') and ${table.resolvedAt} is null and ${table.resolutionReference} is null) or (${table.status} in ('paid', 'expired', 'canceled') and ${table.resolvedAt} is not null and ${table.resolutionReference} is not null and length(trim(${table.resolutionReference})) > 0)`),
}));

export const billingSubscriptions = appSchema.table('billing_subscriptions', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => billingAccounts.workspaceId, {onDelete: 'restrict'}),
  provider: text('provider').notNull(),
  customerId: text('customer_id').notNull(),
  externalId: text('external_id').notNull(),
  catalogSnapshot: jsonb('catalog_snapshot').notNull(),
  status: text('status').notNull(),
  periodStart: timestamp('period_start', {withTimezone: true}),
  periodEnd: timestamp('period_end', {withTimezone: true}),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  externalIdentity: uniqueIndex('billing_subscriptions_external_uq').on(table.provider, table.externalId),
  tenantIdentity: uniqueIndex('billing_subscriptions_tenant_uq').on(table.id, table.workspaceId, table.provider),
  activeSlot: uniqueIndex('billing_subscriptions_nonterminal_uq').on(table.workspaceId).where(sql`${table.status} not in ('canceled', 'incomplete_expired')`),
  customerForeignKey: foreignKey({name: 'billing_subscriptions_customer_fk', columns: [table.provider, table.customerId, table.workspaceId], foreignColumns: [billingCustomerHistory.provider, billingCustomerHistory.customerId, billingCustomerHistory.workspaceId]}),
  statusCheck: check('billing_subscriptions_status_check', sql`${table.status} in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')`),
  periodCheck: check('billing_subscriptions_period_check', sql`(${table.periodStart} is null and ${table.periodEnd} is null) or (${table.periodStart} is not null and ${table.periodEnd} is not null and ${table.periodEnd} > ${table.periodStart})`),
  snapshotCheck: check('billing_subscriptions_snapshot_check', sql`app.billing_catalog_snapshot_valid(${table.catalogSnapshot}, 'subscription') and ${table.catalogSnapshot}->>'provider' = ${table.provider}`),
}));

export const billingOrders = appSchema.table('billing_orders', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => billingAccounts.workspaceId, {onDelete: 'restrict'}),
  provider: text('provider').notNull(),
  customerId: text('customer_id').notNull(),
  kind: text('kind').notNull(),
  catalogSnapshot: jsonb('catalog_snapshot').notNull(),
  status: text('status').notNull().default('pending'),
  currency: text('currency').notNull(),
  paidMinor: bigint('paid_minor', {mode: 'bigint'}).notNull().default(0n),
  refundedMinor: bigint('refunded_minor', {mode: 'bigint'}).notNull().default(0n),
  paidAt: timestamp('paid_at', {withTimezone: true}),
  grantBusinessKey: text('grant_business_key'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  tenantIdentity: uniqueIndex('billing_orders_tenant_uq').on(table.id, table.workspaceId, table.provider),
  cashIdentity: uniqueIndex('billing_orders_cash_uq').on(table.id, table.workspaceId, table.provider, table.currency),
  grantIdentity: uniqueIndex('billing_orders_grant_key_uq').on(table.grantBusinessKey),
  workspacePaidIndex: index('billing_orders_workspace_paid_idx').on(table.workspaceId, table.paidAt, table.id),
  customerForeignKey: foreignKey({name: 'billing_orders_customer_fk', columns: [table.provider, table.customerId, table.workspaceId], foreignColumns: [billingCustomerHistory.provider, billingCustomerHistory.customerId, billingCustomerHistory.workspaceId]}),
  kindCheck: check('billing_orders_kind_check', sql`${table.kind} in ('subscription', 'pack')`),
  statusCheck: check('billing_orders_status_check', sql`${table.status} in ('pending', 'paid', 'refunded', 'held', 'failed')`),
  moneyCheck: check('billing_orders_money_check', sql`${table.paidMinor} >= 0 and ${table.refundedMinor} >= 0 and ${table.refundedMinor} <= ${table.paidMinor} and ${table.currency} ~ '^[a-z]{3}$'`),
  snapshotCheck: check('billing_orders_snapshot_check', sql`app.billing_catalog_snapshot_valid(${table.catalogSnapshot}, ${table.kind}) and ${table.catalogSnapshot}->>'currency' = ${table.currency} and ${table.catalogSnapshot}->>'provider' = ${table.provider}`),
}));

export const billingPaymentAliases = appSchema.table('billing_payment_aliases', {
  workspaceId: uuid('workspace_id').notNull(),
  provider: text('provider').notNull(),
  objectKind: text('object_kind').notNull(),
  externalId: text('external_id').notNull(),
  orderId: uuid('order_id').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  identity: primaryKey({name: 'billing_payment_aliases_pk', columns: [table.provider, table.objectKind, table.externalId]}),
  orderIndex: index('billing_payment_aliases_order_idx').on(table.workspaceId, table.orderId),
  orderForeignKey: foreignKey({name: 'billing_payment_aliases_order_fk', columns: [table.orderId, table.workspaceId, table.provider], foreignColumns: [billingOrders.id, billingOrders.workspaceId, billingOrders.provider]}),
  kindCheck: check('billing_payment_aliases_kind_check', sql`${table.objectKind} in ('checkout_session', 'invoice', 'payment_intent', 'charge')`),
  identityCheck: check('billing_payment_aliases_identity_check', sql`length(${table.externalId}) between 1 and 255`),
}));

/** Append-only confirmed observations; a reversal is a new event, never deletion of an older loss. */
export const billingCashEvents = appSchema.table('billing_cash_events', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull(),
  provider: text('provider').notNull(),
  eventKind: text('event_kind').notNull(),
  externalId: text('external_id').notNull(),
  economicLossKey: text('economic_loss_key').notNull(),
  relatedExternalId: text('related_external_id'),
  orderId: uuid('order_id').notNull(),
  amountMinor: bigint('amount_minor', {mode: 'bigint'}).notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull().default('confirmed'),
  occurredAt: timestamp('occurred_at', {withTimezone: true}).notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
}, (table) => ({
  identity: uniqueIndex('billing_cash_events_identity_uq').on(table.provider, table.eventKind, table.externalId),
  orderIndex: index('billing_cash_events_order_idx').on(table.workspaceId, table.orderId, table.occurredAt),
  economicLossIndex: index('billing_cash_events_loss_idx').on(table.provider, table.orderId, table.economicLossKey),
  orderForeignKey: foreignKey({name: 'billing_cash_events_order_fk', columns: [table.orderId, table.workspaceId, table.provider, table.currency], foreignColumns: [billingOrders.id, billingOrders.workspaceId, billingOrders.provider, billingOrders.currency]}),
  kindCheck: check('billing_cash_events_kind_check', sql`${table.eventKind} in ('refund', 'dispute_opened', 'dispute_lost', 'dispute_reversed')`),
  valueCheck: check('billing_cash_events_value_check', sql`${table.amountMinor} > 0 and ${table.status} = 'confirmed' and length(${table.externalId}) between 1 and 255`),
}));

/** Verified provider deliveries are retained separately from economic effects. */
export const billingWebhookInbox = appSchema.table('billing_webhook_inbox', {
  id: uuid('id').primaryKey(),
  provider: text('provider').notNull(),
  externalEventId: text('external_event_id').notNull(),
  eventType: text('event_type').notNull(),
  payloadHash: text('payload_hash').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('received'),
  receivedAt: timestamp('received_at', {withTimezone: true}).notNull(),
  processedAt: timestamp('processed_at', {withTimezone: true}),
}, (table) => ({
  identity: uniqueIndex('billing_webhook_inbox_identity_uq').on(table.provider, table.externalEventId),
  hashCheck: check('billing_webhook_inbox_hash_check', sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
  providerCheck: check('billing_webhook_inbox_provider_check', sql`${table.provider} in ('fixture', 'stripe')`),
  statusCheck: check('billing_webhook_inbox_status_check', sql`${table.status} in ('received', 'processed', 'failed')`),
  eventIdCheck: check('billing_webhook_inbox_event_id_check', sql`length(${table.externalEventId}) between 1 and 255`),
}));

/** Unsupported or conflicting external facts become explicit recovery work. */
export const billingReconciliationCases = appSchema.table('billing_reconciliation_cases', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => billingAccounts.workspaceId, {onDelete: 'restrict'}),
  provider: text('provider').notNull(),
  externalReference: text('external_reference').notNull(),
  reason: text('reason').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  resolvedAt: timestamp('resolved_at', {withTimezone: true}),
}, (table) => ({
  identity: uniqueIndex('billing_reconciliation_cases_identity_uq').on(table.provider, table.externalReference, table.reason),
  providerCheck: check('billing_reconciliation_cases_provider_check', sql`${table.provider} in ('fixture', 'stripe')`),
  statusCheck: check('billing_reconciliation_cases_status_check', sql`${table.status} in ('open', 'resolved')`),
  referenceCheck: check('billing_reconciliation_cases_reference_check', sql`length(${table.externalReference}) between 1 and 255 and length(trim(${table.reason})) > 0`),
  resolutionCheck: check('billing_reconciliation_cases_resolution_check', sql`(${table.status} = 'open' and ${table.resolvedAt} is null) or (${table.status} = 'resolved' and ${table.resolvedAt} is not null)`),
}));

/** Durable operator/test-mode refund intent. A remote result may remain unknown. */
export const billingRefundRequests = appSchema.table('billing_refund_requests', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => billingAccounts.workspaceId, {onDelete: 'restrict'}),
  orderId: uuid('order_id').notNull(),
  provider: text('provider').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  amountMinor: bigint('amount_minor', {mode: 'bigint'}).notNull(),
  currency: text('currency').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'),
  externalId: text('external_id'),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
  resolvedAt: timestamp('resolved_at', {withTimezone: true}),
}, (table) => ({
  identity: uniqueIndex('billing_refund_requests_identity_uq').on(table.provider, table.idempotencyKey),
  orderIndex: index('billing_refund_requests_order_idx').on(table.workspaceId, table.orderId, table.createdAt),
  orderForeignKey: foreignKey({name: 'billing_refund_requests_order_fk', columns: [table.orderId, table.workspaceId, table.provider], foreignColumns: [billingOrders.id, billingOrders.workspaceId, billingOrders.provider]}),
  providerCheck: check('billing_refund_requests_provider_check', sql`${table.provider} in ('fixture', 'stripe')`),
  statusCheck: check('billing_refund_requests_status_check', sql`${table.status} in ('pending', 'confirmed', 'failed', 'unknown')`),
  valueCheck: check('billing_refund_requests_value_check', sql`${table.amountMinor} > 0 and ${table.currency} ~ '^[a-z]{3}$' and length(${table.reason}) between 1 and 500`),
  resolutionCheck: check('billing_refund_requests_resolution_check', sql`(${table.status} in ('pending', 'unknown') and ${table.resolvedAt} is null) or (${table.status} in ('confirmed', 'failed') and ${table.resolvedAt} is not null)`),
}));
