import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const migrationRunner = read('scripts/migrate.ts');
const migrationSql = read('src/db/migrations/0000_foundation.sql');
const journal = JSON.parse(read('src/db/migrations/meta/_journal.json'));
const client = read('src/db/client.ts');

if (!migrationRunner.includes("from 'drizzle-orm/node-postgres/migrator'")) {
  failures.push('scripts/migrate.ts must use the Drizzle PostgreSQL migrator');
}
if (!migrationRunner.includes('pg_advisory_lock') || !migrationRunner.includes('pg_advisory_unlock')) {
  failures.push('scripts/migrate.ts must hold and release the migration advisory lock');
}
if (!migrationRunner.includes("migrationsFolder: resolve(process.cwd(), 'src/db/migrations')")) {
  failures.push('scripts/migrate.ts must resolve the reviewed root migration directory');
}
if (!client.includes('new Client') || !client.includes('createMigrationClient')) {
  failures.push('src/db/client.ts must expose a direct migration connection');
}
if (/drizzle-kit\s+(push|up)/i.test(migrationRunner) || /schema\.push\s*\(/i.test(migrationRunner)) {
  failures.push('request-time or push-based schema mutation is forbidden');
}
for (const forbidden of ['legacy/', 'apps/', 'builder/', 'packages/', 'sites/']) {
  if (migrationRunner.includes(forbidden) || migrationSql.includes(forbidden)) {
    failures.push(`database boundary references archived source prefix ${forbidden}`);
  }
}
if (
  journal.entries?.length < 2 ||
  journal.entries[0]?.tag !== '0000_foundation' ||
  journal.entries[1]?.tag !== '0001_identity_workspace'
) {
  failures.push('migration journal must contain the reviewed foundation and identity/workspace entries');
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Database boundary check passed.');
