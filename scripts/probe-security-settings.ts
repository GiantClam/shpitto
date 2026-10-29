import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {Client, Pool} from 'pg';

import {getServerEnv} from '../src/config/env.ts';
import {DomainError} from '../src/db/contracts.ts';
import {createDatabase} from '../src/db/client.ts';
import {authSession, authUser} from '../src/db/schema/auth.ts';
import {auditEvents} from '../src/db/schema/credit.ts';
import {securitySettings} from '../src/db/schema/security.ts';
import {authorizeOperatorCommand, requireCurrentOperator} from '../src/modules/operations/authorize.ts';
import {administerOperatorOwner} from '../src/modules/operations/bootstrap.ts';
import {createTeamWorkspace} from '../src/modules/workspaces/commands.ts';
import {publicSecuritySettings, readSecuritySettings, updateSecuritySettings} from '../src/modules/security/settings.ts';

const configured = new URL(getServerEnv().databaseUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)) throw new Error('Security settings probe requires disposable local PostgreSQL.');
const databaseName = `security_settings_probe_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(configured); adminUrl.pathname = '/postgres';
const databaseUrl = new URL(configured); databaseUrl.pathname = `/${databaseName}`;
const admin = new Client({connectionString: adminUrl.toString()});
const forbidden = (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN';
const conflict = (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT';

async function run(): Promise<void> {
  let created = false;
  let pool: Pool | undefined;
  await admin.connect();
  try {
    await admin.query(`create database "${databaseName}"`); created = true;
    const migration = new Client({connectionString: databaseUrl.toString()});
    await migration.connect();
    try { await migrate(drizzle(migration), {migrationsFolder: 'src/db/migrations'}); } finally { await migration.end(); }
    const database = createDatabase({connectionString: databaseUrl.toString(), max: 6}); pool = database.pool;
    const db = database.db;
    const now = new Date();
    const userId = `security-probe-${randomUUID()}`;
    const sessionId = `${userId}-session`;
    const email = `${userId}@example.test`;
    await db.insert(authUser).values({id: userId, name: userId, email, emailVerified: false, createdAt: now, updatedAt: now});
    await db.insert(authSession).values({id: sessionId, userId, token: randomUUID(), expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now});
    const bootstrap = {mode: 'bootstrap' as const, targetUserId: userId, reason: 'Optional email verification probe', changeReference: 'security-settings-probe'};
    assert.equal((await administerOperatorOwner(db, bootstrap)).applied, false);
    assert.equal((await administerOperatorOwner(db, {...bootstrap, apply: true})).applied, true, 'Initial admin ownership can be created without SMTP-backed email verification when that control is disabled.');
    const actor = {userId, sessionId};
    const defaults = await readSecuritySettings(db);
    assert.equal(defaults.emailVerificationEnabled, false);
    assert.equal(defaults.twoFactorRequired, false);
    assert.equal(defaults.turnstileEnabled, false);
    assert.equal((await requireCurrentOperator(db, actor)).role, 'superadmin');
    assert.equal((await authorizeOperatorCommand(db, actor)).role, 'superadmin');
    assert.ok((await createTeamWorkspace(db, {userId}, 'Password-only operator workspace')).workspaceId);

    const enabled = await updateSecuritySettings(db, {
      expectedVersion: defaults.version,
      emailVerificationEnabled: true,
      twoFactorRequired: true,
      turnstileEnabled: true,
      turnstileSiteKey: 'site-key-test',
      turnstileSecretKey: 'turnstile-secret-probe',
      smtpEnabled: true,
      smtpUrl: 'smtps://mailer:mail-secret@example.test:465',
      smtpFromEmail: 'no-reply@example.test',
      smtpFromName: 'Shpitto Probe',
    });
    assert.equal(enabled.version, defaults.version + 1);
    assert.equal(enabled.smtpConfigured, true);
    assert.equal('smtpUrl' in enabled, false);
    assert.equal('turnstileSecretKey' in enabled, false);
    const stored = (await db.select().from(securitySettings).where(eq(securitySettings.id, 'default')))[0]!;
    assert(!stored.smtpUrlCiphertext!.includes('mail-secret'));
    assert(!stored.turnstileSecretCiphertext!.includes('turnstile-secret-probe'));
    await assert.rejects(requireCurrentOperator(db, actor), forbidden);
    await assert.rejects(authorizeOperatorCommand(db, actor), forbidden);
    await assert.rejects(createTeamWorkspace(db, {userId}), forbidden);
    await assert.rejects(updateSecuritySettings(db, {expectedVersion: defaults.version, emailVerificationEnabled: false, twoFactorRequired: false, turnstileEnabled: false, turnstileSiteKey: '', smtpEnabled: false}), conflict);

    await db.update(authUser).set({emailVerified: true, twoFactorEnabled: true}).where(eq(authUser.id, userId));
    assert.equal((await publicSecuritySettings(await readSecuritySettings(db))).turnstileSiteKey, 'site-key-test');
    assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.commandName, 'operator.owner.bootstrap'))).length, 1);
    await pool.query('drop table app.security_settings');
    await pool.query(await readFile(resolve('src/db/migrations/0030_security_settings.sql'), 'utf8'));
    const migratedSettings = await readSecuritySettings(db);
    assert.equal(migratedSettings.emailVerificationEnabled, true, 'Upgrading an existing installation must preserve its pre-settings email-verification requirement.');
    assert.equal(migratedSettings.twoFactorRequired, true, 'An existing active operator must keep the prior strict 2FA behavior on upgrade.');
    console.log(JSON.stringify({status: 'PASS', defaultsOptional: true, passwordOnlyOperatorAllowed: true, strictPoliciesEnforced: true, encryptedSecrets: true, publicSecretProjection: true, staleVersionRejected: true, existingOperatorUpgradePreserves2FA: true, checks: 11}));
  } finally {
    await pool?.end();
    if (created) {
      await admin.query(`drop database "${databaseName}" with (force)`);
      assert.equal((await admin.query('select 1 from pg_database where datname=$1', [databaseName])).rowCount, 0);
    }
    await admin.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
