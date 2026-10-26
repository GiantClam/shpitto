import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';

import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client} from 'pg';

import {getServerEnv} from '../src/config/env.ts';
import {createDatabase} from '../src/db/client.ts';
import {affiliateSettings} from '../src/db/schema/affiliate.ts';
import {verifyReferralToken} from '../src/modules/affiliates/attribution.ts';
import {handleAffiliateReferral} from '../src/modules/affiliates/referral-http.ts';
import {referralTouchFromRequest} from '../src/modules/affiliates/request.ts';

const configured = new URL(getServerEnv().databaseUrl);
assert(['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname));
const name = 'm6_referral_' + randomUUID().replaceAll('-', '');
const admin = new Client({connectionString: configured.toString()});
await admin.connect();
await admin.query('CREATE DATABASE ' + name);
configured.pathname = '/' + name;
const database = createDatabase({connectionString: configured.toString()});
const db = database.db;
const secret = randomUUID() + randomUUID();
const now = new Date('2026-10-04T08:00:00.000Z');
const origin = 'http://localhost:3100';
const body = {touchReference: 'verified-touch'};
let verdict: 'verified' | 'invalid' | 'unavailable' | 'throw' = 'verified';
let reads = 0;
let resolutions = 0;
let duringVerification: (() => Promise<void>) | null = null;
const dependencies = {secret, programId: 'program', appUrl: origin, production: false, now: () => now, getDatabase: () => {reads += 1; return db;}, authority: {async resolveReferral(input: {touchReference: string; programId: string; capturedAt: Date; expiresAt: Date}) {resolutions += 1; assert.equal(input.touchReference, body.touchReference); assert.equal(input.programId, 'program'); await duringVerification?.(); if (verdict === 'throw' || verdict === 'unavailable') throw new Error('Provider unavailable.'); return verdict === 'invalid' ? null : {...input, affiliateId: 'verified-affiliate'};}}};
const request = (value: unknown = body, headers: Record<string, string> = {}, url = origin + '/api/affiliates/referral') => new Request(url, {method: 'POST', headers: {'content-type': 'application/json', origin: new URL(url).origin, cookie: 'shpitto_referral=keep-prior', ...headers}, body: typeof value === 'string' ? value : JSON.stringify(value)});
const retained = (response: Response) => assert.equal(response.headers.get('set-cookie'), null, 'Rejected capture must retain the previous browser touch.');
const checks: string[] = [];
try {
  await migrate(db, {migrationsFolder: 'src/db/migrations'});
  for (const [input, status] of [[request(body, {origin: 'https://foreign.example'}), 403], [request('{'), 400], [request({...body, touchReference: ' invalid '}), 400], [request({...body, touchReference: '\u0000'}), 400], [request({...body, padding: 'x'.repeat(4096)}), 400], [request({...body, capturedAt: now.toISOString()}), 400]] as const) {
    const response = await handleAffiliateReferral(input, dependencies);
    assert.equal(response.status, status);
    retained(response);
  }
  assert.equal(reads, 0, 'Invalid origin/body must be rejected before database access.');
  assert.equal(resolutions, 0);
  checks.push('same-origin-strict-bounded-input-before-io');
  const disabled = await handleAffiliateReferral(request(), dependencies);
  assert.equal(disabled.status, 200);
  retained(disabled);
  assert.equal(resolutions, 0, 'Disabled database integration must not call provider.');
  await db.update(affiliateSettings).set({enabled: 'enabled', accountId: 'account', programId: 'program'}).where(eq(affiliateSettings.id, 'default'));
  for (const invalid of ['invalid', 'unavailable', 'throw'] as const) {
    verdict = invalid;
    const response = await handleAffiliateReferral(request(), dependencies);
    assert.equal(response.status, invalid === 'invalid' ? 400 : 503);
    retained(response);
  }
  checks.push('disabled-invalid-unavailable-retain-prior-cookie');
  verdict = 'verified';
  const success = await handleAffiliateReferral(request(), dependencies);
  assert.equal(success.status, 200);
  assert.equal((await success.json()).status, 'captured');
  const cookie = success.headers.get('set-cookie')!;
  assert.match(cookie, /^shpitto_referral=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+;/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Lax/);
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; Max-Age=2592000/);
  assert.ok(!cookie.includes('Domain=') && !cookie.includes('; Secure'));
  const token = cookie.split(';')[0]!.slice('shpitto_referral='.length);
  const touch = verifyReferralToken(token, secret, {programId: 'program'}, now)!;
  assert.equal(touch.touchReference, body.touchReference);
  assert.equal(touch.expiresAt.getTime() - touch.capturedAt.getTime(), 30 * 86400_000);
  assert.equal(verifyReferralToken(token, secret, {programId: 'program'}, touch.expiresAt), null);
  const priorSecret = globalThis.process['env'].AFFILIATE_REFERRAL_SECRET;
  const priorProgram = globalThis.process['env'].AFFILIATE_PROGRAM_ID;
  try {
    globalThis.process['env'].AFFILIATE_REFERRAL_SECRET = secret;
    globalThis.process['env'].AFFILIATE_PROGRAM_ID = 'program';
    assert.equal(referralTouchFromRequest(new Request(origin, {headers: {cookie: cookie.split(';')[0]!}}), now)?.touchReference, body.touchReference);
  } finally {
    if (priorSecret === undefined) delete globalThis.process['env'].AFFILIATE_REFERRAL_SECRET; else globalThis.process['env'].AFFILIATE_REFERRAL_SECRET = priorSecret;
    if (priorProgram === undefined) delete globalThis.process['env'].AFFILIATE_PROGRAM_ID; else globalThis.process['env'].AFFILIATE_PROGRAM_ID = priorProgram;
  }
  checks.push('verified-server-signed-cookie-consumed-by-workspace-reader');
  const production = await handleAffiliateReferral(request(body, {}, 'https://example.test/api/affiliates/referral'), {...dependencies, production: true, appUrl: 'https://example.test'});
  assert.equal(production.status, 200);
  assert.match(production.headers.get('set-cookie')!, /; Secure/);
  const noTls = await handleAffiliateReferral(request(), {...dependencies, production: true});
  assert.equal(noTls.status, 503);
  retained(noTls);
  checks.push('production-cookie-requires-https-and-secure');
  duringVerification = async () => { await db.update(affiliateSettings).set({enabled: 'disabled'}).where(eq(affiliateSettings.id, 'default')); };
  const changed = await handleAffiliateReferral(request(), dependencies);
  assert.equal(changed.status, 503);
  retained(changed);
  checks.push('configuration-change-during-verification-fails-closed');
  console.log(JSON.stringify({status: 'PASS', scope: 'shared-referral-http-handler-local-docker', realAccountVerified: false, checks}));
} finally {
  await database.pool.end();
  await admin.query('DROP DATABASE ' + name);
  await admin.end();
}
