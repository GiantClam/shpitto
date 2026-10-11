import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

const { Client } = pg;
const databaseUrl = process.env.M0_DATABASE_URL;
if (!databaseUrl) throw new Error('M0_DATABASE_URL is required');

const client = new Client({ connectionString: databaseUrl });
await client.connect();
const db = drizzle(client);

await db.execute(sql`
  create table if not exists m0_workspace (
    id text primary key
  );
  create table if not exists m0_credit_ledger (
    id bigserial primary key,
    workspace_id text not null references m0_workspace(id),
    idempotency_key text not null unique,
    amount integer not null check (amount >= 0)
  );
  create table if not exists m0_audit_event (
    id bigserial primary key,
    idempotency_key text not null unique,
    action text not null
  );
  create table if not exists m0_outbox_event (
    id bigserial primary key,
    idempotency_key text not null unique,
    topic text not null
  );
  truncate m0_outbox_event, m0_audit_event, m0_credit_ledger, m0_workspace restart identity;
  insert into m0_workspace (id) values ('workspace-a') on conflict do nothing;
`);

async function command(key, amount, injectFailure = false) {
  return db.transaction(async (tx) => {
    const inserted = await tx.execute(sql`
      insert into m0_credit_ledger (workspace_id, idempotency_key, amount)
      values ('workspace-a', ${key}, ${amount})
      on conflict (idempotency_key) do nothing
      returning id
    `);
    if (inserted.rows.length === 0) return { duplicate: true };
    if (injectFailure) throw new Error('injected-domain-failure');
    await tx.execute(sql`insert into m0_audit_event (idempotency_key, action) values (${key}, 'credit.command')`);
    await tx.execute(sql`insert into m0_outbox_event (idempotency_key, topic) values (${key}, 'credit.changed')`);
    return { duplicate: false };
  });
}

await command('cmd-success', 10);
await command('cmd-success', 10);
let rolledBack = false;
try {
  await command('cmd-failure', 20, true);
} catch (error) {
  rolledBack = error instanceof Error && error.message === 'injected-domain-failure';
}
const counts = await db.execute(sql`
  select
    (select count(*)::int from m0_credit_ledger) as ledger_count,
    (select count(*)::int from m0_audit_event) as audit_count,
    (select count(*)::int from m0_outbox_event) as outbox_count,
    (select count(*)::int from m0_credit_ledger where idempotency_key = 'cmd-failure') as failed_ledger_count
`);
const result = { duplicateSuppressed: true, injectedFailureRolledBack: rolledBack, counts: counts.rows[0] };
if (!result.duplicateSuppressed || !result.injectedFailureRolledBack || result.counts.ledger_count !== 1 || result.counts.audit_count !== 1 || result.counts.outbox_count !== 1 || result.counts.failed_ledger_count !== 0) {
  throw new Error(`transaction probe failed: ${JSON.stringify(result)}`);
}
console.log(JSON.stringify(result));
await client.end();
