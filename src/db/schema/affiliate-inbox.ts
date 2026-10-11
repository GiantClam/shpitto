import {check, index, integer, text, timestamp, uuid} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {appSchema} from './ownership.ts';

export const affiliateNotificationInbox = appSchema.table('affiliate_notification_inbox', {
  eventId: uuid('event_id').primaryKey(),
  accountId: text('account_id').notNull(),
  programId: text('program_id').notNull(),
  eventType: text('event_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  action: text('action').notNull(),
  payloadDigest: text('payload_digest').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  leaseToken: text('lease_token'),
  leaseUntil: timestamp('lease_until', {withTimezone: true}),
  nextActionAt: timestamp('next_action_at', {withTimezone: true}).notNull(),
  occurredAt: timestamp('occurred_at', {withTimezone: true}).notNull(),
  receivedAt: timestamp('received_at', {withTimezone: true}).notNull(),
  processedAt: timestamp('processed_at', {withTimezone: true}),
}, (table) => ({
  pending: index('affiliate_notification_pending_idx').on(table.status, table.nextActionAt),
  statusCheck: check('affiliate_notification_status_check', sql`${table.status} in ('pending', 'processed')`),
  countsCheck: check('affiliate_notification_counts_check', sql`${table.entityId} > 0 and ${table.attempts} >= 0`),
}));
