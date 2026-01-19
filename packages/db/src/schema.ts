import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
// Note: For Supabase Postgres migration, we would switch to 'drizzle-orm/pg-core'
// and use `jsonb` instead of `text({ mode: 'json' })`.
// Keeping SQLite for now to maintain local dev compatibility with D1.

export const projects = sqliteTable('shipitto_projects', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(), // Multi-tenancy support
  name: text('name').notNull(),
  config: text('config', { mode: 'json' }).notNull(), // Stores ProjectBlueprint
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const deployments = sqliteTable('shipitto_deployments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  environment: text('environment').notNull(), // preview, production
  status: text('status').notNull(), // pending, success, failed
  url: text('url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
