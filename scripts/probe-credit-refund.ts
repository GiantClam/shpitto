import {resolve} from 'node:path';
import {deepStrictEqual, rejects} from 'node:assert/strict';
import {drizzle} from 'drizzle-orm/node-postgres';
import {eq, sql} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {creditLedgerEntries} from '../src/db/schema/credit.ts';
import {creditAccounts, creditAllocations, creditGrants, creditReservations} from '../src/db/schema/workspace.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {reserveCredits} from '../src/modules/credits/reserve.ts';
import {settleReservation} from '../src/modules/credits/settle.ts';
import {sweepExpiredCredits} from '../src/modules/credits/expiry.ts';
import {getCreditBalance} from '../src/modules/credits/queries.ts';

const actorUserId = 'probe-credit-refund-actor';
const workspaceId = '00000000-0000-4000-8000-000000000921';
const reserveAt = new Date('2026-01-01T12:00:00.000Z');
const failAt = new Date('2026-01-02T12:00:00.000Z');

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

async function cleanup(pool: {query: (text: string, values?: unknown[]) => Promise<unknown>}): Promise<void> {
  await pool.query('delete from app.command_results where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.outbox_events where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.audit_events where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_ledger_entries where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('update app.credit_grants set origin_allocation_id = null where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_allocations where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_reservations where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_grants where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.credit_accounts where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.workspace_members where workspace_id = $1::uuid', [workspaceId]);
  await pool.query('delete from app.workspaces where id = $1::uuid', [workspaceId]);
  await pool.query('delete from "user" where id = $1', [actorUserId]);
}

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  await migrationClient.end();
  const database = createDatabase();
  try {
    await cleanup(database.pool);
    await database.pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at)
       values ($1, 'Credit Refund Probe', $2, true, $3, $3)`,
      [actorUserId, `${actorUserId}@example.test`, reserveAt],
    );
    await database.pool.query(
      `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
       values ($1::uuid, 'team', 'Credit Refund Probe', $2, $3, $3)`,
      [workspaceId, actorUserId, reserveAt],
    );
    await database.pool.query(
      `insert into app.workspace_members (workspace_id, user_id, role, created_at)
       values ($1::uuid, $2, 'owner', $3)`,
      [workspaceId, actorUserId, reserveAt],
    );
    await database.pool.query(
      `insert into app.credit_accounts (workspace_id, created_at, updated_at)
       values ($1::uuid, $2, $2)`,
      [workspaceId, reserveAt],
    );
    await issueGrant(database.db, {actorUserId, workspaceId, commandName: 'probe.refund.grant', commandKey: 'expired-sub', businessKey: 'probe-refund-expired-sub', source: 'subscription', amount: 10n, expiresAt: new Date('2026-01-01T18:00:00.000Z'), payload: {amount: '10'}});
    await issueGrant(database.db, {actorUserId, workspaceId, commandName: 'probe.refund.grant', commandKey: 'valid-sub', businessKey: 'probe-refund-valid-sub', source: 'subscription', amount: 20n, expiresAt: new Date('2026-01-10T00:00:00.000Z'), payload: {amount: '20'}});
    await issueGrant(database.db, {actorUserId, workspaceId, commandName: 'probe.refund.grant', commandKey: 'comp', businessKey: 'probe-refund-comp', source: 'compensation', amount: 5n, expiresAt: new Date('2026-01-10T00:00:00.000Z'), payload: {amount: '5'}});
    await issueGrant(database.db, {actorUserId, workspaceId, commandName: 'probe.refund.grant', commandKey: 'purchase', businessKey: 'probe-refund-purchase', source: 'purchase', amount: 20n, expiresAt: null, payload: {amount: '20'}});

    const quote = createServerQuote(DEFAULT_MODEL_ID, '4', {now: reserveAt});
    const reservation = await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-refund-reserve', quote, now: reserveAt});
    const settled = await settleReservation(database.db, {actorUserId, workspaceId, reservationId: reservation.value.reservationId, idempotencyKey: 'probe-refund-fail', outcome: 'failed', now: failAt, providerCostEvidence: {currency: 'usd', amount: '1.20'}});
    const replay = await settleReservation(database.db, {actorUserId, workspaceId, reservationId: reservation.value.reservationId, idempotencyKey: 'probe-refund-fail', outcome: 'failed', now: failAt, providerCostEvidence: {currency: 'usd', amount: '1.20'}});
    assert(!settled.replayed && replay.replayed, 'Failure settlement must replay durably.');
    let lateOutcomeRejected = false;
    try {
      await settleReservation(database.db, {actorUserId, workspaceId, reservationId: reservation.value.reservationId, idempotencyKey: 'probe-refund-late-consume', outcome: 'consumed', now: failAt});
    } catch { lateOutcomeRejected = true; }
    assert(lateOutcomeRejected, 'A late terminal outcome must not reopen or consume a settled reservation.');
    const expiredSubscription = settled.value.allocations.find((allocation) => allocation.source === 'subscription' && allocation.disposition === 'expired');
    assert(expiredSubscription && expiredSubscription.compensationGrantId, 'Expired subscription failure must create compensation.');
    assert(settled.value.allocations.some((allocation) => allocation.source === 'purchase' && allocation.disposition === 'available'), 'Purchase credits must be fully refunded as available.');
    const compensationCount = await database.db.select({count: sql<number>`count(*)`}).from(creditGrants).where(eq(creditGrants.businessKey, `credits.failure-compensation:${expiredSubscription?.allocationId}`));
    assert(Number(compensationCount[0]?.count ?? 0) === 1, 'Compensation must be issued exactly once.');
    const compensationLineage = await database.db.select({originAllocationId: creditGrants.originAllocationId}).from(creditGrants).where(eq(creditGrants.businessKey, `credits.failure-compensation:${expiredSubscription?.allocationId}`));
    assert(compensationLineage[0]?.originAllocationId === expiredSubscription?.allocationId, 'Compensation must retain allocation lineage.');
    const compensationGrant = await database.db.select().from(creditGrants).where(eq(creditGrants.id, expiredSubscription.compensationGrantId));
    assert(compensationGrant[0]?.expiresAt?.getTime() === failAt.getTime() + 7 * 24 * 60 * 60 * 1000, 'Compensation must expire exactly seven days after failure.');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const repeated = await settleReservation(database.db, {actorUserId, workspaceId, reservationId: reservation.value.reservationId, idempotencyKey: 'probe-refund-fail', outcome: 'failed', now: failAt, providerCostEvidence: {amount: '1.20', currency: 'usd'}});
      assert(repeated.replayed, 'Every reordered semantic replay must return the committed settlement.');
      deepStrictEqual(repeated.value, settled.value);
    }
    await rejects(settleReservation(database.db, {actorUserId, workspaceId, reservationId: reservation.value.reservationId, idempotencyKey: 'probe-refund-fail', outcome: 'failed', now: failAt, providerCostEvidence: {amount: '2.40', currency: 'usd'}}), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT');
    const compensationBefore = await database.db.select({count: sql<number>`count(*)`}).from(creditGrants).where(eq(creditGrants.source, 'compensation'));
    const compensationReservation = await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-refund-comp-reserve', quote: createServerQuote(DEFAULT_MODEL_ID, '1', {now: failAt}), now: failAt});
    const compensationFailure = await settleReservation(database.db, {actorUserId, workspaceId, reservationId: compensationReservation.value.reservationId, idempotencyKey: 'probe-refund-comp-fail', outcome: 'failed', now: new Date('2026-01-03T12:00:00.000Z')});
    assert(compensationFailure.value.allocations.some((allocation) => allocation.source === 'compensation' && allocation.compensationGrantId === null), 'Compensation-funded failure must retain its original expiry without renewal.');
    const compensationAfter = await database.db.select({count: sql<number>`count(*)`}).from(creditGrants).where(eq(creditGrants.source, 'compensation'));
    assert(Number(compensationAfter[0]?.count ?? 0) === Number(compensationBefore[0]?.count ?? 0), 'Compensation-funded failure must not issue a second compensation grant.');
    const balance = await getCreditBalance(database.db, workspaceId, failAt);
    assert(!balance.held, 'Refund settlement must leave a reconciled balance.');

    await issueGrant(database.db, {actorUserId, workspaceId, commandName: 'probe.refund.grant', commandKey: 'sweep', businessKey: 'probe-refund-sweep', source: 'subscription', amount: 3n, expiresAt: new Date('2026-01-01T00:00:00.000Z'), payload: {amount: '3'}});
    const sweep = await sweepExpiredCredits(database.db, workspaceId, failAt);
    assert(sweep.expiredAmount === '3' && sweep.expiredGrantIds.length === 1, 'Expiry sweep must move available expired credits exactly once.');

    await issueGrant(database.db, {actorUserId, workspaceId, commandName: 'probe.refund.grant', commandKey: 'cancel-sub', businessKey: 'probe-refund-cancel-sub', source: 'subscription', amount: 10n, expiresAt: new Date('2026-01-03T00:00:00.000Z'), payload: {amount: '10'}});
    const cancelReservation = await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-refund-cancel-reserve', quote: createServerQuote(DEFAULT_MODEL_ID, '1', {now: new Date('2026-01-02T12:00:00.000Z')}), now: new Date('2026-01-02T12:00:00.000Z')});
    const cancelled = await settleReservation(database.db, {actorUserId, workspaceId, reservationId: cancelReservation.value.reservationId, idempotencyKey: 'probe-refund-cancel', outcome: 'cancelled', now: new Date('2026-01-04T00:00:00.000Z')});
    assert(cancelled.value.allocations.some((allocation) => allocation.disposition === 'expired' && allocation.compensationGrantId === null), 'Cancelled expired allocations must expire without compensation.');
    const compensationExpiry = new Date('2026-01-09T12:00:00.000Z');
    const beforeExpiry = new Date(compensationExpiry.getTime() - 1);
    const balanceBefore = await getCreditBalance(database.db, workspaceId, beforeExpiry);
    const balanceAt = await getCreditBalance(database.db, workspaceId, compensationExpiry);
    assert(BigInt(balanceBefore.available) - BigInt(balanceAt.available) === 10n, 'Compensation must stop being spendable exactly at expiry.');
    const expiringReservation = await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-expiring-compensation', quote: createServerQuote(DEFAULT_MODEL_ID, '1', {now: beforeExpiry}), now: beforeExpiry});
    assert(expiringReservation.value.allocations[0]?.grantId === expiredSubscription.compensationGrantId, 'The retry must actually reserve the original compensation grant.');
    const expiredFailure = await settleReservation(database.db, {actorUserId, workspaceId, reservationId: expiringReservation.value.reservationId, idempotencyKey: 'probe-expired-compensation-fail', outcome: 'failed', now: new Date(compensationExpiry.getTime() + 1)});
    assert(expiredFailure.value.allocations.every((allocation) => allocation.disposition === 'expired' && allocation.compensationGrantId === null), 'An expired compensation-funded failure must not renew compensation.');
    const unchangedCompensation = await database.db.select().from(creditGrants).where(eq(creditGrants.id, expiredSubscription.compensationGrantId));
    assert(unchangedCompensation[0]?.expiresAt?.getTime() === compensationExpiry.getTime() && unchangedCompensation[0]?.expired === 10n, 'Expired compensation must retain its original expiry and amount.');
    const terminalTime = new Date('2026-01-11T00:00:00.000Z');
    const consumedReservation = await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-consume-reserve', quote: createServerQuote(DEFAULT_MODEL_ID, '1', {now: terminalTime}), now: terminalTime});
    const consumed = await settleReservation(database.db, {actorUserId, workspaceId, reservationId: consumedReservation.value.reservationId, idempotencyKey: 'probe-consume', outcome: 'consumed', now: terminalTime});
    assert(consumed.value.allocations.every((allocation) => allocation.disposition === 'consumed'), 'Success must consume every allocation.');
    const heldReservation = await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-hold-active-reserve', quote: createServerQuote(DEFAULT_MODEL_ID, '1', {now: terminalTime}), now: terminalTime});
    await database.pool.query(
      `update app.credit_grants set reserved = reserved - 1, available = available + 1
       where workspace_id = $1::uuid and source = 'purchase'`,
      [workspaceId],
    );
    const heldBalance = await getCreditBalance(database.db, workspaceId, failAt);
    assert(heldBalance.held, 'A projection mismatch must be visible as a reconciliation hold.');
    let reservationHeld = false;
    try {
      await reserveCredits(database.db, {actorUserId, workspaceId, idempotencyKey: 'probe-refund-held', quote: createServerQuote(DEFAULT_MODEL_ID, '1', {now: failAt}), now: failAt});
    } catch { reservationHeld = true; }
    assert(reservationHeld, 'A reconciliation hold must block new reservations.');
    const snapshot = async () => (await database.pool.query('select (select count(*) from app.credit_ledger_entries where workspace_id = $1::uuid)::text as ledger, (select count(*) from app.command_results where workspace_id = $1::uuid)::text as commands, (select sum(reserved) from app.credit_grants where workspace_id = $1::uuid)::text as reserved', [workspaceId])).rows;
    const beforeHeldCommands = await snapshot();
    for (const outcome of ['failed', 'cancelled', 'consumed'] as const) {
      await rejects(settleReservation(database.db, {actorUserId, workspaceId, reservationId: heldReservation.value.reservationId, idempotencyKey: `probe-held-${outcome}`, outcome, now: terminalTime}), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT' && error.message.includes('reconciliation hold'));
    }
    await rejects(sweepExpiredCredits(database.db, workspaceId, terminalTime), (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT' && error.message.includes('reconciliation hold'));
    deepStrictEqual(await snapshot(), beforeHeldCommands, 'Held commands must leave no ledger, command or projection effects.');
    const ledgerCount = await database.db.select({count: sql<number>`count(*)`}).from(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, workspaceId));
    console.log(JSON.stringify({status: 'PASS', replayCount: 20, conflictingPayloadRejected: true, replayed: replay.replayed, lateOutcomeRejected, expiredSubscriptionCompensated: true, compensationLineageRetained: true, compensationNoRenewalBeforeAndAfterExpiry: true, exactSevenDayExpiry: true, purchaseRefunded: true, successConsumed: true, cancelledExpiredNoCompensation: true, expirySweepApplied: true, reconciliationHoldVisible: heldBalance.held, allSettlementAndExpiryCommandsBlockedOnHold: true, reservationBlockedOnHold: reservationHeld, compensationCount: Number(compensationCount[0]?.count ?? 0), balanceHeld: balance.held, ledgerRows: Number(ledgerCount[0]?.count ?? 0)}));
  } finally {
    await cleanup(database.pool);
    await database.pool.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

