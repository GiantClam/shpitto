import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client, type Pool} from 'pg';

import {getServerEnv} from '../src/config/env.ts';
import {createDatabase} from '../src/db/client.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {auditEvents} from '../src/db/schema/credit.ts';
import {operatorOwnerState, operatorRoles} from '../src/db/schema/operator.ts';
import {createAuth} from '../src/lib/auth.ts';
import {requireCurrentOperator} from '../src/modules/operations/authorize.ts';
import {administerOperatorOwner} from '../src/modules/operations/bootstrap.ts';

for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const configured = new URL(getServerEnv().databaseUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)) throw new Error('First-owner claim probe requires disposable local PostgreSQL.');
const runId = randomUUID().replaceAll('-', '');
const databaseNames = [`first_owner_fresh_${runId}`, `first_owner_upgrade_${runId}`];
const adminUrl = new URL(configured); adminUrl.pathname = '/postgres';
const admin = new Client({connectionString: adminUrl.toString()});

async function createFixture(databaseName: string): Promise<Readonly<{pool: Pool; db: ReturnType<typeof createDatabase>['db']}>> {
  const databaseUrl = new URL(configured); databaseUrl.pathname = `/${databaseName}`;
  await admin.query(`create database "${databaseName}"`);
  const migration = new Client({connectionString: databaseUrl.toString()});
  await migration.connect();
  try { await migrate(drizzle(migration), {migrationsFolder: 'src/db/migrations'}); } finally { await migration.end(); }
  const database = createDatabase({connectionString: databaseUrl.toString(), max: 12});
  return {pool: database.pool, db: database.db};
}

function request(path: string, body: unknown): Request {
  return new Request(new URL(`/api/auth${path}`, getServerEnv().appUrl), {
    method: 'POST',
    headers: {origin: new URL(getServerEnv().appUrl).origin, 'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
}

async function signup(auth: ReturnType<typeof createAuth>, email: string, requestedRole?: string): Promise<Readonly<{status: number; userId: string; password: string}>> {
  const password = `FirstOwner-${randomUUID()}`;
  const response = await auth.handler(request('/sign-up/email', {name: email.split('@')[0], email, password, ...(requestedRole ? {role: requestedRole} : {})}));
  const body = await response.json() as {user?: {id?: string}};
  assert.equal(response.status, 200);
  assert.equal(typeof body.user?.id, 'string');
  return {status: response.status, userId: body.user!.id!, password};
}

async function freshInstallation(): Promise<void> {
  const fixture = await createFixture(databaseNames[0]!);
  try {
    const authA = createAuth(fixture.db, {mailAdapter: {send: async () => ({ok: true, value: undefined})}});
    const authB = createAuth(fixture.db, {mailAdapter: {send: async () => ({ok: true, value: undefined})}});
    const registrations = await Promise.all([
      signup(authA, `first-a-${runId}@example.test`),
      signup(authB, `first-b-${runId}@example.test`),
    ]);
    const roles = await fixture.db.select().from(operatorRoles).where(eq(operatorRoles.role, 'superadmin'));
    assert.equal(roles.length, 1, 'Concurrent registration must create exactly one Superadmin.');
    assert(registrations.some((registration) => registration.userId === roles[0]!.userId));
    const sessions = await fixture.db.select().from(authSession).where(eq(authSession.userId, roles[0]!.userId));
    assert.equal((await requireCurrentOperator(fixture.db, {userId: roles[0]!.userId, sessionId: sessions[0]!.id}, 'superadmin')).role, 'superadmin', 'Default optional controls must allow the claimed owner to enter administration without SMTP or 2FA.');

    const state = (await fixture.db.select().from(operatorOwnerState).where(eq(operatorOwnerState.id, 'default')))[0]!;
    assert.equal(state.firstUserClaimOpen, false);
    assert.equal(state.initialized, true);
    assert.equal(state.initializedByUserId, roles[0]!.userId);
    assert.equal(state.initializationMethod, 'first_registration');
    assert(state.initializedAt);
    assert.equal((await fixture.db.select().from(auditEvents).where(eq(auditEvents.commandName, 'operator.owner.first-registration-claim'))).length, 1);

    await fixture.db.update(operatorOwnerState).set({
      firstUserClaimOpen: true,
      initialized: false,
      initializedByUserId: null,
      initializationMethod: null,
      initializedAt: null,
      version: state.version + 1,
      updatedAt: new Date(),
    }).where(eq(operatorOwnerState.id, 'default'));
    await fixture.db.delete(operatorRoles).where(eq(operatorRoles.userId, roles[0]!.userId));
    await fixture.db.delete(auditEvents).where(eq(auditEvents.commandName, 'operator.owner.first-registration-claim'));
    const winner = registrations.find((registration) => registration.userId === roles[0]!.userId)!;
    const winnerEmail = winner.userId === registrations[0]!.userId ? `first-a-${runId}@example.test` : `first-b-${runId}@example.test`;
    assert.equal((await authA.handler(request('/sign-up/email', {name: 'Duplicate signup', email: winnerEmail, password: 'duplicate-signup-password'}))).status, 422);
    assert.equal((await fixture.db.select().from(operatorOwnerState).where(eq(operatorOwnerState.id, 'default')))[0]!.firstUserClaimOpen, true, 'Duplicate signup must not consume the fresh-install owner claim.');
    const rejectedLogin = await authA.handler(request('/sign-in/email', {email: winnerEmail, password: 'incorrect-password'}));
    assert.equal(rejectedLogin.status, 401);
    assert.equal((await fixture.db.select().from(operatorOwnerState).where(eq(operatorOwnerState.id, 'default')))[0]!.firstUserClaimOpen, true, 'Failed login must not consume the fresh-install owner claim.');
    assert.equal((await fixture.db.select().from(operatorRoles)).length, 0, 'Failed login must not assign a global role.');
    assert.equal((await authA.handler(request('/sign-in/email', {email: winnerEmail, password: winner.password}))).status, 200);
    assert.equal((await fixture.db.select().from(operatorRoles).where(eq(operatorRoles.role, 'superadmin'))).length, 1, 'A later successful password login must finish a previously interrupted claim.');

    const restartedAuth = createAuth(fixture.db, {mailAdapter: {send: async () => ({ok: true, value: undefined})}});
    await signup(restartedAuth, `after-restart-${runId}@example.test`, 'superadmin');
    assert.equal((await fixture.db.select().from(operatorRoles).where(eq(operatorRoles.role, 'superadmin'))).length, 1, 'Restart and later registration must not reopen the claim.');
    assert.equal((await fixture.db.select().from(auditEvents).where(eq(auditEvents.commandName, 'operator.owner.first-registration-claim'))).length, 1);
  } finally {
    await fixture.pool.end();
  }
}

async function upgradedInstallation(): Promise<void> {
  const fixture = await createFixture(databaseNames[1]!);
  try {
    await fixture.pool.query('drop table app.operator_owner_state');
    const now = new Date();
    const existingUserId = `existing-${runId}`;
    await fixture.db.insert(authUser).values({id: existingUserId, name: 'Existing buyer', email: `${existingUserId}@example.test`, emailVerified: false, createdAt: now, updatedAt: now});
    await fixture.db.insert(operatorRoles).values({userId: existingUserId, role: 'operator', grantedAt: now, updatedAt: now});
    await fixture.pool.query(await readFile(resolve('src/db/migrations/0031_operator_owner_state.sql'), 'utf8'));
    const state = (await fixture.db.select().from(operatorOwnerState).where(eq(operatorOwnerState.id, 'default')))[0]!;
    assert.equal(state.firstUserClaimOpen, false, 'An installation that already has users must not enable public first-user claiming during upgrade.');
    assert.equal(state.initialized, false);
    assert.equal((await fixture.db.select().from(operatorRoles).where(eq(operatorRoles.userId, existingUserId)))[0]!.role, 'operator', 'The upgrade must retain the existing role until an out-of-band bootstrap is applied.');

    const auth = createAuth(fixture.db, {mailAdapter: {send: async () => ({ok: true, value: undefined})}});
    const laterRegistration = await signup(auth, `new-after-upgrade-${runId}@example.test`);
    assert.equal((await fixture.db.select().from(operatorRoles).where(eq(operatorRoles.userId, laterRegistration.userId))).length, 0, 'A later registration on an upgraded installation must not receive a global role.');
    assert.equal((await fixture.db.select().from(operatorRoles).where(eq(operatorRoles.role, 'superadmin'))).length, 0, 'An installation without a prior Superadmin must remain closed to public claiming after upgrade.');

    const bootstrap = {mode: 'bootstrap' as const, targetUserId: existingUserId, reason: 'Initialize an upgraded buyer installation', changeReference: 'first-owner-upgrade-probe'};
    assert.equal((await administerOperatorOwner(fixture.db, bootstrap)).applied, false);
    assert.equal((await administerOperatorOwner(fixture.db, {...bootstrap, apply: true})).applied, true);
    const initialized = (await fixture.db.select().from(operatorOwnerState).where(eq(operatorOwnerState.id, 'default')))[0]!;
    assert.equal(initialized.initialized, true);
    assert.equal(initialized.initializedByUserId, existingUserId);
    assert.equal(initialized.initializationMethod, 'server_bootstrap');
    assert.equal((await fixture.db.select().from(operatorRoles).where(eq(operatorRoles.userId, existingUserId)))[0]!.role, 'superadmin', 'The audited server bootstrap can promote an existing legacy operator when no Superadmin was ever initialized.');
  } finally {
    await fixture.pool.end();
  }
}

async function run(): Promise<void> {
  await admin.connect();
  try {
    await freshInstallation();
    await upgradedInstallation();
    console.log(JSON.stringify({status: 'PASS', cases: ['concurrent registrations assign exactly one Superadmin', 'disabled SMTP/email verification/2FA/Turnstile do not block the owner', 'client role input is ignored', 'duplicate signup and failed login do not consume an open claim', 'successful login recovers an interrupted claim', 'later registration and process restart do not reopen the claim', 'upgrades keep public claiming closed', 'legacy operator role remains unchanged until server bootstrap', 'audited bootstrap promotes the selected existing account']}));
  } finally {
    for (const databaseName of databaseNames) await admin.query(`drop database if exists "${databaseName}" with (force)`);
    await admin.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
