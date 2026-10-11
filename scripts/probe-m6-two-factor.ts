import {strict as assert} from 'node:assert';
import {createHmac, randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client, type Pool} from 'pg';

import {LocalMailAdapter} from '../src/adapters/mail/local.ts';
import {getServerEnv} from '../src/config/env.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {operatorRoles, operatorStepUps, OPERATOR_STEP_UP_TTL_MS} from '../src/db/schema/operator.ts';
import {createAuth} from '../src/lib/auth.ts';
import {authorizeOperatorCommand, requireCurrentOperator, requireOperatorIdentity} from '../src/modules/operations/authorize.ts';

for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const env = getServerEnv();
const configured = new URL(env.databaseUrl);
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname), 'Second-factor probe requires local PostgreSQL.');
const databaseName = `m6_two_factor_probe_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(configured); adminUrl.pathname = '/postgres';
const databaseUrl = new URL(configured); databaseUrl.pathname = `/${databaseName}`;
const admin = new Client({connectionString: adminUrl.toString()});
const forbidden = (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN';

function totp(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0')).join('');
  const bytes = Buffer.from(Array.from({length: Math.floor(bits.length / 8)}, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hash = createHmac('sha1', bytes).update(counter).digest();
  const offset = hash[hash.length - 1]! & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

async function run(): Promise<void> {
  let created = false;
  let pool: Pool | undefined;
  await admin.connect();
  try {
    await admin.query(`create database "${databaseName}"`); created = true;
    const migration = new Client({connectionString: databaseUrl.toString()});
    await migration.connect();
    try { await migrate(drizzle(migration), {migrationsFolder: 'src/db/migrations'}); } finally { await migration.end(); }
    const database = createDatabase({connectionString: databaseUrl.toString(), max: 8}); pool = database.pool;
    const db = database.db;
    const auth = createAuth(db, {mailAdapter: new LocalMailAdapter()});
    const cookies = new Map<string, string>();
    function cookieHeaders(): Headers { return new Headers({cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), origin: new URL(env.appUrl).origin, 'content-type': 'application/json'}); }
    async function request(path: string, body?: unknown): Promise<Response> {
      const response = await auth.handler(new Request(new URL(`/api/auth${path}`, env.appUrl), {method: body === undefined ? 'GET' : 'POST', headers: cookieHeaders(), ...(body === undefined ? {} : {body: JSON.stringify(body)})}));
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';'); const boundary = pair!.indexOf('=');
        cookies.set(pair!.slice(0, boundary), pair!.slice(boundary + 1));
      }
      return response;
    }
    const email = `operator-mfa-${randomUUID()}@example.test`;
    const password = `Local-${randomUUID()}`;
    assert.equal((await request('/sign-up/email', {name: 'Local MFA probe', email, password})).status, 200);
    const user = (await db.select().from(authUser).where(eq(authUser.email, email)))[0]!;
    await db.update(authUser).set({emailVerified: true}).where(eq(authUser.id, user.id));
    await db.insert(operatorRoles).values({userId: user.id, role: 'operator', grantedAt: new Date(), updatedAt: new Date()});
    assert.equal((await request('/sign-in/email', {email, password})).status, 200);
    const before = await auth.api.getSession({headers: cookieHeaders()}); assert.ok(before);
    const beforeActor = {userId: user.id, sessionId: before.session.id};
    assert.equal((await requireOperatorIdentity(db, beforeActor)).role, 'operator');
    await assert.rejects(requireCurrentOperator(db, beforeActor), forbidden);
    const enrollment = await request('/two-factor/enable', {password, method: 'totp'});
    assert.equal(enrollment.status, 200);
    const setup = await enrollment.json() as {totpURI: string; backupCodes: string[]};
    const secret = new URL(setup.totpURI).searchParams.get('secret'); assert.ok(secret); assert.ok(setup.backupCodes.length);
    assert.equal((await request('/two-factor/verify-totp', {code: 'invalid', trustDevice: false})).status, 401);
    assert.equal((await db.select().from(operatorStepUps)).length, 0, 'Invalid TOTP must not stamp the session.');
    const code = totp(secret);
    assert.equal((await request('/two-factor/verify-totp', {code, trustDevice: false})).status, 200);
    const verified = await auth.api.getSession({headers: cookieHeaders()}); assert.ok(verified);
    const actor = {userId: user.id, sessionId: verified.session.id};
    assert.notEqual(actor.sessionId, beforeActor.sessionId, 'Enrollment rotates the old session.');
    assert.equal((await requireCurrentOperator(db, actor)).role, 'operator');
    assert.equal((await authorizeOperatorCommand(db, actor)).role, 'operator');
    await assert.rejects(requireCurrentOperator(db, beforeActor), forbidden);
    const stamp = (await db.select().from(operatorStepUps).where(eq(operatorStepUps.sessionId, actor.sessionId)))[0]!; assert.ok(stamp);
    const later = new Date(stamp.verifiedAt.getTime() + OPERATOR_STEP_UP_TTL_MS + 1);
    assert.equal((await requireCurrentOperator(db, actor, 'operator', later)).role, 'operator', 'MFA completion remains valid for reads within the live session.');
    await assert.rejects(authorizeOperatorCommand(db, actor, 'operator', later), forbidden);
    await db.insert(authSession).values({id: 'wrong-session', userId: user.id, token: randomUUID(), createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000)});
    await assert.rejects(requireCurrentOperator(db, {userId: user.id, sessionId: 'wrong-session'}), forbidden);
    await request('/sign-out', {});
    const login = await request('/sign-in/email', {email, password});
    assert.equal(login.status, 200); assert.equal((await login.json() as {twoFactorRedirect: boolean}).twoFactorRedirect, true);
    assert.equal(await auth.api.getSession({headers: cookieHeaders()}), null);
    assert.equal((await request('/two-factor/verify-totp', {code: totp(secret), trustDevice: false})).status, 200);
    const relogin = await auth.api.getSession({headers: cookieHeaders()}); assert.ok(relogin);
    assert.equal((await authorizeOperatorCommand(db, {userId: user.id, sessionId: relogin.session.id})).role, 'operator');
    await db.update(operatorRoles).set({revokedAt: new Date()}).where(eq(operatorRoles.userId, user.id));
    await assert.rejects(requireCurrentOperator(db, {userId: user.id, sessionId: relogin.session.id}), forbidden);
    await db.update(operatorRoles).set({revokedAt: null}).where(eq(operatorRoles.userId, user.id));
    assert.equal((await request('/two-factor/disable', {password})).status, 200);
    assert.equal((await db.select().from(operatorStepUps)).length, 0, 'Disabling the factor removes all prior operator stamps.');
    const disabled = await auth.api.getSession({headers: cookieHeaders()}); assert.ok(disabled);
    await assert.rejects(requireCurrentOperator(db, {userId: user.id, sessionId: disabled.session.id}), forbidden);
    console.log(JSON.stringify({status: 'PASS', databaseName, enrollment: true, invalidCodeRejected: true, sessionRotation: true, sameSession: true, wrongSessionRejected: true, expiredStepUpRejected: true, mfaLoginChallenge: true, roleRevocation: true, disableRevokesStamps: true, externalAccountsUsed: false}));
  } finally {
    if (pool) await pool.end();
    if (created) { await admin.query(`drop database "${databaseName}" with (force)`); console.log(JSON.stringify({disposableDatabaseRemoved: true, databaseName})); }
    await admin.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : 'Second-factor probe failed.'); process.exitCode = 1; });
