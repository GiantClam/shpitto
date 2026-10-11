import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client, type Pool} from 'pg';

import {snapshotBillingProduct} from '../src/config/plans.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {userAccessControls} from '../src/db/schema/access.ts';
import {billingAccounts, billingCashEvents, billingCustomerHistory, billingOrders, billingRefundRequests} from '../src/db/schema/billing.ts';
import {auditEvents, outboxEvents} from '../src/db/schema/credit.ts';
import {operatorRoles} from '../src/db/schema/operator.ts';
import {requestBillingRefundAsOperator} from '../src/modules/billing/refund-command.ts';
import {deliverOperatorRefund} from '../src/modules/billing/refund-delivery.ts';
import {readPendingOperatorRefunds} from '../src/modules/billing/refund-retry.ts';
import {previewBillingRefundForOperator} from '../src/modules/billing/refund-preview.ts';
import {administerOperatorOwner} from '../src/modules/operations/bootstrap.ts';
import {recordTrustedSecondFactor} from '../src/modules/operations/authorize.ts';
import {disableOperatorUser, setOperatorRole} from '../src/modules/operations/commands.ts';
import {disableUser} from '../src/modules/operations/status-commands.ts';
import {createTeamWorkspace} from '../src/modules/workspaces/commands.ts';

for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const configured = new URL(globalThis.process['env'].DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname), 'Privileged probe requires local PostgreSQL.');
const databaseName = `m6_privileged_probe_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(configured); adminUrl.pathname = '/postgres';
const databaseUrl = new URL(configured); databaseUrl.pathname = `/${databaseName}`;
const admin = new Client({connectionString: adminUrl.toString()});
const now = new Date();
const conflict = (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT';
const forbidden = (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN';

async function run(): Promise<void> {
  let created = false;
  let pool: Pool | undefined;
  const cases: string[] = [];
  await admin.connect();
  try {
    await admin.query(`create database "${databaseName}"`); created = true;
    const migration = new Client({connectionString: databaseUrl.toString()});
    await migration.connect();
    try { await migrate(drizzle(migration), {migrationsFolder: 'src/db/migrations'}); } finally { await migration.end(); }
    const database = createDatabase({connectionString: databaseUrl.toString(), max: 8}); pool = database.pool;
    const db = database.db;
    await db.insert(authUser).values(['owner', 'second', 'operator', 'unverified'].map((id) => ({id, name: id, email: `${id}@example.test`, emailVerified: id !== 'unverified', twoFactorEnabled: id !== 'unverified', createdAt: now, updatedAt: now})));
    const bootstrap = {mode: 'bootstrap' as const, targetUserId: 'owner', reason: 'Initialize disposable test owner', changeReference: 'local-probe-ticket'};
    await assert.rejects(administerOperatorOwner(db, {...bootstrap, targetUserId: 'unverified', apply: true}), forbidden);
    assert.equal((await administerOperatorOwner(db, bootstrap)).applied, false);
    assert.equal((await db.select().from(operatorRoles)).length, 0);
    const initializations = await Promise.allSettled([administerOperatorOwner(db, {...bootstrap, apply: true}), administerOperatorOwner(db, {...bootstrap, targetUserId: 'second', apply: true})]);
    assert.equal(initializations.filter((result) => result.status === 'fulfilled').length, 1);
    assert.ok(initializations.some((result) => result.status === 'rejected' && conflict(result.reason)));
    const owner = (await db.select().from(operatorRoles))[0]!.userId;
    const second = owner === 'owner' ? 'second' : 'owner';
    cases.push('bootstrap dry-run has no effects; verified identity and concurrent one-time latch enforced');
    await db.insert(authSession).values([owner, second, 'operator'].map((userId) => ({id: `session-${userId}`, userId, token: `token-${userId}`, expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now})));
    const actor = {userId: owner, sessionId: `session-${owner}`};
    await recordTrustedSecondFactor(db, actor, now);
    await assert.rejects(disableOperatorUser(db, {actor, targetUserId: owner, expectedVersion: 1, idempotencyKey: 'last-disable', reason: 'Check last owner guard', now}), conflict);
    await assert.rejects(disableUser(db, actor, owner, 'Check legacy last owner guard'), conflict);
    const unsafeGrant = {actor, role: 'superadmin' as const, expectedVersion: 1, reason: 'Verify usable administrative owner', now};
    await assert.rejects(setOperatorRole(db, {...unsafeGrant, targetUserId: 'unverified', idempotencyKey: 'unverified-admin'}), forbidden);
    await db.update(authUser).set({disabledAt: now}).where(eq(authUser.id, second));
    await assert.rejects(setOperatorRole(db, {...unsafeGrant, targetUserId: second, idempotencyKey: 'disabled-auth-admin'}), forbidden);
    await db.update(authUser).set({disabledAt: null}).where(eq(authUser.id, second));
    await db.insert(userAccessControls).values({userId: second, status: 'disabled', disabledAt: now, reason: 'Probe account access control', version: 1, createdAt: now, updatedAt: now});
    await assert.rejects(setOperatorRole(db, {...unsafeGrant, targetUserId: second, idempotencyKey: 'disabled-access-admin'}), forbidden);
    await db.delete(userAccessControls).where(eq(userAccessControls.userId, second));
    await db.insert(operatorRoles).values({userId: 'unverified', role: 'superadmin', grantedAt: now, version: 1, updatedAt: now});
    await assert.rejects(disableOperatorUser(db, {actor, targetUserId: owner, expectedVersion: 1, idempotencyKey: 'unusable-survivor-disable', reason: 'Unverified appointment is not a usable owner', now}), conflict);
    await assert.rejects(setOperatorRole(db, {...unsafeGrant, targetUserId: owner, role: 'support', idempotencyKey: 'unusable-survivor-demote'}), conflict);
    await db.delete(operatorRoles).where(eq(operatorRoles.userId, 'unverified'));
    cases.push('unverified and disabled identities cannot receive superadmin; historical unverified roles cannot satisfy the surviving owner guard');
    const grant = await setOperatorRole(db, {actor, targetUserId: second, role: 'superadmin', expectedVersion: 1, idempotencyKey: 'second-grant', reason: 'Appoint second recovery owner', now});
    assert.equal(grant.version, 1);
    assert.equal((await db.select().from(operatorRoles).where(eq(operatorRoles.userId, second)))[0]!.version, grant.version);
    const demoted = await setOperatorRole(db, {actor, targetUserId: second, role: 'support', expectedVersion: 1, idempotencyKey: 'second-demote', reason: 'Verify safe owner demotion', now});
    assert.equal(demoted.version, 2);
    await setOperatorRole(db, {actor, targetUserId: second, role: 'superadmin', expectedVersion: 2, idempotencyKey: 'second-restore', reason: 'Restore second recovery owner', now});
    await recordTrustedSecondFactor(db, {userId: second, sessionId: `session-${second}`}, now);
    await setOperatorRole(db, {actor, targetUserId: 'operator', role: 'operator', expectedVersion: 1, idempotencyKey: 'operator-grant', reason: 'Appoint test operator', now});
    const operatorActor = {userId: 'operator', sessionId: 'session-operator'};
    await recordTrustedSecondFactor(db, operatorActor, now);
    const disabledTarget = 'disable-session-target';
    await db.insert(authUser).values({id: disabledTarget, name: disabledTarget, email: `${disabledTarget}@example.test`, emailVerified: true, createdAt: now, updatedAt: now});
    await db.insert(authSession).values({id: `session-${disabledTarget}`, userId: disabledTarget, token: `token-${disabledTarget}`, expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now});
    await disableUser(db, operatorActor, disabledTarget, 'Verify shared audited disablement');
    assert.equal((await db.select().from(authSession).where(eq(authSession.userId, disabledTarget))).length, 0);
    assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.commandName, 'operator.account.disable'))).length, 1);
    cases.push('legacy disable shares final-owner protection and audited domain command; all target sessions are revoked');
    const ownershipRace = await Promise.allSettled([
      disableOperatorUser(db, {actor: operatorActor, targetUserId: second, expectedVersion: 1, idempotencyKey: 'second-disable', reason: 'Verify competing owner changes', now}),
      setOperatorRole(db, {actor, targetUserId: owner, role: 'support', expectedVersion: 1, idempotencyKey: 'self-demote', reason: 'Verify competing owner changes', now}),
    ]);
    assert.equal(ownershipRace.filter((result) => result.status === 'fulfilled').length, 1);
    assert.ok(ownershipRace.some((result) => result.status === 'rejected' && conflict(result.reason)));
    cases.push('positive owner demotion and concurrent demotion/disable preserve one owner; returned role version matches persistence');
    const recoveryTarget = (await db.select().from(operatorRoles)).find((row) => row.role === 'superadmin')!;
    await assert.rejects(administerOperatorOwner(db, {mode: 'recover', targetUserId: 'operator', expectedVersion: 1, reason: 'Invalid recovery test', changeReference: 'local-probe-ticket', apply: true}), forbidden);
    await assert.rejects(administerOperatorOwner(db, {mode: 'recover', targetUserId: recoveryTarget.userId, expectedVersion: 999, reason: 'Stale recovery test', changeReference: 'local-probe-ticket', apply: true}), conflict);
    await administerOperatorOwner(db, {mode: 'recover', targetUserId: recoveryTarget.userId, expectedVersion: recoveryTarget.version, reason: 'Test audited lost-credential recovery', changeReference: 'local-probe-ticket', apply: true});
    assert.equal((await db.select().from(authSession).where(eq(authSession.userId, recoveryTarget.userId))).length, 0);
    await assert.rejects(administerOperatorOwner(db, {...bootstrap, apply: true}), conflict);
    cases.push('out-of-band recovery rejects new appointments/stale versions, invalidates sessions and cannot reopen bootstrap');

    const workspaceId = (await createTeamWorkspace(db, {userId: 'operator'}, 'M6 privileged probe')).workspaceId;
    const customerId = `fixture_customer_${workspaceId}`;
    await db.insert(billingCustomerHistory).values({workspaceId, provider: 'fixture', customerId, validFrom: now, changeReason: 'local privileged probe'});
    const orderId = randomUUID();
    await db.insert(billingOrders).values({id: orderId, workspaceId, provider: 'fixture', customerId, kind: 'pack', catalogSnapshot: snapshotBillingProduct('fixture-pack', 'local'), status: 'paid', currency: 'usd', paidMinor: 900n, refundedMinor: 0n, paidAt: now, createdAt: now, updatedAt: now});
    const preview = await previewBillingRefundForOperator(db, {actor: operatorActor, workspaceId, orderId, purpose: 'Review local cash refund'});
    let submissions = 0;
    const provider = {provider: 'fixture' as const, async createRefund(input: {amountMinor: bigint}) { submissions += 1; return {externalId: `fixture-refund-${randomUUID()}`, amountMinor: input.amountMinor}; }};
    const refund = {actor: operatorActor, workspaceId, orderId, expectedVersion: preview.expectedVersion, idempotencyKey: 'operator-refund', reason: 'Approve local refund verification', purpose: 'Review local cash refund', provider, now};
    await assert.rejects(requestBillingRefundAsOperator(db, {...refund, expectedVersion: preview.expectedVersion + 1}), conflict);
    assert.equal(submissions, 0);
    const refunds = await Promise.all([requestBillingRefundAsOperator(db, refund), requestBillingRefundAsOperator(db, refund)]);
    assert.equal(submissions, 1);
    assert.equal(new Set(refunds.map((result) => result.requestId)).size, 1);
    const replay = await requestBillingRefundAsOperator(db, refund);
    assert.equal(replay.status, 'confirmed'); assert.equal(replay.replayed, true); assert.equal(replay.amountMinor, 900n);
    await assert.rejects(requestBillingRefundAsOperator(db, {...refund, reason: 'Conflicting semantic retry'}), conflict);
    assert.equal((await db.select().from(billingRefundRequests)).length, 1);
    assert.equal((await db.select().from(outboxEvents).where(eq(outboxEvents.eventType, 'billing.refund_requested')))[0]!.status, 'published');
    assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.commandName, 'operator.billing.refund'))).length, 1);
    assert.equal((await db.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId)))[0]!.version, preview.expectedVersion + 1);
    cases.push('refund stale version has no external effect; concurrent retry submits once; settled retry returns confirmed result with one audit/outbox');
    const unknownOrderId = randomUUID();
    await db.insert(billingOrders).values({id: unknownOrderId, workspaceId, provider: 'fixture', customerId, kind: 'pack', catalogSnapshot: snapshotBillingProduct('fixture-pack', 'local'), status: 'paid', currency: 'usd', paidMinor: 900n, refundedMinor: 0n, paidAt: now, createdAt: now, updatedAt: now});
    const unknownRefund = {...refund, orderId: unknownOrderId, expectedVersion: preview.expectedVersion + 1, idempotencyKey: 'unknown-refund', provider: {provider: 'fixture' as const, async createRefund() { throw new Error('local ambiguous response'); }}};
    assert.equal((await requestBillingRefundAsOperator(db, unknownRefund)).status, 'unknown');
    assert.equal((await requestBillingRefundAsOperator(db, unknownRefund)).status, 'unknown');
    await assert.rejects(requestBillingRefundAsOperator(db, {...unknownRefund, idempotencyKey: 'second-unknown-refund', expectedVersion: preview.expectedVersion + 2}), conflict);
    cases.push('ambiguous response retains durable unknown intent and prevents another refund');
    async function seedUnclaimedRefund() {
      const pendingOrderId = randomUUID();
      const requestId = randomUUID();
      await db.insert(billingOrders).values({id: pendingOrderId, workspaceId, provider: 'fixture', customerId, kind: 'pack', catalogSnapshot: snapshotBillingProduct('fixture-pack', 'local'), status: 'paid', currency: 'usd', paidMinor: 900n, refundedMinor: 0n, paidAt: now, createdAt: now, updatedAt: now});
      await db.insert(billingRefundRequests).values({id: requestId, workspaceId, orderId: pendingOrderId, provider: 'fixture', idempotencyKey: `refund:${requestId}`, amountMinor: 900n, currency: 'usd', reason: 'Crash recovery fixture', status: 'pending', createdAt: now, updatedAt: now});
      await db.insert(outboxEvents).values({id: randomUUID(), workspaceId, eventType: 'billing.refund_requested', aggregateId: requestId, businessKey: `billing.refund:${requestId}`, payload: {requestId}, status: 'pending', availableAt: now, createdAt: now});
      return {requestId, orderId: pendingOrderId};
    }
    const unsent = await seedUnclaimedRefund();
    let recoverySubmissions = 0;
    const recoveringProvider = {provider: 'fixture' as const, async createRefund(input: {amountMinor: bigint; idempotencyKey: string}) {recoverySubmissions += 1; assert.equal(input.idempotencyKey, `refund:${unsent.requestId}`); return {externalId: `confirmed-${unsent.requestId}`, amountMinor: input.amountMinor};}};
    const unsentInput = {actor: operatorActor, workspaceId, requestId: unsent.requestId, purpose: 'Recover committed intent before dispatch', provider: recoveringProvider, now};
    await Promise.all([deliverOperatorRefund(db, unsentInput), deliverOperatorRefund(db, unsentInput)]);
    assert.equal(recoverySubmissions, 1);
    assert.equal((await deliverOperatorRefund(db, unsentInput)).status, 'confirmed');
    cases.push('never-claimed durable refund survives a pre-dispatch crash and concurrent recovery submits once');

    const interrupted = await seedUnclaimedRefund();
    const faultAuditId = randomUUID();
    let interruptedSubmissions = 0;
    let lookups = 0;
    const observedExternalId = `observed-${interrupted.requestId}`;
    const interruptedProvider = {
      provider: 'fixture' as const,
      async createRefund() {
        interruptedSubmissions += 1;
        // Fail the last transaction write after provider success, forcing local cash/result rollback.
        await db.insert(auditEvents).values({id: faultAuditId, actorUserId: operatorActor.userId, workspaceId, commandName: 'operator.billing.refund.confirmed', commandKey: interrupted.requestId, semanticHash: '0'.repeat(64), payload: {}, createdAt: now});
        return {externalId: observedExternalId, amountMinor: 900n};
      },
      async lookupRefund(input: {idempotencyKey: string}) {lookups += 1; assert.equal(input.idempotencyKey, `refund:${interrupted.requestId}`); return {externalId: observedExternalId, amountMinor: 900n};},
    };
    const interruptedInput = {actor: operatorActor, workspaceId, requestId: interrupted.requestId, purpose: 'Reconcile provider success after local failure', provider: interruptedProvider, now};
    await assert.rejects(deliverOperatorRefund(db, interruptedInput), conflict);
    assert.equal((await db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, interrupted.requestId)))[0]!.status, 'pending');
    assert.equal((await db.select().from(billingOrders).where(eq(billingOrders.id, interrupted.orderId)))[0]!.status, 'paid');
    assert.equal((await db.select().from(billingCashEvents).where(eq(billingCashEvents.externalId, observedExternalId))).length, 0);
    await db.delete(auditEvents).where(eq(auditEvents.id, faultAuditId));
    assert.equal((await deliverOperatorRefund(db, {...interruptedInput, now: new Date(now.getTime() + 61_000)})).status, 'confirmed');
    assert.equal(interruptedSubmissions, 1); assert.equal(lookups, 1);
    assert.equal((await db.select().from(billingCashEvents).where(eq(billingCashEvents.externalId, observedExternalId))).length, 1);
    cases.push('post-submit audit failure rolls back cash/result; expired delivery reconciles by authoritative lookup without resubmission');

    const untraceable = await seedUnclaimedRefund();
    let untraceableSubmissions = 0;
    const untraceableProvider = {provider: 'fixture' as const, async createRefund() {untraceableSubmissions += 1; throw new Error('Lost provider response');}};
    const untraceableInput = {actor: operatorActor, workspaceId, requestId: untraceable.requestId, purpose: 'Preserve uncertainty when lookup is unavailable', provider: untraceableProvider, now};
    assert.equal((await deliverOperatorRefund(db, untraceableInput)).status, 'unknown');
    assert.equal((await deliverOperatorRefund(db, {...untraceableInput, now: new Date(now.getTime() + 61_000)})).status, 'unknown');
    assert.equal(untraceableSubmissions, 1);
    cases.push('unknown refund without authoritative lookup remains unknown and never triggers a second create call');
    const pendingCommands = await readPendingOperatorRefunds(db, {actor: operatorActor, workspaceId, purpose: 'Restore pending commands after browser reload'});
    const recoveredCommand = pendingCommands.items.find((row) => row.retry?.idempotencyKey === unknownRefund.idempotencyKey)?.retry;
    assert.ok(recoveredCommand, 'The exact persisted command must be recoverable after client state is lost.');
    assert.equal(recoveredCommand.expectedVersion, unknownRefund.expectedVersion);
    assert.equal(recoveredCommand.amountMinor, undefined, 'An omitted amount must remain omitted for semantic identity.');
    assert.equal(recoveredCommand.reason, unknownRefund.reason);
    assert.equal(recoveredCommand.purpose, unknownRefund.purpose);
    assert.equal((await requestBillingRefundAsOperator(db, {...recoveredCommand, amountMinor: recoveredCommand.amountMinor === undefined ? undefined : BigInt(recoveredCommand.amountMinor), actor: operatorActor, provider: unknownRefund.provider, now})).replayed, true);
    await db.insert(authUser).values({id: 'other-operator', name: 'Other operator', email: 'other-operator@example.test', emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now});
    await db.insert(authSession).values({id: 'session-other-operator', userId: 'other-operator', token: randomUUID(), expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now});
    await db.insert(operatorRoles).values({userId: 'other-operator', role: 'operator', grantedAt: now, updatedAt: now});
    const otherActor = {userId: 'other-operator', sessionId: 'session-other-operator'};
    await recordTrustedSecondFactor(db, otherActor, now);
    assert.equal((await readPendingOperatorRefunds(db, {actor: otherActor, workspaceId, purpose: 'Verify exact-command actor isolation'})).items.length, 0);
    cases.push('browser reload recovers the original pending key/body/version with semantic-hash verification; other actors cannot replay that identity');
    console.log(JSON.stringify({status: 'PASS', databaseName, count: cases.length, cases}));
  } finally {
    if (pool) await pool.end();
    if (created) { await admin.query(`drop database "${databaseName}" with (force)`); console.log(JSON.stringify({disposableDatabaseRemoved: true, databaseName})); }
    await admin.end();
  }
}

run().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
