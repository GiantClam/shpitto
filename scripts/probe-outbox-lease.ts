import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {and, eq} from 'drizzle-orm';

import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {outboxEvents} from '../src/db/schema/credit.ts';
import {assertOutboxLeaseInTransaction, claimOutbox, acknowledgeOutbox, heartbeatOutbox, OUTBOX_HEARTBEAT_INTERVAL_MS} from '../src/modules/generation/outbox.ts';

const now = new Date('2026-09-29T08:00:00.000Z');
const workspaceId = '00000000-0000-4000-8000-000000000923';

async function run(): Promise<void> {
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  await migrate(drizzle(migrationClient), {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
  await migrationClient.end();
  const database = createDatabase();
  try {
    await database.pool.query('delete from app.outbox_events where business_key = $1', ['probe-lease']);
    const eventId = randomUUID();
    await database.pool.query(`insert into app.outbox_events (id, event_type, business_key, payload, status, available_at, lease_generation, attempts, created_at) values ($1::uuid, 'probe', 'probe-lease', '{}'::jsonb, 'pending', $2, 0, 0, $2)`, [eventId, now]);
    const first = await claimOutbox(database.db, 'worker-a', now);
    if (!first) throw new Error('outbox claim returned no row');
    const stale = await acknowledgeOutbox(database.db, {...first, owner: 'worker-b'}, now);
    if (stale) throw new Error('stale owner acknowledged a lease');
    if (OUTBOX_HEARTBEAT_INTERVAL_MS > 20_000) throw new Error('outbox heartbeat interval exceeds the 20 second contract');
    const heartbeatNow = new Date(now.getTime() + 30_000);
    const renewed = await heartbeatOutbox(database.db, first, heartbeatNow);
    if (!renewed) throw new Error('current owner failed to renew a live lease');
    let unlock!: () => void;
    let locked!: () => void;
    const lockReady = new Promise<void>((resolve) => { locked = resolve; });
    const holdLock = new Promise<void>((resolve) => { unlock = resolve; });
    const fencedWrite = database.db.transaction(async (tx) => {
      await assertOutboxLeaseInTransaction(tx, first, heartbeatNow);
      locked();
      await holdLock;
    });
    await lockReady;
    const expiresAt = new Date(now.getTime() + 90_000);
    const blockedReclaim = await claimOutbox(database.db, 'worker-b', expiresAt);
    if (blockedReclaim) throw new Error('a new owner reclaimed a lease while the fenced write held its row lock');
    unlock();
    await fencedWrite;
    const second = await claimOutbox(database.db, 'worker-b', new Date(expiresAt.getTime() + 1));
    if (!second || second.generation <= first.generation) throw new Error('a lease was not reclaimable after the fenced transaction committed');
    let staleFenceRejected = false;
    try {
      await database.db.transaction((tx) => assertOutboxLeaseInTransaction(tx, first, new Date(expiresAt.getTime() + 1)));
    } catch (error) {
      staleFenceRejected = error instanceof Error && error.message === 'The worker lease is no longer current.';
    }
    if (!staleFenceRejected) throw new Error('a stale generation passed the transactional lease fence');
    const staleAcknowledged = await acknowledgeOutbox(database.db, first, new Date(expiresAt.getTime() + 1));
    if (staleAcknowledged) throw new Error('stale owner acknowledged a reclaimed lease');
    const acknowledged = await acknowledgeOutbox(database.db, second, new Date(expiresAt.getTime() + 1));
    if (!acknowledged) throw new Error('current owner failed to acknowledge a lease');
    const rows = await database.db.select({status: outboxEvents.status, attempts: outboxEvents.attempts}).from(outboxEvents).where(eq(outboxEvents.id, eventId));
    if (rows[0]?.status !== 'published' || rows[0]?.attempts !== 2) throw new Error('outbox lease state was not persisted');
    console.log(JSON.stringify({status: 'PASS', staleRejected: true, transactionFence: true, reclaimBlockedDuringFence: true, heartbeatIntervalMs: OUTBOX_HEARTBEAT_INTERVAL_MS, renewedAt30s: true, acknowledged: true, attempts: rows[0].attempts}));
  } finally {
    await database.pool.query('delete from app.outbox_events where business_key = $1', ['probe-lease']);
    await database.pool.end();
  }
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
