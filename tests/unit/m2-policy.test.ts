import assert from 'node:assert/strict';
import {test} from 'node:test';

import {LocalMailAdapter, toInvitationMailMessage} from '../../src/adapters/mail/index.ts';
import {DomainError} from '../../src/db/contracts.ts';
import {assertBillingOperationAllowed} from '../../src/modules/billing/hold-policy.ts';
import {evaluateAccess, type AccessOperation} from '../../src/modules/workspaces/access-state.ts';

test('access decisions preserve the complete E02 principal and hold matrix', () => {
  const operations: AccessOperation[] = ['login', 'session', 'history', 'download', 'invitation', 'transfer', 'generation', 'checkout', 'portal', 'support', 'operator-read', 'worker-delivery', 'worker-settlement'];
  for (const userDisabled of [true, false]) {
    for (const workspaceStatus of ['active', 'suspended'] as const) {
      for (const billingStatus of ['active', 'hold'] as const) {
        const state = {userDisabled, workspaceStatus, billingStatus};
        for (const operation of operations) {
          const worker = evaluateAccess(state, {kind: 'worker', workerId: 'worker'}, operation);
          assert.equal(worker.allowed, operation === 'worker-delivery' || operation === 'worker-settlement');
          for (const audited of [true, false]) {
            const operator = evaluateAccess(state, {kind: 'operator', userId: 'operator', audited}, operation);
            assert.equal(operator.allowed, !userDisabled && audited && operation === 'operator-read');
          }
          const privileged = ['operator-read', 'worker-delivery', 'worker-settlement'].includes(operation);
          const suspended = workspaceStatus === 'suspended' && !['login', 'session'].includes(operation);
          const held = billingStatus === 'hold' && ['generation', 'checkout'].includes(operation);
          assert.equal(evaluateAccess(state, {kind: 'member', userId: 'member'}, operation).allowed, !privileged && !userDisabled && !suspended && !held, `${JSON.stringify(state)} ${operation}`);
        }
      }
    }
  }
});

test('billing hold rejects only new financial work and preserves permitted actions', () => {
  for (const status of ['active', 'hold'] as const) {
    for (const operation of ['generation', 'checkout', 'history', 'download', 'invitation', 'portal', 'support'] as const) {
      if (status === 'hold' && ['generation', 'checkout'].includes(operation)) {
        assert.throws(() => assertBillingOperationAllowed(operation, status), (error: unknown) => error instanceof DomainError && error.code === 'FORBIDDEN');
      } else assert.doesNotThrow(() => assertBillingOperationAllowed(operation, status));
    }
  }
});

test('invitation mail preserves a URL-encoded token, recipient and expiry', async () => {
  const expiresAt = new Date('2026-10-06T00:00:00.000Z');
  const message = toInvitationMailMessage({invitationId: 'invite', workspaceId: 'workspace', recipientEmail: 'invited@example.test', token: 'token+with/special?', expiresAt}, 'https://app.example.test/nested');
  assert.equal(message.to, 'invited@example.test');
  const link = new URL(message.body.match(/https:\/\/\S+/)![0]);
  assert.equal(link.pathname, '/invitations/accept');
  assert.equal(link.searchParams.get('token'), 'token+with/special?');
  assert(message.body.includes(expiresAt.toISOString()));
  const adapter = new LocalMailAdapter();
  assert.deepEqual(await adapter.send(message), {ok: true, value: undefined});
  assert.deepEqual(adapter.messages, [message]);
});
