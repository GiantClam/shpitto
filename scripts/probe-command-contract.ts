import {resolve} from 'node:path';
import {rejects} from 'node:assert/strict';

import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {commandKeyFromRequest, hasTrustedMutationOrigin, parseDecimalInteger, semanticHash} from '../src/contracts/http.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {executeDurableCommand} from '../src/modules/shared/commands.ts';

const actorUserId = 'probe-command-actor';
const workspaceId = '00000000-0000-4000-8000-000000000801';
const idempotencyKey = 'probe-command-replay-1';
const now = new Date('2026-01-01T00:00:00.000Z');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
  const database = createDatabase();
  const db = database.db;
  try {
    await migrate(db, {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
    await database.pool.query('delete from app.command_results where actor_user_id = $1', [actorUserId]);
    await database.pool.query('delete from app.workspaces where id = $1::uuid', [workspaceId]);
    await database.pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at)
       values ($1, 'Command Probe', $2, true, $3, $3)
       on conflict (id) do nothing`,
      [actorUserId, `${actorUserId}@example.test`, now],
    );
    await database.pool.query(
      `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
       values ($1::uuid, 'team', 'Command Probe', $2, $3, $3)`,
      [workspaceId, actorUserId, now],
    );

    const identity = {
      actorUserId,
      workspaceId,
      commandName: 'probe.command',
      idempotencyKey,
      payload: {amount: 900n, nested: {b: 2, a: 1}},
    } as const;
    const first = await db.transaction(async (tx) => executeDurableCommand(tx, identity, async () => ({
      effectId: 'effect-1',
      amount: 900n,
    })));
    assert(!first.replayed && first.value.effectId === 'effect-1', 'Initial command must execute exactly once.');

    const replay = await db.transaction(async (tx) => executeDurableCommand(tx, identity, async () => {
      throw new Error('replay executed business effect twice');
    }));
    assert(replay.replayed, 'A repeated semantic command must replay the stored result.');
    assert((replay.value as {amount: unknown}).amount === '900', 'Bigint result must serialize as a decimal string.');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const repeated = await db.transaction((tx) => executeDurableCommand(tx, {...identity, payload: {nested: {a: 1, b: 2}, amount: 900n}}, async () => { throw new Error('duplicate effect'); }));
      assert(repeated.replayed, 'Reordered semantic replay must be committed once.');
    }

    let raceEffects = 0;
    const raceIdentity = {...identity, idempotencyKey: 'probe-command-race-1'};
    const race = await Promise.all(Array.from({length: 10}, () =>
      db.transaction(async (tx) => executeDurableCommand(tx, raceIdentity, async () => {
        raceEffects += 1;
        return {effectId: 'race-effect'};
      })),
    ));
    assert(raceEffects === 1 && race.filter((entry) => entry.replayed).length === 9, 'Ten concurrent semantic replays must commit one business effect.');
    const committedRows = await database.pool.query('select count(*)::int as count from app.command_results where workspace_id = $1::uuid and status = $2', [workspaceId, 'committed']);
    assert(committedRows.rows[0]?.count === 2, 'The original and race commands must produce exactly two durable identities.');
    await rejects(db.transaction((tx) => executeDurableCommand(tx, {...identity, commandName: 'invalid command'}, async () => null)), (error: unknown) => error instanceof DomainError && error.code === 'VALIDATION');
    await rejects(db.transaction((tx) => executeDurableCommand(tx, {...identity, actorUserId: ' '}, async () => null)), (error: unknown) => error instanceof DomainError && error.code === 'VALIDATION');

    let mismatchRejected = false;
    try {
      await db.transaction(async (tx) => executeDurableCommand(tx, {...identity, payload: {...identity.payload, amount: 901n}}, async () => ({effectId: 'bad'})));
    } catch {
      mismatchRejected = true;
    }
    assert(mismatchRejected, 'Mismatched semantic payload reuse must be rejected.');

    const validKey = commandKeyFromRequest(new Request('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {'Idempotency-Key': idempotencyKey},
    }), {});
    assert(validKey === idempotencyKey, 'Header idempotency key must parse.');
    assert(hasTrustedMutationOrigin(new Request('http://localhost:3000/api/test', {method: 'POST', headers: {Origin: 'http://localhost:3000'}}), 'http://localhost:3000'), 'Trusted same-origin mutation must pass.');
    assert(!hasTrustedMutationOrigin(new Request('http://localhost:3000/api/test', {method: 'POST', headers: {Origin: 'https://evil.example'}}), 'http://localhost:3000'), 'Forged-origin mutation must fail.');
    let invalidQuantityRejected = false;
    try {
      parseDecimalInteger(900n);
    } catch {
      invalidQuantityRejected = true;
    }
    assert(invalidQuantityRejected, 'Quantities must cross JSON boundaries as decimal strings.');
    assert(semanticHash('probe.command', {a: 1, b: 2}) === semanticHash('probe.command', {b: 2, a: 1}), 'Semantic hashing must be key-order independent.');

    console.log(JSON.stringify({
      status: 'PASS',
      replayed: replay.replayed,
      mismatchRejected,
      bigintAsDecimalString: true,
      quantityBoundaryRejected: invalidQuantityRejected,
      stableSemanticHash: true,
      forgedOriginRejected: true,
      raceEffects,
      raceAttempts: 10,
      replayCount: 20,
      raceReplayed: race.map((entry) => entry.replayed),
    }));
  } finally {
    await database.pool.query('delete from app.command_results where actor_user_id = $1', [actorUserId]);
    await database.pool.query('delete from app.workspaces where id = $1::uuid', [workspaceId]);
    await database.pool.query('delete from "user" where id = $1', [actorUserId]);
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
