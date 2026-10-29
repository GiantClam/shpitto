import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

const databaseUrl = process.env.M0_DATABASE_URL;
if (!databaseUrl) throw new Error('M0_DATABASE_URL is required');

const migrationPath = resolve(import.meta.dirname, 'migrations/0000_m0_foundation.sql');
const migration = readFileSync(migrationPath, 'utf8');
const migrationSha256 = createHash('sha256').update(migration).digest('hex');
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
const db = drizzle(client);

await db.execute(sql.raw(migration));
const existingProbeRole = await client.query("select 1 from pg_roles where rolname = 'm0_probe'");
if (existingProbeRole.rowCount) {
  await client.query("drop owned by m0_probe");
  await client.query("drop role m0_probe");
}
await client.query("create role m0_probe nologin");
await client.query("grant usage on schema public to m0_probe");
await client.query("grant execute on function m0_prod_set_workspace_context(text) to m0_probe");
await client.query("grant select, insert, update on m0_prod_workspace, m0_prod_workspace_member, m0_prod_credit_ledger, m0_prod_audit_event, m0_prod_outbox_event to m0_probe");
await client.query("grant usage, select on all sequences in schema public to m0_probe");

await client.query("set row_security = off");
await client.query("truncate m0_prod_outbox_event, m0_prod_audit_event, m0_prod_credit_ledger, m0_prod_workspace_member, m0_prod_workspace restart identity cascade");
await client.query("insert into m0_prod_workspace (id) values ('workspace-a'), ('workspace-b')");
await client.query("insert into m0_prod_workspace_member (workspace_id, user_id, role) values ('workspace-a', 'user-a', 'owner'), ('workspace-b', 'user-b', 'owner')");
await client.query("reset row_security");
await client.query("set role m0_probe");
await client.query("select m0_prod_set_workspace_context('workspace-a')");

const ownWorkspace = await client.query("select id from m0_prod_workspace order by id");
const ownLedger = await client.query("insert into m0_prod_credit_ledger (workspace_id, idempotency_key, amount) values ('workspace-a', 'rls-pass', 10) returning workspace_id, amount");
const crossTenantVisible = await client.query("select id from m0_prod_workspace where id = 'workspace-b'");

let crossTenantInsertRejected = false;
try {
  await client.query("insert into m0_prod_credit_ledger (workspace_id, idempotency_key, amount) values ('workspace-b', 'rls-fail', 10)");
} catch (error) {
  crossTenantInsertRejected = error?.code === '42501';
  await client.query('rollback');
}

await client.query('reset role');
await client.query("drop owned by m0_probe");
await client.query("drop role m0_probe");
await client.end();

const result = {
  migrationSha256,
  migrationAppliedBy: 'drizzle-orm/node-postgres',
  forceRowLevelSecurity: true,
  ownWorkspaceRows: ownWorkspace.rows,
  ownLedgerRows: ownLedger.rows,
  crossTenantVisibleRows: crossTenantVisible.rows,
  crossTenantInsertRejected,
};
if (ownWorkspace.rows.length !== 1 || ownWorkspace.rows[0].id !== 'workspace-a' || ownLedger.rows.length !== 1 || crossTenantVisible.rows.length !== 0 || !crossTenantInsertRejected) {
  throw new Error(`migration RLS probe failed: ${JSON.stringify(result)}`);
}
console.log(JSON.stringify(result));
