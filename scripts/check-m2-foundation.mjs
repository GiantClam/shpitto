import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const migration = read('src/db/migrations/0001_identity_workspace.sql');
const journal = JSON.parse(read('src/db/migrations/meta/_journal.json'));
const fixture = read('tests/fixtures/workspaces.ts');
const probe = read('scripts/probe-m2-foundation.ts');
const workspaceSchema = read('src/db/schema/workspace.ts');

for (const required of [
  'create table if not exists "user"',
  'create table if not exists app.workspaces',
  'create table if not exists app.workspace_members',
  'create table if not exists app.workspace_setups',
  'create table if not exists app.credit_grants',
  'credit_allocations_grant_workspace_fk',
  'timestamptz',
]) {
  if (!migration.includes(required)) failures.push(`M2 migration is missing ${required}`);
}
if ((journal.entries?.length ?? 0) < 8 || journal.entries?.[0]?.tag !== '0000_foundation' || !journal.entries.some((entry) => entry.tag === '0001_identity_workspace') || !journal.entries.some((entry) => entry.tag === '0007_credit_ledger_audit')) {
  failures.push('M2 migration journal must contain the foundation, identity/workspace and credit-ledger entries');
}
for (const required of ['fixture-user-a', 'fixture-user-b', 'fixture-user-c', 'W1', 'W2', 'assertSameWorkspaceLineage']) {
  if (!fixture.includes(required)) failures.push(`workspace fixture is missing ${required}`);
}
for (const required of ['migrate(db', 'crossTenantRejected', 'rollbackObserved', 'drizzle.__drizzle_migrations']) {
  if (!probe.includes(required)) failures.push(`M2 foundation probe is missing ${required}`);
}
if (!workspaceSchema.includes('appSchema.table(') || workspaceSchema.includes('pgTable(')) {
  failures.push('workspace schema must target the app schema through appSchema.table');
}
for (const required of ['personalCreatorUnique', 'versionCheck', 'drizzleWorkspaceRows']) {
  if (!workspaceSchema.includes(required) && required !== 'drizzleWorkspaceRows') failures.push(`workspace schema is missing ${required}`);
  if (!probe.includes(required) && required === 'drizzleWorkspaceRows') failures.push('M2 foundation probe must query the Drizzle workspace table');
}
if (/legacy\/|apps\/|builder\/|packages\/|sites\//i.test(migration)) failures.push('M2 migration references archived source prefixes');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('M2 identity/workspace foundation contract passed.');
