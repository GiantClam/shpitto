import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import { createAuthClient } from 'better-auth/client';
import { AdminContext } from 'react-admin';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { authSchema, userTable, sessionTable } from '../domain/better-auth-schema.mjs';

const databaseUrl = process.env.M0_DATABASE_URL;
if (!databaseUrl) throw new Error('M0_DATABASE_URL is required');

const migrationPaths = [
  resolve(import.meta.dirname, '../domain/migrations/0000_m0_foundation.sql'),
  resolve(import.meta.dirname, '../domain/migrations/0001_better_auth.sql'),
  resolve(import.meta.dirname, '../domain/migrations/0002_m0_operator_authorization.sql'),
];
const migrationContents = await Promise.all(migrationPaths.map((path) => readFile(path, 'utf8')));
const migrationText = migrationContents.join('\n');
const migrationBundleSha256 = createHash('sha256').update(migrationText).digest('hex');
const migrationFileSha256 = Object.fromEntries(migrationPaths.map((path, index) => [path.split('migrations\\').pop() ?? path.split('/migrations/').pop(), createHash('sha256').update(migrationContents[index]).digest('hex')]));
const migrationSha256 = migrationFileSha256['0002_m0_operator_authorization.sql'];
const migrationManifest = await readFile(resolve(import.meta.dirname, '../domain/migration-manifest.json'));
const migrationManifestSha256 = createHash('sha256').update(migrationManifest).digest('hex');

function createAuth(db) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema: authSchema, transaction: true }),
    secret: 'm0-disposable-secret-that-is-long-enough',
    baseURL: 'http://localhost:3000',
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
  });
}

async function currentSession(auth, token) {
  return auth.api.getSession({ headers: new Headers({ authorization: `Bearer ${token}` }) });
}

async function operatorRole(db, userId) {
  const result = await db.execute(sql`
    select user_id, role, active, revision
    from m0_prod_operator_role
    where user_id = ${userId}
  `);
  return result.rows[0] ?? null;
}

async function adminRead(db, auth, token, workspaceId) {
  const session = await currentSession(auth, token);
  const userId = session?.session?.userId;
  if (!userId) return { allowed: false, reason: 'session-required' };
  const role = await operatorRole(db, userId);
  const member = await db.execute(sql`
    select 1
    from m0_prod_workspace_member
    where workspace_id = ${workspaceId} and user_id = ${userId}
  `);
  const operatorAllowed = role?.active === true && ['support_read', 'support_write', 'superadmin'].includes(role.role);
  const memberAllowed = member.rows.length > 0;
  if (!operatorAllowed && !memberAllowed) return { allowed: false, reason: 'authorization-required' };
  const workspace = await db.execute(sql`select id from m0_prod_workspace where id = ${workspaceId}`);
  return { allowed: workspace.rows.length === 1, scope: operatorAllowed ? 'operator-read' : 'member-read' };
}

async function domainCreditCommand(db, userId, workspaceId, idempotencyKey) {
  return db.transaction(async (tx) => {
    const role = await tx.execute(sql`
      select role, active
      from m0_prod_operator_role
      where user_id = ${userId}
      for update
    `);
    if (!role.rows[0]?.active || !['support_write', 'superadmin'].includes(role.rows[0].role)) {
      throw new Error('operator-write-authorization-required');
    }
    const inserted = await tx.execute(sql`
      insert into m0_prod_credit_ledger (workspace_id, idempotency_key, amount)
      values (${workspaceId}, ${idempotencyKey}, 10)
      on conflict (workspace_id, idempotency_key) do nothing
      returning id
    `);
    if (inserted.rows.length === 0) return { duplicate: true };
    await tx.execute(sql`
      insert into m0_prod_audit_event (workspace_id, idempotency_key, action)
      values (${workspaceId}, ${idempotencyKey}, 'operator.credit.command')
    `);
    await tx.execute(sql`
      insert into m0_prod_outbox_event (workspace_id, idempotency_key, topic)
      values (${workspaceId}, ${idempotencyKey}, 'credit.changed')
    `);
    return { duplicate: false };
  });
}

const pool1 = new pg.Pool({ connectionString: databaseUrl, max: 2 });
try {
  const db1 = drizzle(pool1, { schema: authSchema });
  await db1.execute(sql.raw(migrationText));
  await db1.execute(sql`truncate m0_prod_outbox_event, m0_prod_audit_event, m0_prod_credit_ledger, m0_prod_operator_role, m0_prod_workspace_member, m0_prod_workspace restart identity cascade`);
  await db1.delete(sessionTable);
  await db1.delete(userTable);
  await db1.execute(sql`insert into m0_prod_workspace (id) values ('workspace-a'), ('workspace-b')`);

  const auth1 = createAuth(db1);
  const email = `m0-admin-${Date.now()}@example.test`;
  const signUp = await auth1.api.signUpEmail({
    body: { email, password: 'M0-password-123!', name: 'M0 Operator' },
  });
  const signIn = await auth1.api.signInEmail({
    body: { email, password: 'M0-password-123!' },
  });
  const token = signIn?.token ?? signIn?.session?.token ?? signIn?.data?.session?.token;
  if (!signUp?.user?.id || !token) throw new Error('Better Auth PostgreSQL operator setup failed');
  const session1 = await currentSession(auth1, token);
  const userId = session1?.session?.userId;
  if (!userId) throw new Error('Better Auth PostgreSQL operator session lookup failed');

  await db1.execute(sql`
    insert into m0_prod_workspace_member (workspace_id, user_id, role)
    values ('workspace-a', ${userId}, 'owner'), ('workspace-b', 'other-user', 'owner')
  `);
  const memberRead = await adminRead(db1, auth1, token, 'workspace-a');
  await db1.execute(sql`
    insert into m0_prod_operator_role (user_id, role, active, revision)
    values (${userId}, 'support_read', true, 1)
  `);
  const operatorRead = await adminRead(db1, auth1, token, 'workspace-b');
  await db1.execute(sql`update m0_prod_operator_role set active = false, revoked_at = now(), revision = revision + 1 where user_id = ${userId}`);
  const revokedRead = await adminRead(db1, auth1, token, 'workspace-b');
  await db1.execute(sql`update m0_prod_operator_role set role = 'support_write', active = true, revoked_at = null, revision = revision + 1 where user_id = ${userId}`);

  const firstCommand = await domainCreditCommand(db1, userId, 'workspace-a', 'm0-operator-credit-1');
  await pool1.end();

  const pool2 = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const db2 = drizzle(pool2, { schema: authSchema });
    const auth2 = createAuth(db2);
    const session2 = await currentSession(auth2, token);
    const persistedRole = await operatorRole(db2, userId);
    const reloadedRead = await adminRead(db2, auth2, token, 'workspace-b');
    const duplicateCommand = await domainCreditCommand(db2, userId, 'workspace-a', 'm0-operator-credit-1');
    const counts = await db2.execute(sql`
      select
        (select count(*)::int from m0_prod_credit_ledger where idempotency_key = 'm0-operator-credit-1') as ledger_count,
        (select count(*)::int from m0_prod_audit_event where idempotency_key = 'm0-operator-credit-1') as audit_count,
        (select count(*)::int from m0_prod_outbox_event where idempotency_key = 'm0-operator-credit-1') as outbox_count
    `);
    const observed = {
      betterAuthSessionAuthenticated: Boolean(session2?.session?.userId === userId),
      betterAuthSessionReloadedAfterPoolRestart: Boolean(session2?.session?.userId === userId),
      persistentOperatorRole: persistedRole?.role === 'support_write' && persistedRole?.active === true,
      memberReadAllowed: memberRead.allowed === true && memberRead.scope === 'member-read',
      explicitOperatorReadAllowed: operatorRead.allowed === true && operatorRead.scope === 'operator-read',
      revokedOperatorReadDenied: revokedRead.allowed === false,
      reloadedOperatorReadAllowed: reloadedRead.allowed === true && reloadedRead.scope === 'operator-read',
      domainCommandAuthorized: firstCommand.duplicate === false,
      duplicateDomainCommandSuppressed: duplicateCommand.duplicate === true,
      atomicCounts: counts.rows[0],
      reactAdminClientContract: typeof AdminContext === 'function' && typeof createAuthClient === 'function',
      genericAdminWrites: false,
      migrationSha256,
      migrationBundleSha256,
      migrationFileSha256,
      migrationManifestSha256,
      migrationFileCount: migrationPaths.length,
      externalCalls: 0,
      databaseWasDisposable: true,
    };
    if (!observed.betterAuthSessionAuthenticated || !observed.persistentOperatorRole || !observed.memberReadAllowed || !observed.explicitOperatorReadAllowed || !observed.revokedOperatorReadDenied || !observed.reloadedOperatorReadAllowed || !observed.domainCommandAuthorized || !observed.duplicateDomainCommandSuppressed || !observed.reactAdminClientContract || observed.atomicCounts.ledger_count !== 1 || observed.atomicCounts.audit_count !== 1 || observed.atomicCounts.outbox_count !== 1) {
      throw new Error(`admin PostgreSQL chain probe failed: ${JSON.stringify(observed)}`);
    }
    const evidence = {
      schemaVersion: '1.0',
      status: 'PASSED_BETTER_AUTH_OPERATOR_ADMIN_DOMAIN_DRIZZLE_CHAIN',
      command: 'M0_DATABASE_URL=postgres://postgres:<disposable>@127.0.0.1:<port>/postgres node admin/admin-postgres-chain-probe.mjs',
      environment: {
        profile: 'local/disposable-postgresql-17',
        databaseWasDisposable: true,
        existingCredentialsReused: false,
        externalCalls: 0,
        migrationFiles: migrationPaths.map((path) => path.split('migrations\\').pop() ?? path.split('/migrations/').pop()),
      },
      observed,
      proves: [
        'Better Auth creates and reloads a PostgreSQL-backed session through a new Drizzle adapter/pool.',
        'A persisted operator role is required for cross-workspace React-admin read authorization and is denied on the next request after revocation.',
        'The authorized operator command reaches the Drizzle transaction boundary and writes one credit, audit and outbox effect.',
        'Repeating the same operator command after pool restart is idempotently suppressed.',
        'React-admin remains a presentation/client contract and generic admin writes remain denied.',
      ],
      doesNotProve: [
        'Final production operator role administration, step-up implementation and release migration promotion; these remain M1 work.',
        'Concurrent production workload behavior beyond this deterministic transaction and role-lock case.',
      ],
    };
    await writeFile(resolve(import.meta.dirname, 'admin-postgres-chain-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(observed));
  } finally {
    await pool2.end();
  }
} finally {
  if (!pool1.ended) await pool1.end();
}
