import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvText(text: string) {
  const entries: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = stripQuotes(line.slice(eqIndex + 1));
    if (!key) continue;
    entries[key] = value;
  }
  return entries;
}

export function getSharedEnvFiles() {
  const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = path.resolve(workerRoot, "..", "..");
  return [
    path.resolve(repoRoot, ".env"),
    path.resolve(repoRoot, "apps", "web", ".env"),
    path.resolve(repoRoot, "apps", "web", ".env.local"),
  ];
}

export function loadSharedEnv() {
  const loaded: string[] = [];
  for (const envPath of getSharedEnvFiles()) {
    if (!fs.existsSync(envPath)) continue;
    const parsed = parseEnvText(fs.readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (!String(process.env[key] || "").trim()) {
        process.env[key] = value;
      }
    }
    loaded.push(envPath);
  }
  return loaded;
}

export function getContactEmailWorkerEnvConfig() {
  const accountId = String(process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(process.env.CLOUDFLARE_EMAIL_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || "").trim();
  const d1DatabaseId = String(process.env.CLOUDFLARE_D1_DATABASE_ID || process.env.D1_DATABASE_ID || "").trim();
  const emailFrom = String(process.env.CLOUDFLARE_EMAIL_FROM || process.env.EMAIL_FROM || "").trim();
  const batchSize = String(process.env.CONTACT_EMAIL_BATCH_SIZE || "10").trim() || "10";
  const maxRetries = String(process.env.SHPITTO_CONTACT_EMAIL_MAX_RETRIES || "3").trim() || "3";
  const cron = String(process.env.CONTACT_EMAIL_CRON || "*/1 * * * *").trim() || "*/1 * * * *";
  const healthToken = String(process.env.CONTACT_EMAIL_HEALTH_TOKEN || "").trim();

  return {
    accountId,
    apiToken,
    d1DatabaseId,
    emailFrom,
    batchSize,
    maxRetries,
    cron,
    healthToken,
  };
}

export function buildWranglerToml(config: ReturnType<typeof getContactEmailWorkerEnvConfig>) {
  const escapedFrom = config.emailFrom.replace(/"/g, '\\"');
  const escapedAccountId = config.accountId.replace(/"/g, '\\"');
  const escapedCron = config.cron.replace(/"/g, '\\"');
  const escapedBatchSize = config.batchSize.replace(/"/g, '\\"');
  const escapedRetries = config.maxRetries.replace(/"/g, '\\"');
  const escapedDatabaseId = config.d1DatabaseId.replace(/"/g, '\\"');

  return [
    'name = "shpitto-contact-email-worker"',
    'main = "src/index.ts"',
    'compatibility_date = "2026-05-18"',
    "workers_dev = true",
    "",
    "[vars]",
    `CLOUDFLARE_ACCOUNT_ID = "${escapedAccountId}"`,
    `CLOUDFLARE_EMAIL_FROM = "${escapedFrom}"`,
    `CONTACT_EMAIL_BATCH_SIZE = "${escapedBatchSize}"`,
    `SHPITTO_CONTACT_EMAIL_MAX_RETRIES = "${escapedRetries}"`,
    "",
    "[triggers]",
    `crons = ["${escapedCron}"]`,
    "",
    "[[d1_databases]]",
    'binding = "EMAIL_QUEUE_DB"',
    'database_name = "shpitto-prod"',
    `database_id = "${escapedDatabaseId}"`,
    "",
  ].join("\n");
}
