import {resolve} from 'node:path';
import {deepStrictEqual} from 'node:assert/strict';
import {drizzle} from 'drizzle-orm/node-postgres';
import {eq, sql} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../src/db/schema/credit.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {workspaceMembers, creditAccounts, creditAllocations, creditGrants, creditReservations, workspaces} from '../src/db/schema/workspace.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {reserveCredits} from '../src/modules/credits/reserve.ts';
import {completePersonalWorkspaceOnboarding} from '../src/modules/workspaces/onboard.ts';

const actorUserId = 'probe-credit-reservation-actor';
const workspaceId = '00000000-0000-4000-8000-000000000911';
const raceWorkspaceId = '00000000-0000-4000-8000-000000000912';
const onboardingUserId = 'probe-credit-reservation-onboard';
const now = new Date('2026-01-01T00:00:00.000Z');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function cleanup(pool: {query: (text: string, values?: unknown[]) => Promise<unknown>}): Promise<void> {
  await pool.query('delete from app.command_results where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.outbox_events where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.audit_events where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.credit_ledger_entries where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.credit_allocations where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.credit_reservations where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.credit_grants where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.credit_accounts where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.workspace_members where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  await pool.query('delete from app.workspaces where id in ($1::uuid, $2::uuid)', [workspaceId, raceWorkspaceId]);
  const onboardingWorkspace = '(select id from app.workspaces where created_by = $1)';
  await pool.query(`delete from app.command_results where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.outbox_events where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.audit_events where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.credit_ledger_entries where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.credit_allocations where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.credit_reservations where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.credit_grants where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.credit_accounts where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.workspace_members where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query(`delete from app.billing_accounts where workspace_id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query('delete from app.workspace_setups where user_id = $1', [onboardingUserId]);
  await pool.query(`delete from app.workspaces where id in ${onboardingWorkspace}`, [onboardingUserId]);
  await pool.query('delete from "user" where id in ($1, $2)', [actorUserId, onboardingUserId]);
}

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  await migrationClient.end();

  const database = createDatabase({max: 8});
  const second = createDatabase({max: 8});
  try {
    await cleanup(database.pool);
    await database.pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at)
       values ($1, 'Credit Reservation Probe', $2, true, $3, $3),
              ($4, 'Onboarding Probe', $5, true, $3, $3)`,
      [actorUserId, `${actorUserId}@example.test`, now, onboardingUserId, `${onboardingUserId}@example.test`],
    );
    await database.pool.query(
      `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
       values ($1::uuid, 'team', 'Credit Reservation Probe', $3, $4, $4),
              ($2::uuid, 'team', 'Credit Reservation Race', $3, $4, $4)`,
      [workspaceId, raceWorkspaceId, actorUserId, now],
    );
    await database.pool.query(
      `insert into app.workspace_members (workspace_id, user_id, role, created_at)
       values ($1::uuid, $3, 'owner', $4), ($2::uuid, $3, 'owner', $4)`,
      [workspaceId, raceWorkspaceId, actorUserId, now],
    );
    await database.pool.query(
      `insert into app.credit_accounts (workspace_id, created_at, updated_at)
       values ($1::uuid, $3, $3), ($2::uuid, $3, $3)`,
      [workspaceId, raceWorkspaceId, now],
    );

    await issueGrant(database.db, {
      actorUserId, workspaceId, commandName: 'probe.grant', commandKey: 'subscription', businessKey: 'probe-reservation-subscription',
      source: 'subscription', amount: 20n, expiresAt: new Date('2026-01-02T00:00:00.000Z'), payload: {source: 'subscription', amount: '20'},
    });
    await issueGrant(database.db, {
      actorUserId, workspaceId, commandName: 'probe.grant', commandKey: 'purchase', businessKey: 'probe-reservation-purchase',
      source: 'purchase', amount: 100n, expiresAt: null, payload: {source: 'purchase', amount: '100'},
    });
    await issueGrant(database.db, {
      actorUserId, workspaceId, commandName: 'probe.grant', commandKey: 'expired', businessKey: 'probe-reservation-expired',
      source: 'subscription', amount: 100n, expiresAt: new Date('2025-12-31T23:59:00.000Z'), payload: {source: 'subscription', amount: '100'},
    });

    const quote = createServerQuote(DEFAULT_MODEL_ID, '4', {now});
    const first = await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-reserve-1', quote, clientDisplayedPrice: '1', now});
    const replay = await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-reserve-1', quote, clientDisplayedPrice: '999999', now});
    assert(!first.replayed && replay.replayed && replay.value.reservationId === first.value.reservationId, 'Reservation replay must return the same result.');
    assert(first.value.allocations.length === 2 && first.value.allocations[0]?.amount === '20', `FEFO must spend the expiring grant first: ${JSON.stringify(first.value)}`);

    let forgedRejected = false;
    try {
      await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-reserve-forged', quote: {...quote, unitCost: '1'}, now});
    } catch { forgedRejected = true; }
    assert(forgedRejected, 'Forged client price must not bind the ledger.');

    let staleCatalogRejected = false;
    try {
      await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-reserve-stale', quote, profile: 'production', now});
    } catch { staleCatalogRejected = true; }
    assert(staleCatalogRejected, 'A quote from a disabled catalog must be rejected.');

    const raceQuote = createServerQuote(DEFAULT_MODEL_ID, '4', {now});
    await issueGrant(database.db, {
      actorUserId, workspaceId: raceWorkspaceId, commandName: 'probe.race-grant', commandKey: 'race', businessKey: 'probe-reservation-race-grant',
      source: 'manual', amount: 50n, expiresAt: null, payload: {source: 'manual', amount: '50'},
    });
    const raceResults = await Promise.allSettled(Array.from({length: 10}, (_, index) =>
      reserveCredits(index % 2 === 0 ? database.db : second.db, {actorUserId, workspaceId: raceWorkspaceId, idempotencyKey: `probe-race-${index}`, quote: raceQuote, now}),
    ));
    const fulfilled = raceResults.filter((result) => result.status === 'fulfilled');
    assert(fulfilled.length === 1, 'Concurrent reservations must allow only one affordable request.');
    const raceReservations = await database.db.select({count: sql<number>`count(*)`}).from(creditReservations).where(eq(creditReservations.workspaceId, raceWorkspaceId));
    assert(Number(raceReservations[0]?.count ?? 0) === 1, 'Failed concurrent reservation must leave no reservation row.');
    for (const result of raceResults) {
      if (result.status === 'rejected') assert(result.reason instanceof DomainError && result.reason.code === 'CONFLICT', 'Overspend losers must fail with a domain conflict.');
    }
    const raceState = await database.pool.query(`select available::text, reserved::text,
      (select count(*)::int from app.credit_allocations where workspace_id = $1::uuid) as allocations,
      (select count(*)::int from app.credit_ledger_entries where workspace_id = $1::uuid) as ledger,
      (select count(*)::int from app.command_results where workspace_id = $1::uuid) as commands,
      (select count(*)::int from app.audit_events where workspace_id = $1::uuid) as audit,
      (select count(*)::int from app.outbox_events where workspace_id = $1::uuid) as outbox
      from app.credit_grants where workspace_id = $1::uuid`, [raceWorkspaceId]);
    deepStrictEqual(raceState.rows, [{available: '10', reserved: '40', allocations: 1, ledger: 2, commands: 1, audit: 2, outbox: 2}]);

    const onboardingResults = await Promise.all([
      completePersonalWorkspaceOnboarding(database.db, onboardingUserId, 'Onboarding', {fundDemoCredits: true, profile: 'local', now}),
      completePersonalWorkspaceOnboarding(database.db, onboardingUserId, 'Onboarding', {fundDemoCredits: true, profile: 'local', now}),
    ]);
    assert(new Set(onboardingResults.map((result) => result.demoGrantId)).size === 1, 'Concurrent onboarding funding must converge on one demo grant.');
    let productionRejected = false;
    try {
      await completePersonalWorkspaceOnboarding(database.db, onboardingUserId, 'Onboarding', {fundDemoCredits: true, profile: 'production', now});
    } catch { productionRejected = true; }
    assert(productionRejected, 'Production must reject demo funding.');

    console.log(JSON.stringify({
      status: 'PASS',
      replayed: replay.replayed,
      fefoAllocation: first.value.allocations.map((allocation) => allocation.amount),
      expiredUnreservedExcluded: true,
      forgedPriceRejected: forgedRejected,
      staleCatalogRejected,
      concurrentAffordableReservations: fulfilled.length,
      raceAttempts: 10,
      failedRaceEffects: 0,
      onboardingDemoGrantSingleEffect: true,
      productionDemoRejected: productionRejected,
    }));
  } finally {
    await cleanup(database.pool);
    await database.pool.end();
    await second.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
