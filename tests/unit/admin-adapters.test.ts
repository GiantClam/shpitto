import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';

import {adminDataProvider} from '../../src/admin/data-provider.ts';
import {adminAuthProvider} from '../../src/admin/auth-provider.ts';
import {executeAdminCommand} from '../../src/admin/commands.ts';
import {executeAffiliateAdminCommand} from '../../src/admin/affiliate-commands.ts';
import {affiliatePageInput, affiliateUuid} from '../../src/app/api/admin/affiliates/_shared.ts';
import {getAdminCapabilities} from '../../src/admin/capabilities.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('admin lists forward allowlisted filters and use truthful partial pagination', async () => {
  let requested = '';
  globalThis.fetch = async (input) => {
    requested = String(input);
    return Response.json({items: [{id: 'user-1'}], page: 2, pageSize: 25, hasMore: true});
  };
  const result = await adminDataProvider.getList('users', {pagination: {page: 2, perPage: 25}, sort: {field: 'email', order: 'ASC'}, filter: {q: 'demo', status: 'active'}});
  const url = new URL(requested, 'http://localhost');
  assert.equal(url.searchParams.get('filter'), 'demo');
  assert.equal(url.searchParams.get('status'), 'active');
  assert.equal(url.searchParams.get('sort'), 'email');
  assert.equal(url.searchParams.get('direction'), 'asc');
  assert.equal(result.total, undefined);
  assert.deepEqual(result.pageInfo, {hasNextPage: true, hasPreviousPage: true});
});

test('workspace detail sends the encoded target and recorded access purpose', async () => {
  let requested = '';
  globalThis.fetch = async (input) => { requested = String(input); return Response.json({id: 'workspace/1', version: 2}); };
  const result = await adminDataProvider.getOne('workspaces', {id: 'workspace/1', meta: {purpose: 'Investigate task delivery'}});
  const url = new URL(requested, 'http://localhost');
  assert.equal(url.pathname, '/api/admin/workspaces/workspace%2F1');
  assert.equal(url.searchParams.get('purpose'), 'Investigate task delivery');
  assert.equal(result.data.id, 'workspace/1');
});

test('the terminal list page reports its known exact total for the paginator', async () => {
  globalThis.fetch = async () => Response.json({items: [{id: 'workspace-1'}], page: 1, pageSize: 25, hasMore: false});
  const result = await adminDataProvider.getList('workspaces', {pagination: {page: 1, perPage: 25}, sort: {field: 'createdAt', order: 'DESC'}, filter: {}});
  assert.equal(result.total, 1);
  assert.deepEqual(result.pageInfo, {hasNextPage: false, hasPreviousPage: false});
});

test('admin failures preserve status so revoked authority invalidates the session', async () => {
  globalThis.fetch = async () => Response.json({error: {message: 'Operator access is unavailable.'}}, {status: 403});
  await assert.rejects(adminDataProvider.getList('audit', {pagination: {page: 1, perPage: 25}, sort: {field: 'createdAt', order: 'DESC'}, filter: {}}), {status: 403, message: 'Operator access is unavailable.'});
  await assert.rejects(adminAuthProvider.checkAuth({}));
});

test('unsupported detail, query fields and generic mutations fail without network access', async () => {
  globalThis.fetch = async () => { throw new Error('Network must not be called.'); };
  await assert.rejects(adminDataProvider.getOne('users', {id: 'user-1'}), /not supported/);
  await assert.rejects(adminDataProvider.getOne('workspaces', {id: 'workspace-1'}), /purpose/i);
  await assert.rejects(adminDataProvider.getList('users', {pagination: {page: 1, perPage: 25}, sort: {field: 'createdAt', order: 'DESC'}, filter: {password: 'hidden'}}), /filter/i);
  await assert.rejects(adminDataProvider.update('workspaces', {id: 'workspace-1', data: {status: 'suspended'}, previousData: {id: 'workspace-1'}}), /named admin command/);
});

test('named commands retain expected version and the same key across exact retries', async () => {
  const requests: Array<{url: string; body: string; key: string | null}> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({url: String(input), body: String(init?.body), key: new Headers(init?.headers).get('Idempotency-Key')});
    return Response.json({changed: true, version: 3});
  };
  const command = {command: 'workspace-status', workspaceId: 'workspace-1', status: 'suspended', expectedVersion: 2, reason: 'Review reported abuse', idempotencyKey: 'command-123'} as const;
  await executeAdminCommand(command);
  await executeAdminCommand(command);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].url, '/api/admin/commands/workspace-status');
  assert.equal(requests[0].key, 'command-123');
  assert.equal(JSON.parse(requests[0].body).expectedVersion, 2);
});

test('incomplete privileged envelope has no transport effect', async () => {
  globalThis.fetch = async () => { throw new Error('Network must not be called.'); };
  await assert.rejects(executeAdminCommand({command: 'disable-user', targetUserId: 'user-1', expectedVersion: -1, reason: 'Review abuse', idempotencyKey: 'key-1'}), /expected version/);
});

test('the first credit adjustment can use the persisted zero account version', async () => {
  let version: unknown;
  globalThis.fetch = async (_input, init) => {version = JSON.parse(String(init?.body)).expectedVersion; return Response.json({changed: true, version: 1});};
  await executeAdminCommand({command: 'credit-adjust', workspaceId: 'workspace-1', amount: '10', expectedVersion: 0, reason: 'Issue local test grant', idempotencyKey: 'credit-key'});
  assert.equal(version, 0);
});

test('recovery sweep uses the versioned tenant route and stable command key', async () => {
  let requested = '';
  let options: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {requested = String(input); options = init; return Response.json({scanned: 1, failed: 1, version: 2, replayed: false});};
  await executeAdminCommand({command: 'recovery-sweep', workspaceId: 'workspace-1', expectedVersion: 1, idempotencyKey: 'recovery-key', reason: 'Review expired tasks'});
  assert.equal(requested, '/api/admin/recovery/workspace-1/sweep');
  assert.equal(new Headers(options?.headers).get('Idempotency-Key'), 'recovery-key');
  assert.deepEqual(JSON.parse(String(options?.body)), {purpose: 'Review expired tasks', expectedVersion: 1});
});

test('stored-webhook recovery sends only original inbox identity and a stable reviewed envelope', async () => {
  const requests: Array<{url: string; body: unknown; key: string | null}> = [];
  globalThis.fetch = async (input, init) => {requests.push({url: String(input), body: JSON.parse(String(init?.body)), key: new Headers(init?.headers).get('Idempotency-Key')}); return Response.json({status: 'processed'});};
  const input = {command: 'webhook-replay', workspaceId: 'workspace-1', inboxId: 'inbox-1', expectedVersion: 3, reason: 'Recover verified delivery', idempotencyKey: 'original-recovery-key'} as const;
  await executeAdminCommand(input);
  await executeAdminCommand(input);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].url, '/api/admin/recovery/workspace-1/webhook-replay');
  assert.equal(requests[0].key, input.idempotencyKey);
  assert.deepEqual(requests[0].body, {purpose: input.reason, expectedVersion: 3, inboxId: 'inbox-1'});
});

test('affiliate actions use named versioned requests and stable retries', async () => {
  const requests: Array<{url: string; body: unknown; key: string | null}> = [];
  globalThis.fetch = async (input, init) => {requests.push({url: String(input), body: JSON.parse(String(init?.body)), key: new Headers(init?.headers).get('Idempotency-Key')}); return Response.json({status: 'deny_pending'});};
  const input = {command: 'deny', workspaceId: 'workspace-1', reviewId: 'review-1', reason: 'Later payment under first-payment policy', expectedVersion: 3, idempotencyKey: 'affiliate-review-key'} as const;
  await executeAffiliateAdminCommand(input);
  await executeAffiliateAdminCommand(input);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0].url, '/api/admin/affiliates/commands/deny');
  assert.deepEqual(requests[0].body, {workspaceId: 'workspace-1', reviewId: 'review-1', reason: input.reason, expectedVersion: 3});
  assert.equal(requests[0].key, input.idempotencyKey);
});

test('affiliate views use bounded redacted lists and reject generic writes', async () => {
  let requested = '';
  globalThis.fetch = async (input) => {requested = String(input); return Response.json({items: [], page: 1, pageSize: 25, hasMore: false});};
  const result = await adminDataProvider.getList('affiliate-reviews', {pagination: {page: 1, perPage: 25}, sort: {field: 'updatedAt', order: 'DESC'}, filter: {status: 'held'}});
  assert.match(requested, /^\/api\/admin\/affiliates\/reviews\?/);
  assert.equal(new URL(requested, 'http://localhost').searchParams.get('status'), 'held');
  assert.equal(result.total, 0);
  await assert.rejects(adminDataProvider.update('affiliate-reviews', {id: 'review-1', data: {status: 'approved'}, previousData: {id: 'review-1'}}), /named admin command/);
});

test('affiliate route queries reject unsupported fields, unbounded pages and invalid target IDs', () => {
  assert.deepEqual(affiliatePageInput(new Request('http://localhost/api/admin/affiliates/reviews?page=2&pageSize=10&status=held')), {page: 2, pageSize: 10, status: 'held'});
  assert.throws(() => affiliatePageInput(new Request('http://localhost/api/admin/affiliates/reviews?sort=password')), /Unsupported affiliate query/);
  assert.throws(() => affiliatePageInput(new Request('http://localhost/api/admin/affiliates/reviews?pageSize=1000')), /1–100/);
  assert.throws(() => affiliatePageInput(new Request('http://localhost/api/admin/affiliates/reviews?page=10001')), /1–10000/);
  assert.throws(() => affiliateUuid('../another-tenant', 'workspaceId'), /must be a UUID/);
});

test('template capability fixtures keep common resources and omit unsupported media controls', () => {
  const video = getAdminCapabilities('video');
  const image = getAdminCapabilities('image');
  assert.deepEqual(video.resources, image.resources);
  assert.ok(video.capabilities.mediaPreview.runtimeSupported);
  assert.deepEqual(image.capabilities.mediaPreview.fields, []);
  assert.deepEqual(image.capabilities.modelControls.actions, []);
  assert.match(image.capabilities.recoveryEvidence.note ?? '', /not exposed/i);
});
