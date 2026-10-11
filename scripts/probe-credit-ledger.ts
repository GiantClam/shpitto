import {resolve} from 'node:path';

import {and, eq, sql} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createDatabase} from '../src/db/client.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../src/db/schema/credit.ts';
import {creditAccounts, creditGrants, workspaceMembers, workspaces} from '../src/db/schema/workspace.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';

const actorUserId = 'probe-credit-ledger-actor';
const workspaceId = '00000000-0000-4000-8000-000000000901';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000902';
const now = new Date('2026-01-01T00:00:00.000Z');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
  const database = createDatabase();
  const db = database.db;
  try {
    await migrate(db, {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
    await database.pool.query('delete from app.outbox_events where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.audit_events where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.credit_ledger_entries where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.credit_grants where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.credit_accounts where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.workspaces where id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from "user" where id = $1', [actorUserId]);
    await database.pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at)
       values ($1, 'Credit Ledger Probe', $2, true, $3, $3)`,
      [actorUserId, `${actorUserId}@example.test`, now],
    );
    await database.pool.query(
      `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
       values ($1::uuid, 'team', 'Credit Ledger Probe', $2, $3, $3),
              ($4::uuid, 'team', 'Credit Ledger Other', $2, $3, $3)`,
      [workspaceId, actorUserId, now, otherWorkspaceId],
    );
    await database.pool.query(
      `insert into app.workspace_members (workspace_id, user_id, role, created_at)
       values ($1::uuid, $3, 'owner', $2), ($4::uuid, $3, 'owner', $2)`,
      [workspaceId, now, actorUserId, otherWorkspaceId],
    );
    await database.pool.query(
      `insert into app.credit_accounts (workspace_id, created_at, updated_at)
       values ($1::uuid, $3, $3), ($2::uuid, $3, $3)`,
      [workspaceId, otherWorkspaceId, now],
    );

    const input = {
      actorUserId,
      workspaceId,
      commandName: 'credits.issue-grant',
      commandKey: 'probe-credit-grant-1',
      businessKey: 'probe-credit-grant-business-1',
      source: 'manual' as const,
      amount: 100n,
      expiresAt: null,
      payload: {amount: '100', source: 'manual'},
    };
    const issued = await issueGrant(db, input);
    const replay = await issueGrant(db, input);
    assert(!issued.replayed && replay.replayed && issued.grantId === replay.grantId, 'Grant issue must replay the same business result.');
    let mismatchRejected = false;
    try {
      await issueGrant(db, {...input, amount: 101n, payload: {amount: '101', source: 'manual'}});
    } catch {
      mismatchRejected = true;
    }
    assert(mismatchRejected, 'Business-key reuse with changed semantic payload must be rejected.');

    const invariant = await db.select({issued: creditGrants.issued, available: creditGrants.available, reserved: creditGrants.reserved, consumed: creditGrants.consumed, expired: creditGrants.expired, voided: creditGrants.voided}).from(creditGrants).where(eq(creditGrants.id, issued.grantId)).limit(1);
    assert(invariant[0] && invariant[0].issued === invariant[0].available + invariant[0].reserved + invariant[0].consumed + invariant[0].expired + invariant[0].voided, 'Grant buckets must reconcile.');

    let auditRollback = false;
    try {
      await issueGrant(db, {...input, commandKey: 'probe-credit-audit-fail', businessKey: 'probe-credit-audit-fail'}, {failAfter: 'audit'});
    } catch {
      auditRollback = true;
    }
    let outboxRollback = false;
    try {
      await issueGrant(db, {...input, commandKey: 'probe-credit-outbox-fail', businessKey: 'probe-credit-outbox-fail'}, {failAfter: 'outbox'});
    } catch {
      outboxRollback = true;
    }
    const failedRows = await db.select({count: sql<number>`count(*)`}).from(creditGrants).where(eq(creditGrants.workspaceId, workspaceId));
    const grantCount = Number(failedRows[0]?.count ?? 0);
    assert(auditRollback && outboxRollback && grantCount === 1, 'Injected audit/outbox failures must roll back grant and ledger state.');

    let crossTenantRejected = false;
    try {
      await db.insert(creditLedgerEntries).values({
        id: '00000000-0000-4000-8000-000000000903',
        workspaceId: otherWorkspaceId,
        grantId: issued.grantId,
        entryType: 'grant_issued',
        availableDelta: 1n,
        reservedDelta: 0n,
        consumedDelta: 0n,
        expiredDelta: 0n,
        voidedDelta: 0n,
        businessKey: 'probe-credit-cross-tenant',
        createdAt: now,
      });
    } catch {
      crossTenantRejected = true;
    }
    assert(crossTenantRejected, 'Ledger lineage must not cross workspaces.');

    const counts = await Promise.all([
      db.select({count: sql<number>`count(*)`}).from(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, workspaceId)),
      db.select({count: sql<number>`count(*)`}).from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)),
      db.select({count: sql<number>`count(*)`}).from(outboxEvents).where(eq(outboxEvents.workspaceId, workspaceId)),
    ]);
    console.log(JSON.stringify({
      status: 'PASS',
      replayed: replay.replayed,
      mismatchRejected,
      bucketEquality: true,
      auditRollback,
      outboxRollback,
      crossTenantRejected,
      ledgerRows: Number(counts[0][0]?.count ?? 0),
      auditRows: Number(counts[1][0]?.count ?? 0),
      outboxRows: Number(counts[2][0]?.count ?? 0),
    }));
  } finally {
    await database.pool.query('delete from app.outbox_events where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.audit_events where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.credit_ledger_entries where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.credit_grants where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.credit_accounts where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.workspace_members where workspace_id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from app.workspaces where id in ($1::uuid, $2::uuid)', [workspaceId, otherWorkspaceId]);
    await database.pool.query('delete from "user" where id = $1', [actorUserId]);
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
