import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';

import {getServerEnv} from '../src/config/env.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {createDatabase} from '../src/db/client.ts';
import {deletePrivateObject} from '../src/adapters/storage/local.ts';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

type ProbeUser = Readonly<{id: string; token: string; sessionId: string}>;
type RouteCase = Readonly<{name: string; method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: Readonly<Record<string, unknown>>; rawBody?: string}>;

async function readJson<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  try { return JSON.parse(text) as T; }
  catch { throw new Error(`${label} returned HTTP ${response.status} with a non-JSON body (${text.length} characters).`); }
}

const runId = randomUUID();
const workspaceIds = [randomUUID(), randomUUID()];
const inputAssets = ['ready', 'foreign', 'deleted', 'quarantined'].map((state) => ({id: randomUUID(), state}));
const users: ReadonlyArray<ProbeUser> = ['owner-w1', 'owner-w2', 'member-w2', 'member-w1', 'removed-w2'].map((name) => ({
  id: `probe-api-${runId}-${name}`, token: randomUUID().replaceAll('-', ''), sessionId: randomUUID(),
}));
const staleSession = {id: randomUUID(), token: randomUUID().replaceAll('-', '')};

function routes(workspaceId: string): ReadonlyArray<RouteCase> {
  const prefix = `/api/workspaces/${workspaceId}`;
  return [
    {name: 'transfer', method: 'POST', path: `${prefix}/transfer`, body: {targetUserId: users[2].id}},
    {name: 'leave-post', method: 'POST', path: `${prefix}/leave`},
    {name: 'leave-delete', method: 'DELETE', path: `${prefix}/leave`},
    {name: 'demote-post', method: 'POST', path: `${prefix}/members/${users[1].id}/demote`},
    {name: 'demote-patch', method: 'PATCH', path: `${prefix}/members/${users[1].id}/demote`},
    {name: 'remove-post', method: 'POST', path: `${prefix}/members/${users[2].id}/remove`},
    {name: 'remove-delete', method: 'DELETE', path: `${prefix}/members/${users[2].id}/remove`},
    {name: 'invite', method: 'POST', path: `${prefix}/invitations`, body: {email: `invite-${runId}@example.test`}},
  ];
}

async function seed(pool: Pool): Promise<void> {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 60_000);
  const expiresAt = new Date(now.getTime() + 86_400_000);
  for (const user of users) {
    await pool.query(
      `insert into "user" (id, name, email, email_verified, created_at, updated_at)
       values ($1, 'HTTP Isolation Probe', $2, true, $3, $3)`,
      [user.id, `${user.id}@example.test`, createdAt],
    );
    await pool.query(
      `insert into "session" (id, token, user_id, created_at, updated_at, expires_at)
       values ($1, $2, $3, $4, $4, $5)`,
      [user.sessionId, user.token, user.id, createdAt, expiresAt],
    );
  }
  await pool.query(
    `insert into "session" (id, token, user_id, created_at, updated_at, expires_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [staleSession.id, staleSession.token, users[0].id, new Date(now.getTime() - 3_600_000), now, expiresAt],
  );
  await pool.query(
    `insert into app.workspaces (id, kind, name, created_by, created_at, updated_at)
     values ($1::uuid, 'team', 'HTTP Probe W1', $3, $5, $5),
            ($2::uuid, 'team', 'HTTP Probe W2', $4, $5, $5)`,
    [workspaceIds[0], workspaceIds[1], users[0].id, users[1].id, now],
  );
  await pool.query(
    `insert into app.workspace_members (workspace_id, user_id, role, created_at)
     values ($1::uuid, $3, 'owner', $8), ($2::uuid, $4, 'owner', $8),
            ($2::uuid, $5, 'member', $8), ($1::uuid, $6, 'member', $8), ($2::uuid, $7, 'member', $8)`,
    [workspaceIds[0], workspaceIds[1], ...users.map((user) => user.id), now],
  );
  for (const workspaceId of workspaceIds) {
    await pool.query(`insert into app.billing_accounts (workspace_id, status, version, created_at, updated_at) values ($1::uuid, 'active', 1, $2, $2)`, [workspaceId, now]);
    await pool.query(`insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1::uuid, 0, $2, $2)`, [workspaceId, now]);
  }
  const grantId = randomUUID();
  await pool.query(`insert into app.credit_grants (id, workspace_id, source, issued, available, reserved, consumed, expired, voided, business_key, created_at)
    values ($1::uuid, $2::uuid, 'manual', 100, 100, 0, 0, 0, 0, $3, $4)`, [grantId, workspaceIds[0], `api-input-grant-${runId}`, now]);
  await pool.query(`insert into app.credit_ledger_entries (id, workspace_id, grant_id, entry_type, available_delta, reserved_delta, consumed_delta, expired_delta, voided_delta, business_key, created_at)
    values ($1::uuid, $2::uuid, $3::uuid, 'grant_issued', 100, 0, 0, 0, 0, $4, $5)`, [randomUUID(), workspaceIds[0], grantId, `api-input-ledger-${runId}`, now]);
  for (const asset of inputAssets) {
    const foreign = asset.state === 'foreign';
    const workspaceId = workspaceIds[foreign ? 1 : 0];
    await pool.query(`insert into app.assets (id, workspace_id, purpose, state, object_key, created_by, mime, bytes, sha256, created_at, updated_at)
      values ($1::uuid, $2::uuid, 'input', $3, $4, $5, 'image/png', 68, 'http-probe-metadata', $6, $6)`,
    [asset.id, workspaceId, foreign ? 'ready' : asset.state, `http-probe/${runId}/${asset.id}.png`, users[foreign ? 1 : 0].id, now]);
  }
}

async function snapshot(pool: Pool): Promise<string> {
  const result = await pool.query<{snapshot: unknown}>(
    `with owned as (select id from app.workspaces where id = any($1::uuid[]) or created_by = any($2::text[]))
     select json_build_object(
       'workspaces', (select json_agg(row_to_json(t)) from (select * from app.workspaces where id in (select id from owned) order by id) t),
       'members', (select json_agg(row_to_json(t)) from (select * from app.workspace_members where workspace_id in (select id from owned) order by workspace_id, user_id) t),
       'invitations', (select json_agg(row_to_json(t)) from (select * from app.workspace_invitations where workspace_id in (select id from owned) order by id) t),
       'mail', (select json_agg(row_to_json(t)) from (select mail.* from app.mail_outbox mail join app.workspace_invitations invitation on invitation.id = mail.invitation_id where invitation.workspace_id in (select id from owned) order by mail.id) t),
       'commands', (select json_agg(row_to_json(t)) from (select * from app.command_results where workspace_id in (select id from owned) or actor_user_id = any($2::text[]) order by id) t),
       'audit', (select json_agg(row_to_json(t)) from (select * from app.audit_events where workspace_id in (select id from owned) order by id) t),
       'outbox', (select json_agg(row_to_json(t)) from (select * from app.outbox_events where workspace_id in (select id from owned) order by id) t),
       'onboarding', (select json_agg(row_to_json(t)) from (select * from app.workspace_setups where user_id = any($2::text[]) order by id) t),
       'creditAccounts', (select json_agg(row_to_json(t)) from (select * from app.credit_accounts where workspace_id in (select id from owned) order by workspace_id) t),
       'creditGrants', (select json_agg(row_to_json(t)) from (select * from app.credit_grants where workspace_id in (select id from owned) order by id) t),
       'creditLedger', (select json_agg(row_to_json(t)) from (select * from app.credit_ledger_entries where workspace_id in (select id from owned) order by id) t),
       'reservations', (select json_agg(row_to_json(t)) from (select * from app.credit_reservations where workspace_id in (select id from owned) order by id) t),
       'allocations', (select json_agg(row_to_json(t)) from (select * from app.credit_allocations where workspace_id in (select id from owned) order by id) t),
       'tasks', (select json_agg(row_to_json(t)) from (select * from app.generation_tasks where workspace_id in (select id from owned) order by id) t),
       'assets', (select json_agg(row_to_json(t)) from (select * from app.assets where workspace_id in (select id from owned) order by id) t),
       'billing', (select json_agg(row_to_json(t)) from (select * from app.billing_accounts where workspace_id in (select id from owned) order by workspace_id) t)
     ) as snapshot`,
    [workspaceIds, users.map((user) => user.id)],
  );
  return JSON.stringify(result.rows[0]?.snapshot);
}

async function cleanup(pool: Pool): Promise<void> {
  const userIds = users.map((user) => user.id);
  const ownedWorkspaces = await pool.query<{id: string}>('select id from app.workspaces where created_by = any($1::text[])', [userIds]);
  const ownedIds = ownedWorkspaces.rows.map((row) => row.id);
  await pool.query('delete from app.command_results where workspace_id = any($1::uuid[]) or actor_user_id = any($2::text[])', [ownedIds, userIds]);
  await pool.query('delete from app.outbox_events where workspace_id = any($1::uuid[])', [ownedIds]);
  await pool.query('delete from app.audit_events where workspace_id = any($1::uuid[])', [ownedIds]);
  await pool.query('delete from app.workspace_invitations where workspace_id = any($1::uuid[])', [ownedIds]);
  await pool.query('update app.credit_grants set origin_allocation_id = null where workspace_id = any($1::uuid[])', [ownedIds]);
  const assetObjects = await pool.query<{object_key: string}>('select object_key from app.assets where workspace_id = any($1::uuid[])', [ownedIds]);
  for (const asset of assetObjects.rows) await deletePrivateObject(getServerEnv().assetRoot, asset.object_key);
  for (const table of ['assets', 'submission_attempts', 'generation_quarantine', 'credit_ledger_entries', 'credit_allocations']) {
    await pool.query(`delete from app.${table} where workspace_id = any($1::uuid[])`, [ownedIds]);
  }
  await pool.query('update app.credit_reservations set task_id = null where workspace_id = any($1::uuid[])', [ownedIds]);
  for (const table of ['generation_tasks', 'credit_reservations', 'credit_grants', 'credit_accounts', 'billing_accounts', 'workspace_members']) {
    await pool.query(`delete from app.${table} where workspace_id = any($1::uuid[])`, [ownedIds]);
  }
  await pool.query('delete from app.workspace_setups where user_id = any($1::text[])', [userIds]);
  await pool.query('delete from app.workspaces where id = any($1::uuid[])', [ownedIds]);
  await pool.query('delete from "user" where id = any($1::text[])', [userIds]);
}

async function run(): Promise<void> {
  const env = getServerEnv();
  const base = new URL(env.appUrl);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'HTTP isolation probe requires a local APP_URL.');
  const database = createDatabase();
  let deniedRequests = 0;
  async function call(route: RouteCase, token?: string, origin = base.origin, key = randomUUID()): Promise<Response> {
    return fetch(new URL(route.path, base), {
      method: route.method,
      headers: {'content-type': 'application/json', origin, 'idempotency-key': key, ...(token ? {authorization: `Bearer ${token}`} : {})},
      body: route.rawBody ?? JSON.stringify(route.body ?? {}),
      signal: AbortSignal.timeout(30_000),
      redirect: 'manual',
    });
  }
  async function assertLiveSession(user: ProbeUser): Promise<void> {
    const response = await fetch(new URL('/api/auth/get-session', base), {headers: {authorization: `Bearer ${user.token}`}, signal: AbortSignal.timeout(30_000)});
    const session = await readJson<{user?: {id?: string}; session?: {id?: string}}>(response, 'GET /api/auth/get-session');
    assert(response.status === 200 && session.user?.id === user.id && session.session?.id === user.sessionId, 'Seeded bearer token does not resolve to the expected live HTTP session.');
  }
  async function denied(route: RouteCase, label: string, expectedStatus: number, token?: string, origin = base.origin): Promise<void> {
    const before = await snapshot(database.pool);
    const response = await call(route, token, origin);
    const body = await readJson<{error?: {code?: string} | string}>(response, `${label}/${route.name}`);
    assert(response.status === expectedStatus, `${label}/${route.name} returned ${response.status}; expected ${expectedStatus}.`);
    if (expectedStatus === 403) assert(typeof body.error === 'object' && body.error.code === 'FORBIDDEN', `${label}/${route.name} did not return FORBIDDEN.`);
    assert(await snapshot(database.pool) === before, `${label}/${route.name} changed business state despite rejection.`);
    deniedRequests += 1;
  }
  try {
    await seed(database.pool);
    await assertLiveSession(users[0]);
    await assertLiveSession(users[1]);
    const assetPath = `/api/workspaces/${workspaceIds[0]}/assets`;
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9ioAAAAASUVORK5CYII=';
    const uploadRoute: RouteCase = {name: 'asset-upload', method: 'POST', path: assetPath, body: {mime: 'image/png', contentBase64: png}};
    await denied(uploadRoute, 'Unauthenticated asset upload', 401);
    await denied(uploadRoute, 'Forged-origin asset upload', 403, users[0].token, 'https://forged-origin.example.test');
    const oversizedEncoded = 'A'.repeat(4 * Math.ceil(20 * 1024 * 1024 / 3) + 4);
    await denied({...uploadRoute, name: 'asset-upload-encoded-limit', body: {mime: 'image/png', contentBase64: oversizedEncoded}}, 'Oversized encoded asset', 413, users[0].token);
    const beforeChunkedUpload = await snapshot(database.pool);
    let remainingBodyBytes = 4 * Math.ceil(20 * 1024 * 1024 / 3) + 1025;
    const uploadChunk = new Uint8Array(64 * 1024).fill(0x41);
    const chunkedBody = new ReadableStream<Uint8Array>({pull(controller) {
      if (remainingBodyBytes === 0) { controller.close(); return; }
      const count = Math.min(uploadChunk.byteLength, remainingBodyBytes);
      controller.enqueue(uploadChunk.subarray(0, count));
      remainingBodyBytes -= count;
    }});
    const chunkedUpload = await fetch(new URL(assetPath, base), {method: 'POST', headers: {origin: base.origin, authorization: `Bearer ${users[0].token}`, 'content-type': 'application/json'}, body: chunkedBody, duplex: 'half', signal: AbortSignal.timeout(30_000)} as RequestInit & {duplex: 'half'});
    await readJson(chunkedUpload, 'Chunked upload body limit');
    assert(chunkedUpload.status === 413 && await snapshot(database.pool) === beforeChunkedUpload, 'A streamed oversized body without Content-Length must reject without business changes.');
    deniedRequests += 1;
    const upload = await call(uploadRoute, users[0].token);
    const uploaded = await readJson<{data?: {assetId?: string}}>(upload, 'Small valid PNG upload');
    assert(upload.status === 201 && typeof uploaded.data?.assetId === 'string', 'A small valid PNG must still upload through HTTP.');
    await denied({name: 'onboarding-malformed-json', method: 'POST', path: '/api/onboarding', rawBody: '{invalid-json'}, 'Malformed authenticated onboarding', 400, users[0].token);
    for (const route of routes(workspaceIds[1])) {
      await denied(route, 'W1 actor / W2 identifier', 403, users[0].token);
      await denied(route, 'Unauthenticated', 401);
      await denied(route, 'Forged origin', 403, users[1].token, 'https://forged-origin.example.test');
    }
    await assertLiveSession(users[4]);
    const remove = await call({name: 'remove-live-member', method: 'DELETE', path: `/api/workspaces/${workspaceIds[1]}/members/${users[4].id}/remove`}, users[1].token);
    assert(remove.status === 200, 'Owner could not remove the fixture member through HTTP.');
    await remove.arrayBuffer();
    await assertLiveSession(users[4]);
    for (const route of routes(workspaceIds[1])) await denied(route, 'Removed member / retained session', 403, users[4].token);
    const beforeAdmin = await snapshot(database.pool);
    const admin = await fetch(new URL('/api/admin/me', base), {headers: {authorization: `Bearer ${users[0].token}`}, signal: AbortSignal.timeout(30_000)});
    assert(admin.status === 403, 'Workspace ownership incorrectly grants platform operator access.');
    const adminBody = await readJson<{error?: {code?: string}}>(admin, 'GET /api/admin/me');
    assert(adminBody.error?.code === 'FORBIDDEN' && await snapshot(database.pool) === beforeAdmin, 'Operator denial must preserve business state and use FORBIDDEN.');
    deniedRequests += 1;
    const transfer: RouteCase = {name: 'transfer-recent-auth', method: 'POST', path: `/api/workspaces/${workspaceIds[0]}/transfer`, body: {targetUserId: users[3].id, recentAuthenticationAt: new Date().toISOString()}};
    await denied(transfer, 'Stale createdAt / fresh updatedAt / forged body freshness', 403, staleSession.token);
    const freshTransfer = await call(transfer, users[0].token);
    assert(freshTransfer.status === 200, 'A genuinely recent owner session cannot transfer the same workspace.');
    await freshTransfer.arrayBuffer();
    const roles = await database.pool.query<{user_id: string; role: string}>('select user_id, role from app.workspace_members where workspace_id = $1::uuid', [workspaceIds[0]]);
    assert(roles.rows.find((row) => row.user_id === users[0].id)?.role === 'member' && roles.rows.find((row) => row.user_id === users[3].id)?.role === 'owner', 'Successful HTTP transfer did not persist both ownership roles.');
    const quote = createServerQuote(DEFAULT_MODEL_ID, '1');
    const generationRoute = (assetId: string): RouteCase => ({name: 'generation-input', method: 'POST', path: `/api/workspaces/${workspaceIds[0]}/generations`, body: {quote, input: {assetId, assetWorkspaceId: workspaceIds[0], assetState: 'ready'}}});
    for (const asset of inputAssets.slice(1)) await denied(generationRoute(asset.id), `${asset.state} input`, 403, users[0].token);
    const key = randomUUID();
    const owned = await call(generationRoute(uploaded.data.assetId), users[0].token, base.origin, key);
    const created = await readJson<{data?: {value?: {taskId?: string}; replayed?: boolean}; error?: unknown}>(owned, 'Owned ready generation input');
    assert(owned.status === 201 && typeof created.data?.value?.taskId === 'string' && created.data.replayed === false, `Owned ready generation input returned ${owned.status}; expected 201.`);
    const replay = await call(generationRoute(uploaded.data.assetId), users[0].token, base.origin, key);
    const replayed = await readJson<{data?: {value?: {taskId?: string}; replayed?: boolean}}>(replay, 'Owned ready generation input replay');
    assert(replay.status === 200 && replayed.data?.replayed === true && replayed.data.value?.taskId === created.data.value.taskId, 'Owned ready input must replay the same task with HTTP 200.');
    const taskCount = await database.pool.query<{count: number}>('select count(*)::int as count from app.generation_tasks where workspace_id = $1::uuid', [workspaceIds[0]]);
    const reservationCount = await database.pool.query<{count: number}>('select count(*)::int as count from app.credit_reservations where workspace_id = $1::uuid', [workspaceIds[0]]);
    assert(taskCount.rows[0]?.count === 1 && reservationCount.rows[0]?.count === 1, 'Successful input and replay must create exactly one task and reservation.');
  } finally {
    try { await cleanup(database.pool); }
    finally { await database.pool.end(); }
  }
  console.log(JSON.stringify({status: 'PASS', workspaceRoutes: 5, methodVariants: 8, deniedRequests, crossTenant: true, unauthenticated: true, forgedOrigin: true, removedMemberLiveSession: true, workspaceOwnerNotOperator: true, staleSessionRefreshNotRecentAuthentication: true, recentSessionTransfer: true, oversizedEncodedUpload413: true, chunkedUploadBodyLimit413: true, validPngUpload201: true, assetUploadAuthOriginGuards: true, generationInputMetadataFixtures: true, ownedReadyInput201: true, ownedInputReplay200: true, foreignDeletedQuarantinedInputDenied: true, generationSingleTaskReservation: true, rejectedRequestsPreserveBusinessState: true, fixturesRemoved: true}));
}

run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
