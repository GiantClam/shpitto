import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';

import {sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createMigrationClient} from '../src/db/client.ts';
import {workspaces as workspaceTable} from '../src/db/schema/workspace.ts';
import {assertSameWorkspaceLineage, workspaceFixtures} from '../tests/fixtures/workspaces.ts';

const MIGRATION_LOCK_KEY = 'shpitto:drizzle:migrations:v1';
const now = new Date('2026-01-01T00:00:00.000Z');

const users = Object.values(workspaceFixtures.users);
const workspaces = Object.values(workspaceFixtures.workspaces);

async function run(): Promise<void> {
  const client = createMigrationClient();
  await client.connect();
  const db = drizzle(client);
  let lockHeld = false;

  try {
    await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [MIGRATION_LOCK_KEY]);
    lockHeld = true;
    await migrate(db, {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
    await migrate(db, {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});

    for (const user of users) {
      await client.query(
        `insert into "user" (id, name, email, email_verified, created_at, updated_at)
         values ($1, $2, $3, true, $4, $4)
         on conflict (id) do nothing`,
        [user.id, user.name, user.email, now],
      );
    }
    for (const workspace of workspaces) {
      await client.query(
        `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
         values ($1::uuid, $2, $3, $4, $5, $5)
         on conflict (id) do nothing`,
        [workspace.id, workspace.kind, workspace.name, workspace.createdBy, now],
      );
    }
    await client.query(
      `insert into app.workspace_members (workspace_id, user_id, role, created_at)
       values ($1::uuid, $2, 'owner', $3), ($4::uuid, $5, 'owner', $3), ($4::uuid, $6, 'member', $3)
       on conflict (workspace_id, user_id) do nothing`,
      [workspaces[0].id, users[0].id, now, workspaces[1].id, users[1].id, users[2].id],
    );
    await client.query(
      `insert into app.credit_accounts (workspace_id, created_at, updated_at)
       values ($1::uuid, $3, $3), ($2::uuid, $3, $3)
       on conflict (workspace_id) do nothing`,
      [workspaces[0].id, workspaces[1].id, now],
    );

    const grant = workspaceFixtures.creditGrants.W2;
    await client.query(
      `insert into app.credit_grants
       (id, workspace_id, source, issued, available, reserved, consumed, expired, voided, business_key, created_at)
       values ($1::uuid, $2::uuid, 'manual', $3, $3, 0, 0, 0, 0, $4, $5)
       on conflict (id) do nothing`,
      [grant.id, grant.workspaceId, grant.amount, 'fixture-w2-grant', now],
    );

    const drizzleWorkspaceRows = await db.select({id: workspaceTable.id}).from(workspaceTable)
      .where(sql`${workspaceTable.id} in (${sql.join(workspaces.map((workspace) => sql`${workspace.id}::uuid`), sql`, `)})`);

    let fixtureMismatchObserved = false;
    try {
      assertSameWorkspaceLineage(workspaces[0].id, grant.workspaceId);
    } catch {
      fixtureMismatchObserved = true;
    }
    if (!fixtureMismatchObserved) {
      throw new Error('M2 fixture must represent a cross-workspace grant');
    }

    let crossTenantRejected = false;
    let crossTenantConstraint: string | undefined;
    await client.query('begin');
    try {
      const reservationId = randomUUID();
      await client.query(
        `insert into app.credit_reservations (id, workspace_id, actor_user_id, command_name,
          idempotency_key, model_id, catalog_version, quantity, unit_cost, total_cost, quote_hash, created_at)
         values ($1::uuid, $2::uuid, $3, 'probe.foundation-lineage', $1, 'mock-video', 1, 1, 1, 1, 'probe-fixture', $4)`,
        [reservationId, workspaces[0].id, users[0].id, now],
      );
      try {
        await client.query(
          `insert into app.credit_allocations (id, workspace_id, reservation_id, grant_id, amount, created_at)
           values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, $5)`,
          [randomUUID(), workspaces[0].id, reservationId, grant.id, now],
        );
      } catch (error) {
        const failure = error as {code?: string; constraint?: string};
        crossTenantConstraint = failure.constraint;
        crossTenantRejected = failure.code === '23503' && failure.constraint === 'credit_allocations_grant_workspace_fk';
        if (!crossTenantRejected) throw error;
      }
    } finally {
      // Keep the reusable fixture unchanged even if the rejection regresses.
      await client.query('rollback');
    }

    let rollbackObserved = false;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
          values ('00000000-0000-4000-8000-000000000301', 'team', 'Rollback workspace', ${users[2].id}, ${now}, ${now})
        `);
        throw new Error('injected-m2-foundation-failure');
      });
    } catch (error) {
      rollbackObserved = error instanceof Error && error.message === 'injected-m2-foundation-failure';
    }

    const migrationRows = await client.query<{count: string}>('select count(*)::text as count from drizzle.__drizzle_migrations');
    const fixtureRows = await client.query<{count: string}>(
      'select count(*)::text as count from app.workspace_members where workspace_id in ($1::uuid, $2::uuid)',
      [workspaces[0].id, workspaces[1].id],
    );
    const rolledBackRows = await client.query<{count: string}>("select count(*)::text as count from app.workspaces where id = '00000000-0000-4000-8000-000000000301'");
    const result = {
      status: 'PASS',
      migrationRows: Number(migrationRows.rows[0]?.count ?? 0),
      fixtureMembershipRows: Number(fixtureRows.rows[0]?.count ?? 0),
      drizzleWorkspaceRows: drizzleWorkspaceRows.length,
      fixtureMismatchObserved,
      crossTenantRejected,
      crossTenantConstraint,
      rollbackObserved,
      rollbackRows: Number(rolledBackRows.rows[0]?.count ?? 0),
      conventions: {
        applicationIds: 'uuid',
        betterAuthIds: 'text',
        timestamps: 'UTC timestamptz',
        quantities: 'nonnegative bigint; decimal strings at JSON boundary',
      },
    };
    if (result.migrationRows < 8 || result.fixtureMembershipRows !== 3 || result.drizzleWorkspaceRows !== 2 || !result.fixtureMismatchObserved || !result.crossTenantRejected || !result.rollbackObserved || result.rollbackRows !== 0) {
      throw new Error(`M2 foundation probe failed: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify(result));
  } finally {
    if (lockHeld) await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [MIGRATION_LOCK_KEY]);
    await client.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
