import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {existsSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {Client, Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {eq} from 'drizzle-orm';

import {createFakeBillingProvider, type BillingCheckoutProvider} from '../src/adapters/billing/fake.ts';
import {createDatabase} from '../src/db/client.ts';
import {billingAccounts, billingCheckoutAttempts} from '../src/db/schema/billing.ts';
import {userAccessControls} from '../src/db/schema/access.ts';
import {authUser} from '../src/db/schema/auth.ts';
import {workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {openBillingPortal, openCheckout} from '../src/modules/billing/checkout.ts';

for (const file of ['.env', '.env.local']) if (existsSync(file)) globalThis.process.loadEnvFile(file);
const env = globalThis.process['env'];
const configured = new URL(env.DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname), 'Checkout probe requires local PostgreSQL.');
const databaseName = `m5_checkout_probe_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(configured); adminUrl.pathname = '/postgres';
const probeUrl = new URL(configured); probeUrl.pathname = `/${databaseName}`;
const admin = new Client({connectionString: adminUrl.toString()});
const databaseUrl = probeUrl.toString();
const owner = 'checkout-owner';
const member = 'checkout-member';
const workspaceId = '00000000-0000-4000-8000-000000000901';
const now = new Date('2026-10-01T00:00:00.000Z');
const actor = {userId: owner, recentAuthenticationAt: now} as const;
const cases: string[] = [];
let appPool: Pool | undefined;

async function expectDomainFailure(name: string, work: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(work, (error: unknown) => error && typeof error === 'object' && 'code' in error && error.code === code, name);
  cases.push(name);
}

async function prepareMigrations(client: Client): Promise<void> {
  const source = resolve('src/db/migrations');
  const temporary = mkdtempSync(join(tmpdir(), 'shpitto-checkout-migrations-'));
  try {
    mkdirSync(join(temporary, 'meta'));
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8')) as {entries: {idx: number; tag: string}[]};
    writeFileSync(join(temporary, 'meta/_journal.json'), JSON.stringify(journal), 'utf8');
    for (const entry of journal.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(temporary, `${entry.tag}.sql`));
    await migrate(drizzle(client), {migrationsFolder: temporary});
  } finally { rmSync(temporary, {recursive: true, force: true}); }
}

async function run(): Promise<void> {
  await admin.connect();
  let created = false;
  try {
    await admin.query(`create database "${databaseName}"`); created = true;
    const appClient = new Client({connectionString: databaseUrl});
    await appClient.connect();
    await prepareMigrations(appClient);
    await appClient.end();
    const database = createDatabase({connectionString: databaseUrl, max: 10});
    appPool = database.pool;
    await database.db.insert(authUser).values([
      {id: owner, name: 'Checkout owner', email: `${owner}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
      {id: member, name: 'Checkout member', email: `${member}@example.test`, emailVerified: true, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(userAccessControls).values([
      {userId: owner, status: 'active', disabledAt: null, reason: null, version: 1, createdAt: now, updatedAt: now},
      {userId: member, status: 'active', disabledAt: null, reason: null, version: 1, createdAt: now, updatedAt: now},
    ]);
    await database.db.insert(workspaces).values({id: workspaceId, kind: 'team', name: 'Checkout workspace', createdBy: owner, status: 'active', version: 1, createdAt: now, updatedAt: now});
    await database.db.insert(workspaceMembers).values([
      {workspaceId, userId: owner, role: 'owner', createdAt: now},
      {workspaceId, userId: member, role: 'member', createdAt: now},
    ]);
    await database.db.insert(billingAccounts).values({workspaceId, status: 'active', holdReason: null, version: 1, createdAt: now, updatedAt: now});

    const provider = createFakeBillingProvider();
    const first = await openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'checkout-owner-1', catalogProductKey: 'fixture-monthly', profile: 'local', provider, now});
    assert.equal(first.status, 'open'); assert.ok(first.sessionId); assert.ok(first.checkoutUrl); cases.push('owner receives workspace-bound local Checkout session');
    const replay = await openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'checkout-owner-1', catalogProductKey: 'fixture-monthly', profile: 'local', provider, now});
    assert.equal(replay.sessionId, first.sessionId); assert.equal(replay.checkoutUrl, first.checkoutUrl); cases.push('same command key replays the same Checkout session');
    await expectDomainFailure('member cannot create Checkout', () => openCheckout(database.db, {actor: {userId: member, recentAuthenticationAt: now}, workspaceId, idempotencyKey: 'checkout-member-1', catalogProductKey: 'fixture-pack', profile: 'local', provider, now}), 'FORBIDDEN');
    await expectDomainFailure('recurring Checkout slot rejects a second request', () => openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'checkout-owner-2', catalogProductKey: 'fixture-monthly', profile: 'local', provider, now}), 'CONFLICT');
    await expectDomainFailure('client cannot inject a customer or price', () => openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'checkout-owner-inject', catalogProductKey: {priceReference: 'evil'}, profile: 'local', provider, now}), 'VALIDATION');
    await database.db.update(billingAccounts).set({status: 'hold', holdReason: 'recovery'}).where(eq(billingAccounts.workspaceId, workspaceId));
    await expectDomainFailure('billing hold blocks Checkout', () => openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'checkout-owner-hold', catalogProductKey: 'fixture-pack', profile: 'local', provider, now}), 'FORBIDDEN');
    const portal = await openBillingPortal(database.db, {actor, workspaceId, idempotencyKey: 'portal-owner-1', profile: 'local', appUrl: 'http://localhost:3100', provider, now});
    assert.match(portal.portalUrl, /^http:\/\/localhost:3100\/billing\/portal\/fixture\//);
    const portalReplay = await openBillingPortal(database.db, {actor, workspaceId, idempotencyKey: 'portal-owner-1', profile: 'local', appUrl: 'http://localhost:3100', provider, now});
    assert.equal(portalReplay.replayed, true);
    assert.equal(portalReplay.portalUrl, portal.portalUrl);
    assert.equal(portalReplay.customerId, portal.customerId);
    cases.push('owner can open fixed-return billing portal during hold');
    cases.push('portal response loss/replay preserves URL and provider customer identity');
    let unknownCalls = 0;
    const unknownProvider: BillingCheckoutProvider = {
      provider: 'fixture',
      async createCheckout() { unknownCalls += 1; return unknownCalls === 1 ? {unknown: true} : {sessionId: 'fixture_session_recovered', url: 'http://localhost:3100/checkout/fixture/recovered'}; },
      async createPortal() { return {url: 'http://localhost:3100/billing/portal/fixture/recovered'}; },
    };
    // Clear the hold via the same DB row solely for the local lost-response exercise.
    await database.db.update(billingAccounts).set({status: 'active', holdReason: null}).where(eq(billingAccounts.workspaceId, workspaceId));
    const uncertain = await openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'checkout-owner-unknown', catalogProductKey: 'fixture-pack', profile: 'local', provider: unknownProvider, now});
    assert.equal(uncertain.status, 'unknown');
    const recovered = await openCheckout(database.db, {actor, workspaceId, idempotencyKey: 'checkout-owner-unknown', catalogProductKey: 'fixture-pack', profile: 'local', provider: unknownProvider, now});
    assert.equal(recovered.status, 'open'); assert.equal(recovered.sessionId, 'fixture_session_recovered'); cases.push('lost provider response retains attempt and retries same idempotency identity');
    const attempts = await database.db.select().from(billingCheckoutAttempts);
    assert.equal(attempts.filter((attempt) => attempt.kind === 'subscription' && ['creating', 'open', 'unknown'].includes(attempt.status)).length, 1);
    assert.ok(attempts.find((attempt) => attempt.kind === 'subscription')?.expiresAt, 'Checkout attempts retain a bounded reconciliation deadline.');
    cases.push('database contains one unresolved recurring slot');
    await database.pool.end(); appPool = undefined;
    console.log(JSON.stringify({status: 'PASS', databaseName, cases, count: cases.length}));
  } finally {
    if (appPool) { await appPool.end().catch(() => undefined); appPool = undefined; }
    if (created) { await admin.query(`drop database "${databaseName}" with (force)`); assert.equal((await admin.query('select 1 from pg_database where datname=$1', [databaseName])).rowCount, 0); console.log(JSON.stringify({disposableDatabaseRemoved: true, databaseName})); }
    await admin.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Checkout probe failed.'); globalThis.process.exitCode = 1; });
