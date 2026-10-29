import {randomUUID} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, writeFile, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {Client} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {getServerEnv} from '../src/config/env.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {DomainError} from '../src/db/contracts.ts';
import * as schema from '../src/db/schema/index.ts';
import {getCreditBalance} from '../src/modules/credits/queries.ts';
import {reserveCredits} from '../src/modules/credits/reserve.ts';

const legacyUserId = 'probe-credit-migration-user';
const legacyWorkspaceId = '00000000-0000-4000-8000-000000000931';
const legacyGrantId = '00000000-0000-4000-8000-000000000932';
const legacyAllocationId = '00000000-0000-4000-8000-000000000933';
const modernWorkspaceId = '00000000-0000-4000-8000-000000000934';
const unfundedTeamWorkspaceId = '00000000-0000-4000-8000-000000000937';
const modernGrantId = '00000000-0000-4000-8000-000000000935';
const unallocatedGrantId = '00000000-0000-4000-8000-000000000936';
const historicalTime = new Date('2026-01-01T00:00:00.000Z');
const sourceExpiry = new Date('2027-01-01T00:00:00.000Z');
const reserveTime = new Date('2026-10-01T00:00:00.000Z');

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function removeTemporaryFolder(folder: string): Promise<void> {
  const offset = relative(resolve(tmpdir()), resolve(folder));
  assert(offset !== '' && !offset.startsWith('..') && !isAbsolute(offset), 'Refusing to delete outside the temporary directory.');
  await rm(folder, {recursive: true, force: true});
}

async function writeLegacyJournal(target: string, entryCount: number): Promise<void> {
  const source = resolve(process.cwd(), 'src/db/migrations');
  const journal = JSON.parse(await readFile(join(source, 'meta', '_journal.json'), 'utf8')) as {version: string; dialect: string; entries: Array<{tag: string}>};
  for (const entry of journal.entries.slice(0, entryCount)) {
    await copyFile(join(source, `${entry.tag}.sql`), join(target, `${entry.tag}.sql`));
  }
  await writeFile(join(target, 'meta', '_journal.json'), `${JSON.stringify({...journal, entries: journal.entries.slice(0, entryCount)}, null, 2)}\n`, 'utf8');
}

async function seedLegacyRows(client: Client): Promise<void> {
  await client.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, 'Migration Probe', $2, true, $3, $3)`,
    [legacyUserId, `${legacyUserId}@example.test`, historicalTime],
  );
  await client.query(
    `insert into app.workspaces (id, kind, name, created_by) values
       ($1::uuid, 'team', 'Legacy Migration Probe', $3),
       ($2::uuid, 'team', 'Modern Migration Probe', $3),
       ($4::uuid, 'team', 'Missing Team Credit Account Probe', $3)`,
    [legacyWorkspaceId, modernWorkspaceId, legacyUserId, unfundedTeamWorkspaceId],
  );
  await client.query('insert into app.credit_accounts (workspace_id) values ($1::uuid), ($2::uuid)', [legacyWorkspaceId, modernWorkspaceId]);
  await client.query(
    `insert into app.credit_grants (id, workspace_id, source, issued, available, reserved, consumed, expired, voided, expires_at, business_key, created_at)
     values ($1::uuid, $2::uuid, 'subscription', 55, 25, 10, 10, 5, 5, $3, 'probe-legacy-grant', $4),
            ($5::uuid, $2::uuid, 'purchase', 12, 12, 0, 0, 0, 0, null, 'probe-legacy-unallocated', $4)`,
    [legacyGrantId, legacyWorkspaceId, sourceExpiry, historicalTime, unallocatedGrantId],
  );
  await client.query(
    `insert into app.credit_allocations (id, workspace_id, grant_id, amount, source_expiry, created_at)
     values ($1::uuid, $2::uuid, $3::uuid, 10, $4, $5)`,
    [legacyAllocationId, legacyWorkspaceId, legacyGrantId, sourceExpiry, historicalTime],
  );
}

async function seedCorruptedModernGrant(client: Client): Promise<void> {
  await client.query(
    `insert into app.credit_grants (id, workspace_id, source, issued, available, reserved, consumed, expired, voided, business_key)
     values ($1::uuid, $2::uuid, 'purchase', 30, 10, 20, 0, 0, 0, 'probe-modern-corrupted')`,
    [modernGrantId, modernWorkspaceId],
  );
  await client.query(
    `insert into app.credit_ledger_entries (id, workspace_id, grant_id, entry_type, available_delta, reserved_delta, consumed_delta, expired_delta, voided_delta, business_key, created_at)
     values ($1::uuid, $2::uuid, $3::uuid, 'grant_issued', 30, 0, 0, 0, 0, 'probe-modern-issued', now())`,
    [randomUUID(), modernWorkspaceId, modernGrantId],
  );
  await client.query(`insert into app.credit_grants (id, workspace_id, source, issued, available, reserved, consumed, expired, voided, business_key)
    values ($1::uuid, $2::uuid, 'purchase', 17, 17, 0, 0, 0, 0, 'probe-modern-missing-ledger')`, [randomUUID(), modernWorkspaceId]);
}

async function grantSnapshot(client: Client): Promise<string> {
  const result = await client.query(
    `select id, workspace_id, source, issued::text, available::text, reserved::text,
            consumed::text, expired::text, voided::text, expires_at, business_key, created_at
     from app.credit_grants order by id`,
  );
  return JSON.stringify(result.rows);
}

async function verifyUpgrade(client: Client, legacyFolder: string): Promise<void> {
  const db = drizzle(client, {schema});
  await migrate(db, {migrationsFolder: legacyFolder});
  await seedLegacyRows(client);
  const captureSql = await readFile(resolve(process.cwd(), 'src/db/legacy-credit-baseline.sql'), 'utf8');
  await client.query(captureSql);
  await writeLegacyJournal(legacyFolder, 8);
  await migrate(db, {migrationsFolder: legacyFolder});
  await seedCorruptedModernGrant(client);
  await client.query(captureSql);
  const captured = await client.query('select count(*)::int as count from app.credit_legacy_baselines');
  assert(captured.rows[0]?.count === 2, 'A database with an existing ledger must not capture modern grants as legacy.');
  const originalGrants = await grantSnapshot(client);
  await migrate(db, {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  assert(await grantSnapshot(client) === originalGrants, 'Upgrade changed legacy or modern grant balances or timestamps.');
  const repairedTeam = await client.query<{version: string}>(
    'select version::text from app.credit_accounts where workspace_id = $1::uuid', [unfundedTeamWorkspaceId],
  );
  assert(repairedTeam.rows.length === 1 && repairedTeam.rows[0]?.version === '0', 'Upgrade did not initialize one zero-balance team account.');
  assert((await client.query('select 1 from app.credit_grants where workspace_id = $1::uuid', [unfundedTeamWorkspaceId])).rows.length === 0, 'Upgrade issued an unapproved team grant.');
  const linked = await client.query<{reservation_id: string; amount: string; source_expiry: Date; created_at: Date; reservation_created_at: Date; command_name: string; status: string}>(
    `select allocation.reservation_id, allocation.amount::text, allocation.source_expiry,
            allocation.created_at, reservation.created_at as reservation_created_at,
            reservation.command_name, reservation.status
     from app.credit_allocations allocation
     join app.credit_reservations reservation on reservation.id = allocation.reservation_id
     where allocation.id = $1::uuid and allocation.workspace_id = $2::uuid`,
    [legacyAllocationId, legacyWorkspaceId],
  );
  const allocation = linked.rows[0];
  assert(allocation?.reservation_id && allocation.amount === '10', 'Historical allocation was not linked with its original amount.');
  assert(allocation.command_name === 'credits.legacy-allocation' && allocation.status === 'released', 'Historical allocation must remain ineligible for settlement.');
  assert(allocation.created_at.toISOString() === historicalTime.toISOString() && allocation.reservation_created_at.toISOString() === historicalTime.toISOString(), 'Historical allocation timestamp changed.');
  assert(allocation.source_expiry.toISOString() === sourceExpiry.toISOString(), 'Historical allocation source expiry changed.');

  const balance = await getCreditBalance(db, legacyWorkspaceId, reserveTime);
  assert(!balance.held && balance.available === '37' && balance.reserved === '10' && balance.consumed === '10' && balance.expired === '5' && balance.voided === '5', 'Legacy opening balance did not preserve and reconcile every bucket.');
  const entriesBeforeReplay = await client.query<{entry_type: string; workspace_id: string; created_at: Date}>('select * from app.credit_ledger_entries order by id');
  const openings = entriesBeforeReplay.rows.filter((row) => row.entry_type === 'opening_snapshot');
  assert(openings.length === 2 && openings.every((row) => row.workspace_id === legacyWorkspaceId), 'Opening snapshots must apply only to proven legacy grants; missing modern history must remain held.');
  assert(openings.every((row) => row.created_at > historicalTime), 'Opening snapshots must record migration time instead of fabricating historic issuance time.');
  const modernBalance = await getCreditBalance(db, modernWorkspaceId, reserveTime);
  assert(modernBalance.held && !modernBalance.rows[0]?.reconciled, 'Upgrade concealed a discrepancy in an already-ledgered grant.');
  await migrate(db, {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  // Also replay the forward SQL itself; a journal-only replay would merely skip it.
  await client.query('begin');
  try {
    await client.query(await readFile(resolve(process.cwd(), 'src/db/migrations/0010_credit_legacy_opening.sql'), 'utf8'));
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
  const entriesAfterReplay = await client.query('select * from app.credit_ledger_entries order by id');
  assert(JSON.stringify(entriesAfterReplay.rows) === JSON.stringify(entriesBeforeReplay.rows), 'Migration replay changed the opening ledger.');
  assert(await grantSnapshot(client) === originalGrants, 'Migration replay changed grant projections.');
  await client.query(await readFile(resolve(process.cwd(), 'src/db/migrations/0029_team_credit_accounts.sql'), 'utf8'));
  const replayedTeam = await client.query('select version::text from app.credit_accounts where workspace_id = $1::uuid', [unfundedTeamWorkspaceId]);
  assert(replayedTeam.rows.length === 1 && replayedTeam.rows[0]?.version === '0', 'Team account backfill replay changed an existing account.');

  const quote = createServerQuote(DEFAULT_MODEL_ID, '1', {now: reserveTime});
  await reserveCredits(db, {actorUserId: legacyUserId, workspaceId: legacyWorkspaceId, idempotencyKey: 'probe-legacy-after-upgrade', quote, now: reserveTime});
  const afterReserve = await getCreditBalance(db, legacyWorkspaceId, reserveTime);
  assert(!afterReserve.held && afterReserve.available === '27' && afterReserve.reserved === '20', 'New reservation cannot use preserved legacy available credits.');
  assert(afterReserve.rows.find((row) => row.grantId === legacyGrantId)?.allocations.some((row) => row.allocationId === legacyAllocationId && row.reservationStatus === 'released'), 'New reservation reactivated the historical allocation.');
  try {
    await reserveCredits(db, {actorUserId: legacyUserId, workspaceId: modernWorkspaceId, idempotencyKey: 'probe-modern-held-after-upgrade', quote, now: reserveTime});
    throw new Error('The corrupted modern grant was allowed to reserve.');
  } catch (error) {
    assert(error instanceof DomainError && error.code === 'CONFLICT' && error.message.includes('reconciliation hold'), 'The corrupted modern grant did not retain its reconciliation hold.');
  }
}

async function run(): Promise<void> {
  const sourceUrl = new URL(getServerEnv().databaseUrl);
  const databaseName = `shpitto_migration_probe_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  assert(/^shpitto_migration_probe_\d+_[a-f0-9]{12}$/.test(databaseName), 'Unsafe temporary database name.');
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  const probeUrl = new URL(sourceUrl);
  probeUrl.pathname = `/${databaseName}`;
  const legacyFolder = await mkdtemp(join(tmpdir(), 'shpitto-migrations-'));
  let databaseCreated = false;
  try {
    await mkdir(join(legacyFolder, 'meta'));
    await writeLegacyJournal(legacyFolder, 7);
    const admin = new Client({connectionString: adminUrl.toString()});
    await admin.connect();
    try {
      await admin.query(`create database ${databaseName}`);
      databaseCreated = true;
    } finally { await admin.end(); }
    const client = new Client({connectionString: probeUrl.toString()});
    await client.connect();
    try { await verifyUpgrade(client, legacyFolder); }
    finally { await client.end(); }
  } finally {
    try {
      if (databaseCreated) {
        // pg clients cannot reconnect after end(); use a fresh cleanup connection.
        const cleanup = new Client({connectionString: adminUrl.toString()});
        await cleanup.connect();
        try {
          await cleanup.query(`drop database ${databaseName} with (force)`);
          const remaining = await cleanup.query('select 1 from pg_database where datname = $1', [databaseName]);
          assert(remaining.rows.length === 0, 'Temporary migration database cleanup failed.');
        } finally { await cleanup.end(); }
      }
    } finally { await removeTemporaryFolder(legacyFolder); }
  }
  console.log(JSON.stringify({status: 'PASS', legacyAllocationLinked: true, allBucketsAndTimestampsPreserved: true, openingSnapshots: 2, legacyProofRequired: true, unknownLegacyReservedUnchanged: '10', legacySettlementDisabled: true, modernMissingAndPartialLedgerStillHeld: true, migrationReplayUnchanged: true, missingTeamAccountRepairedWithoutGrant: true, postUpgradeReservation: true, temporaryDatabaseRemoved: true}));
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
