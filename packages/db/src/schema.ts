import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("shpitto_accounts", {
  id: text("id").primaryKey(),
  accountKey: text("account_key").notNull(),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable("shpitto_users", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  email: text("email"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projects = sqliteTable("shpitto_projects", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  name: text("name").notNull(),
  configJson: text("config_json").notNull(),
  r2SnapshotKey: text("r2_snapshot_key"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const deployments = sqliteTable("shpitto_deployments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  environment: text("environment").notNull(),
  status: text("status").notNull(),
  url: text("url"),
  r2BundlePrefix: text("r2_bundle_prefix"),
  createdAt: text("created_at").notNull(),
});

export const projectSites = sqliteTable("shpitto_project_sites", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  siteKey: text("site_key").notNull(),
  deploymentHost: text("deployment_host"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const contactSubmissions = sqliteTable("shpitto_contact_submissions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  accountId: text("account_id").notNull().references(() => accounts.id),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  sourceApp: text("source_app").notNull(),
  siteKey: text("site_key").notNull().references(() => projectSites.siteKey),
  submissionJson: text("submission_json").notNull(),
  visitorIp: text("visitor_ip"),
  userAgent: text("user_agent"),
  origin: text("origin"),
  referer: text("referer"),
  r2ObjectKey: text("r2_object_key"),
  createdAt: text("created_at").notNull(),
});

