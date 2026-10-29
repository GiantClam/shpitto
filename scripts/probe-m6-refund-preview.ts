import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';

import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client} from 'pg';

import {getServerEnv} from '../src/config/env.ts';
import {snapshotBillingProduct} from '../src/config/plans.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {billingAccounts, billingCustomerHistory, billingOrders, billingRefundRequests} from '../src/db/schema/billing.ts';
import {operatorRoles} from '../src/db/schema/operator.ts';
import {operatorTenantAccess} from '../src/db/schema/operations.ts';
import {creditGrants, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {previewBillingRefund, previewBillingRefundForOperator} from '../src/modules/billing/refund-preview.ts';
import {reconcileBillingRefund, requestBillingRefund, requestBillingRefundAsOperator} from '../src/modules/billing/refund-command.ts';
import {recordTrustedSecondFactor} from '../src/modules/operations/authorize.ts';

const configured = new URL(getServerEnv().databaseUrl);
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname));
const name = 'm6_refund_preview_' + randomUUID().replaceAll('-', '');
const admin = new Client({connectionString: configured.toString()});
await admin.connect();
await admin.query('CREATE DATABASE ' + name);
configured.pathname = '/' + name;
const database = createDatabase({connectionString: configured.toString()});
const db = database.db;
const now = new Date();
const userId = randomUUID();
const memberId = randomUUID();
const sessionId = randomUUID();
const workspaceId = randomUUID();
const actor = {userId, sessionId};
const purpose = 'Review a local refund exposure fixture';
const snapshot = snapshotBillingProduct('fixture-pack', 'local');
const checks: string[] = [];
const rejects = (code: DomainError['code']) => (error: unknown) => error instanceof DomainError && error.code === code;

try {
  await migrate(db, {migrationsFolder: 'src/db/migrations'});
  await db.insert(authUser).values([{id: userId, email: userId + '@example.test', name: 'Refund operator', emailVerified: true, twoFactorEnabled: true, createdAt: now, updatedAt: now}, {id: memberId, email: memberId + '@example.test', name: 'Refund member', emailVerified: true, createdAt: now, updatedAt: now}]);
  await db.insert(authSession).values({id: sessionId, userId, token: randomUUID(), expiresAt: new Date(now.getTime() + 3600_000), createdAt: now, updatedAt: now});
  await db.insert(operatorRoles).values({userId, role: 'operator', grantedAt: now, version: 1, updatedAt: now});
  await recordTrustedSecondFactor(db, actor, now);
  await db.insert(workspaces).values({id: workspaceId, kind: 'team', name: 'Refund preview fixture', createdBy: userId, status: 'active', version: 1, createdAt: now, updatedAt: now});
  await db.insert(workspaceMembers).values([{workspaceId, userId, role: 'owner', createdAt: now}, {workspaceId, userId: memberId, role: 'member', createdAt: now}]);
  await db.insert(billingAccounts).values({workspaceId, status: 'active', version: 1, createdAt: now, updatedAt: now});
  await db.insert(billingCustomerHistory).values({workspaceId, provider: 'fixture', customerId: 'preview-customer', validFrom: now, changeReason: 'fixture'});
  async function order(status = 'paid', bucket: 'available' | 'reserved' | 'consumed' | 'expired' | 'none' = 'available') {
    const id = randomUUID();
    await db.insert(billingOrders).values({id, workspaceId, provider: 'fixture', customerId: 'preview-customer', kind: 'pack', catalogSnapshot: snapshot, status, paidMinor: 900n, refundedMinor: status === 'refunded' ? 900n : 0n, currency: 'usd', paidAt: now, createdAt: now, updatedAt: now});
    if (bucket !== 'none') await db.insert(creditGrants).values({id: randomUUID(), workspaceId, source: 'purchase', issued: 100n, available: bucket === 'available' ? 100n : 0n, reserved: bucket === 'reserved' ? 100n : 0n, consumed: bucket === 'consumed' ? 100n : 0n, expired: bucket === 'expired' ? 100n : 0n, voided: 0n, expiresAt: bucket === 'expired' ? new Date(now.getTime() - 1000) : null, businessKey: 'billing:' + id + ':grant', createdAt: now});
    return id;
  }
  const full = await order();
  const reserved = await order('paid', 'reserved');
  const consumed = await order('paid', 'consumed');
  const noGrant = await order('paid', 'none');
  const expired = await order('paid', 'expired');
  const held = await order('held');
  const refunded = await order('refunded');
  for (const [orderId, reason, eligible] of [[full, 'full-unused', true], [reserved, 'partial-or-exposed', true], [consumed, 'partial-or-exposed', true], [noGrant, 'partial-or-exposed', true], [held, 'not-paid', false], [refunded, 'already-refunded', false]] as const) {
    const owner = await previewBillingRefund(db, {actor, workspaceId, orderId});
    const operator = await previewBillingRefundForOperator(db, {actor, workspaceId, orderId, purpose});
    assert.equal(owner.reason, reason); assert.equal(operator.reason, reason);
    assert.equal(owner.eligible, eligible); assert.equal(operator.eligible, eligible);
    assert.equal(operator.expectedVersion, 1);
    assert.equal(operator.amountMinor, 900n);
  }
  const partial = await previewBillingRefund(db, {actor, workspaceId, orderId: full, amountMinor: 450n});
  assert.equal(partial.reason, 'partial-or-exposed');
  assert.equal((await previewBillingRefundForOperator(db, {actor, workspaceId, orderId: full, amountMinor: 450n, purpose})).reason, partial.reason);
  assert.equal((await previewBillingRefundForOperator(db, {actor, workspaceId, orderId: expired, purpose})).creditAvailable, 0n);
  assert.equal((await previewBillingRefund(db, {actor, workspaceId, orderId: noGrant})).creditGrantId, null);
  assert.equal((await previewBillingRefund(db, {actor, workspaceId, orderId: consumed})).creditConsumed, 100n);
  checks.push('owner-and-operator-preview-distinguish-paid-exposed-held-and-refunded-orders');
  for (const amountMinor of [0n, -1n, 901n]) {
    await assert.rejects(previewBillingRefund(db, {actor, workspaceId, orderId: full, amountMinor}), rejects('VALIDATION'));
    await assert.rejects(previewBillingRefundForOperator(db, {actor, workspaceId, orderId: full, amountMinor, purpose}), rejects('VALIDATION'));
  }
  await assert.rejects(previewBillingRefund(db, {actor, workspaceId, orderId: randomUUID()}), rejects('NOT_FOUND'));
  await assert.rejects(previewBillingRefundForOperator(db, {actor, workspaceId, orderId: randomUUID(), purpose}), rejects('NOT_FOUND'));
  await assert.rejects(previewBillingRefund(db, {actor: {userId: memberId}, workspaceId, orderId: full}), rejects('FORBIDDEN'));
  await assert.rejects(previewBillingRefundForOperator(db, {actor: {userId: memberId, sessionId}, workspaceId, orderId: full, purpose}), rejects('FORBIDDEN'));
  const invalidOrder = {id: randomUUID(), workspaceId, provider: 'fixture', customerId: 'preview-customer', kind: 'pack', catalogSnapshot: snapshot, status: 'paid', paidMinor: 900n, refundedMinor: 0n, currency: 'eur', paidAt: now, createdAt: now, updatedAt: now};
  await assert.rejects(db.insert(billingOrders).values(invalidOrder), error => (error as {cause?: {code?: string}}).cause?.code === '23514');
  checks.push('invalid-money-cross-user-missing-order-and-currency-snapshot-rejected');
  let providerCalls = 0;
  const provider = {provider: 'fixture' as const, async createRefund() {providerCalls += 1; return {unknown: true} as const;}};
  const input = {actor, workspaceId, orderId: full, expectedVersion: 1, idempotencyKey: 'preview-refund', reason: 'Fixture monetary boundary check', purpose, provider, now};
  for (const amountMinor of [0n, -1n, 901n]) await assert.rejects(requestBillingRefundAsOperator(db, {...input, amountMinor}), rejects('VALIDATION'));
  await assert.rejects(requestBillingRefundAsOperator(db, {...input, orderId: held}), rejects('CONFLICT'));
  await assert.rejects(requestBillingRefundAsOperator(db, {...input, orderId: refunded}), rejects('CONFLICT'));
  assert.equal(providerCalls, 0);
  assert.equal((await db.select().from(billingRefundRequests)).length, 0);
  const unknown = await requestBillingRefundAsOperator(db, input);
  assert.equal(unknown.status, 'unknown');
  await assert.rejects(requestBillingRefundAsOperator(db, {...input, expectedVersion: 2, idempotencyKey: 'second-cash-intent'}), rejects('CONFLICT'));
  assert.equal(providerCalls, 1);
  checks.push('invalid-or-unresolved-refund-intents-never-dispatch-additional-cash');
  const ownerCash = await order();
  await assert.rejects(requestBillingRefund(db, {actor, workspaceId, orderId: held, idempotencyKey: 'owner-invalid', reason: 'Preview held cash'}), rejects('CONFLICT'));
  const ownerConfirmed = await requestBillingRefund(db, {actor, workspaceId, orderId: ownerCash, idempotencyKey: 'owner-confirmed', reason: 'Local owner refund fixture', now});
  assert.equal(ownerConfirmed.status, 'confirmed');
  assert.equal((await previewBillingRefund(db, {actor, workspaceId, orderId: ownerCash})).reason, 'already-refunded');
  const ownerUnknown = await requestBillingRefund(db, {actor, workspaceId, orderId: consumed, idempotencyKey: 'owner-unknown', reason: 'Local unknown refund fixture', provider, now});
  assert.equal(ownerUnknown.status, 'unknown');
  assert.equal((await requestBillingRefund(db, {actor, workspaceId, orderId: consumed, idempotencyKey: 'owner-unknown', reason: 'Local unknown refund fixture', provider, now})).replayed, true);
  await assert.rejects(reconcileBillingRefund(db, {actor: {userId: memberId}, requestId: ownerUnknown.requestId, externalId: 'fixture-readback', now}), rejects('FORBIDDEN'));
  assert.equal((await reconcileBillingRefund(db, {actor, requestId: ownerUnknown.requestId, externalId: 'fixture-readback', now})).status, 'confirmed');
  assert.equal((await reconcileBillingRefund(db, {actor, requestId: ownerUnknown.requestId, externalId: 'fixture-readback', now})).replayed, true);
  assert.equal((await db.select().from(creditGrants).where(eq(creditGrants.businessKey, 'billing:' + consumed + ':grant')))[0]?.consumed, 100n);
  assert.ok((await db.select().from(operatorTenantAccess)).length >= 8);
  checks.push('fixture-owner-confirmation-and-reconciliation-retain-used-credit-lineage');
  console.log(JSON.stringify({status: 'PASS', scope: 'local-docker-monetary-preview-and-command-boundaries', realAccountVerified: false, checks}));
} finally {
  await database.pool.end();
  await admin.query('DROP DATABASE ' + name);
  await admin.end();
}
