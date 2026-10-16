import assert from 'node:assert/strict';
import {test} from 'node:test';

import {DomainError} from '../../src/db/contracts.ts';
import {voidUnusedGrantInTransaction} from '../../src/modules/credits/reversals.ts';

const input = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  grantId: '00000000-0000-4000-8000-000000000002',
  actorUserId: 'user-1',
  commandKey: 'refund:1',
  reason: 'full cash refund',
  now: new Date('2026-10-16T00:00:00.000Z'),
};

function transaction(grantRows: readonly object[], ledgerRows: readonly object[] = []) {
  let selectCount = 0;
  const updates: object[] = [];
  const inserts: object[] = [];
  const tx = {
    select() {
      const rows = selectCount++ === 0 ? grantRows : ledgerRows;
      return {
        from() {
          return {
            where() {
              return {
                for() {
                  return {limit: async () => rows};
                },
                limit: async () => rows,
              };
            },
          };
        },
      };
    },
    update() {
      return {
        set(value: object) {
          updates.push(value);
          return {where: async () => undefined};
        },
      };
    },
    insert() {
      return {
        values(value: object) {
          inserts.push(value);
          return {onConflictDoNothing: async () => undefined};
        },
      };
    },
  };
  return {tx, updates, inserts};
}

function grant(overrides: Partial<Record<'reserved' | 'consumed' | 'available' | 'voided', bigint>> = {}) {
  return {
    id: input.grantId,
    reserved: 0n,
    consumed: 0n,
    available: 25n,
    voided: 0n,
    ...overrides,
  };
}

test('credit reversal fails closed when the grant is missing', async () => {
  const {tx} = transaction([]);
  await assert.rejects(
    voidUnusedGrantInTransaction(tx as never, input),
    (error: unknown) => error instanceof DomainError && error.code === 'NOT_FOUND',
  );
});

test('credit reversal is replay-safe for unavailable or already-voided grants', async () => {
  for (const row of [grant({reserved: 1n}), grant({consumed: 1n}), grant({available: 0n})]) {
    const {tx, updates, inserts} = transaction([row]);
    assert.deepEqual(await voidUnusedGrantInTransaction(tx as never, input), {grantId: input.grantId, voided: 0n, replayed: true});
    assert.equal(updates.length, 0);
    assert.equal(inserts.length, 0);
  }
});

test('credit reversal treats an existing ledger business key as a replay', async () => {
  const {tx, updates, inserts} = transaction([grant()], [{id: 'ledger-1'}]);
  assert.deepEqual(await voidUnusedGrantInTransaction(tx as never, input), {grantId: input.grantId, voided: 0n, replayed: true});
  assert.equal(updates.length, 0);
  assert.equal(inserts.length, 0);
});

test('credit reversal atomically voids available credits and emits audit/outbox evidence', async () => {
  const {tx, updates, inserts} = transaction([grant()]);
  assert.deepEqual(await voidUnusedGrantInTransaction(tx as never, input), {grantId: input.grantId, voided: 25n, replayed: false});
  assert.deepEqual(updates, [{available: 0n, voided: 25n}]);
  assert.equal(inserts.length, 3);
  assert.deepEqual(inserts.map((row) => 'entryType' in row ? row.entryType : 'eventType' in row ? row.eventType : 'commandName' in row ? row.commandName : null), ['void', 'billing.refund-void', 'credit.grant_voided']);
});
