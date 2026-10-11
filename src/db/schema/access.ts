import {check, index, integer, text, timestamp} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';

import {authUser} from './auth.ts';
import {appSchema} from './ownership.ts';

/** Domain-owned account access state; Better Auth remains the identity authority. */
export const userAccessControls = appSchema.table('user_access_controls', {
  userId: text('user_id').primaryKey().references(() => authUser.id, {onDelete: 'cascade'}),
  status: text('status').notNull().default('active'),
  disabledAt: timestamp('disabled_at', {withTimezone: true}),
  reason: text('reason'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
  updatedAt: timestamp('updated_at', {withTimezone: true}).notNull(),
}, (table) => ({
  statusIndex: index('user_access_controls_status_idx').on(table.status),
  statusCheck: check('user_access_controls_status_check', sql`${table.status} in ('active', 'disabled')`),
  disabledAtCheck: check('user_access_controls_disabled_at_check', sql`(${table.status} = 'active' and ${table.disabledAt} is null) or (${table.status} = 'disabled' and ${table.disabledAt} is not null)`),
  versionCheck: check('user_access_controls_version_check', sql`${table.version} > 0`),
}));
