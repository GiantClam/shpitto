import { integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The application schema is owned by the Drizzle migration chain. This table
 * reserves that ownership without importing or mirroring the archived model.
 */
export const appSchema = pgSchema('app');

export const schemaOwnership = appSchema.table('schema_ownership', {
  key: text('key').primaryKey(),
  owner: text('owner').notNull(),
  version: integer('version').notNull(),
  createdAt: timestamp('created_at', {withTimezone: true}).notNull(),
});
