import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import {eq} from 'drizzle-orm';

import {getServerEnv} from '../src/config/env.ts';
import {createDatabase} from '../src/db/client.ts';
import {mailOutbox, workspaceInvitations} from '../src/db/schema/invitations.ts';
import {createServerQuote, DEFAULT_MODEL_ID} from '../src/config/models.ts';
import {issueGrant} from '../src/modules/credits/ledger.ts';
import {createGenerationTask} from '../src/modules/generation/create.ts';
import {cancelGenerationTask} from '../src/modules/generation/lifecycle.ts';

const env = getServerEnv();
const base = new URL(env.appUrl);
const suffix = randomUUID();
const ownerEmail = `team-http-owner-${suffix}@example.test`;
const memberEmail = `team-http-member-${suffix}@example.test`;
const ownerPassword = `Owner-${suffix}`;
const memberPassword = `Member-${suffix}`;
const database = createDatabase({max: 4});
const secrets = new Set([env.databaseUrl, env.betterAuthSecret, ownerPassword, memberPassword]);

type Json = Record<string, unknown>;

async function request(path: string, body?: unknown, token?: string, cookie?: string, idempotencyKey?: string): Promise<Response> {
  return fetch(new URL(path, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin: base.origin,
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
      ...(token ? {authorization: `Bearer ${token}`} : {}),
      ...(cookie ? {cookie} : {}),
      ...(body === undefined ? {} : {'idempotency-key': idempotencyKey ?? `team-http-${randomUUID()}`}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
}

async function json(response: Response): Promise<Json> {
  const text = await response.text();
  try { return JSON.parse(text) as Json; }
  catch { throw new Error(`HTTP ${response.status} returned non-JSON: ${text.slice(0, 240)}`); }
}

async function capturedLink(email: string, subject: string): Promise<URL> {
  const search = new URL('/api/v1/search', env.mailHttpUrl);
  search.searchParams.set('query', `to:${email}`);
  const response = await fetch(search);
  assert.equal(response.status, 200);
  const messages = (await response.json() as {messages: Array<{ID: string; Subject: string}>}).messages;
  const message = messages.find((entry) => entry.Subject === subject);
  assert(message, `Missing ${subject} message.`);
  const detail = await fetch(new URL(`/api/v1/message/${message.ID}`, env.mailHttpUrl));
  const body = await detail.json() as {Text: string};
  const match = body.Text.match(/https?:\/\/\S+/);
  assert(match, 'Email did not contain a link.');
  return new URL(match[0]);
}

async function signupAndLogin(email: string, password: string): Promise<{userId: string; token: string; cookie: string}> {
  const signup = await request('/api/auth/sign-up/email', {name: email.split('@')[0], email, password, callbackURL: '/login'});
  assert.equal(signup.status, 200);
  const verificationLink = await capturedLink(email, 'Verify your Shpitto email');
  const verification = await request(verificationLink.pathname + verificationLink.search);
  assert.equal(verification.status, 302);
  const login = await request('/api/auth/sign-in/email', {email, password, callbackURL: '/dashboard'});
  assert.equal(login.status, 200);
  const payload = await json(login) as Json & {token?: unknown; user?: {id?: unknown}};
  assert.equal(typeof payload.token, 'string');
  assert.equal(typeof payload.user?.id, 'string');
  secrets.add(String(payload.token));
  return {userId: String(payload.user!.id), token: String(payload.token), cookie: login.headers.get('set-cookie') ?? ''};
}

async function cleanupUsers(userIds: ReadonlyArray<string>): Promise<void> {
  const query = database.pool.query.bind(database.pool);
  const owned = await query<{id: string}>('select id from app.workspaces where created_by = any($1::text[])', [userIds]);
  const workspaceIds = owned.rows.map((row: {id: string}) => row.id);
  await query('delete from app.mail_outbox where invitation_id in (select id from app.workspace_invitations where workspace_id = any($1::uuid[]))', [workspaceIds]);
  await query('delete from app.workspace_invitations where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.assets where workspace_id = any($1::uuid[]) or created_by = any($2::text[])', [workspaceIds, userIds]);
  await query('delete from app.submission_attempts where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.generation_quarantine where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.outbox_events where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.audit_events where workspace_id = any($1::uuid[]) or actor_user_id = any($2::text[])', [workspaceIds, userIds]);
  await query('delete from app.command_results where workspace_id = any($1::uuid[]) or actor_user_id = any($2::text[])', [workspaceIds, userIds]);
  await query('delete from app.credit_ledger_entries where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.credit_allocations where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('update app.credit_reservations set task_id = null where workspace_id = any($1::uuid[]) or actor_user_id = any($2::text[])', [workspaceIds, userIds]);
  await query('delete from app.generation_tasks where workspace_id = any($1::uuid[]) or requested_by = any($2::text[])', [workspaceIds, userIds]);
  await query('delete from app.credit_reservations where workspace_id = any($1::uuid[]) or actor_user_id = any($2::text[])', [workspaceIds, userIds]);
  await query('delete from app.credit_grants where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.credit_accounts where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.billing_accounts where workspace_id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.workspace_members where workspace_id = any($1::uuid[]) or user_id = any($2::text[])', [workspaceIds, userIds]);
  await query('delete from app.workspace_setups where workspace_id = any($1::uuid[]) or user_id = any($2::text[])', [workspaceIds, userIds]);
  await query('delete from app.operator_step_ups where user_id = any($1::text[])', [userIds]);
  await query('delete from app.operator_roles where user_id = any($1::text[])', [userIds]);
  await query('delete from app.workspaces where id = any($1::uuid[])', [workspaceIds]);
  await query('delete from app.user_access_controls where user_id = any($1::text[])', [userIds]);
  await query('delete from "user" where id = any($1::text[])', [userIds]);
}

async function run(): Promise<void> {
  let ownerId = '';
  let memberId = '';
  let workspaceId = '';
  try {
    const owner = await signupAndLogin(ownerEmail, ownerPassword);
    ownerId = owner.userId;
    const created = await request('/api/workspaces', {workspaceName: `HTTP team ${suffix}`}, owner.token);
    assert.equal(created.status, 201);
    workspaceId = String((await json(created)).workspaceId);
    assert.match(workspaceId, /^[0-9a-f-]{36}$/i);

    const invite = await request(`/api/workspaces/${workspaceId}/invitations`, {email: memberEmail}, owner.token);
    assert.equal(invite.status, 201);
    const invitation = await database.db.select().from(workspaceInvitations).where(eq(workspaceInvitations.workspaceId, workspaceId));
    assert.equal(invitation.length, 1);
    const outbox = await database.db.select().from(mailOutbox).where(eq(mailOutbox.invitationId, invitation[0]!.id));
    assert.equal(outbox.length, 1);
    const token = String((outbox[0]!.payload as {token: string}).token);

    const member = await signupAndLogin(memberEmail, memberPassword);
    memberId = member.userId;
    const accepted = await request('/api/invitations/accept', {token}, member.token);
    assert.equal(accepted.status, 200);
    assert.equal((await json(accepted)).workspaceId, workspaceId);

    const page = await request('/dashboard/team', undefined, undefined, member.cookie);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, new RegExp(memberEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, new RegExp(ownerEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const now = new Date();
    await database.pool.query('insert into app.credit_accounts (workspace_id, version, created_at, updated_at) values ($1, 0, $2, $2)', [workspaceId, now]);
    const grant = await issueGrant(database.db, {actorUserId: ownerId, workspaceId, commandName: 'probe.team-http-grant', commandKey: suffix, businessKey: `team-http-${suffix}`, source: 'manual', amount: 731942n, payload: {amount: '731942'}});
    const quote = createServerQuote(DEFAULT_MODEL_ID, '1', {now});
    const createKey = `team-http-create-${suffix}`;
    const cancelKey = `team-http-cancel-${suffix}`;
    const createBody = {quote, input: {prompt: 'Private dashboard access fixture'}};
    // Commit only a terminal task, keeping the shared local worker out of this fixture.
    const task = await database.db.transaction(async (tx) => {
      const createdTask = await createGenerationTask(tx, {actor: {userId: memberId}, workspaceId, idempotencyKey: createKey, ...createBody, now});
      await cancelGenerationTask(tx, {actor: {userId: memberId}, workspaceId, taskId: createdTask.value.taskId, idempotencyKey: cancelKey, now});
      return createdTask.value;
    });
    const assetId = randomUUID();
    await database.pool.query("insert into app.assets (id, workspace_id, task_id, purpose, state, object_key, created_by, mime, bytes, created_at, updated_at) values ($1, $2, null, 'output', 'ready', $3, $4, 'video/mp4', 1, $5, $5)", [assetId, workspaceId, `workspaces/${workspaceId}/probe-${assetId}.mp4`, memberId, now]);
    const dashboardPath = `/dashboard?workspace=${workspaceId}`;
    const rosterPaths = [`/dashboard/team?workspace=${workspaceId}`, `/workspaces/${workspaceId}/settings/members`];
    const rosterMarkers = [ownerEmail, memberEmail, `HTTP team ${suffix}`];
    const privateMarkers = [task.taskId, task.reservationId, grant.grantId, assetId, '731942', '/download?token='];
    const activeDashboard = await request(dashboardPath, undefined, undefined, member.cookie);
    assert.equal(activeDashboard.status, 200);
    const activeHtml = await activeDashboard.text();
    for (const marker of privateMarkers) assert(activeHtml.includes(marker), `Active dashboard omitted fixture marker ${marker}.`);
    for (const path of rosterPaths) {
      const response = await request(path, undefined, undefined, member.cookie);
      assert.equal(response.status, 200);
      const roster = await response.text();
      for (const marker of rosterMarkers) assert(roster.includes(marker), `Active roster omitted fixture marker ${marker}.`);
    }
    await database.pool.query("update app.workspaces set status = 'suspended' where id = $1", [workspaceId]);
    const suspendedDashboard = await request(dashboardPath, undefined, undefined, member.cookie);
    assert.equal(suspendedDashboard.status, 200);
    const suspendedHtml = await suspendedDashboard.text();
    for (const marker of privateMarkers) assert(!suspendedHtml.includes(marker), `Suspended dashboard disclosed private marker ${marker}.`);
    assert.match(suspendedHtml, /Workspace unavailable/);
    for (const path of rosterPaths) {
      const response = await request(path, undefined, undefined, member.cookie);
      assert.equal(response.status, 200);
      const roster = await response.text();
      for (const marker of rosterMarkers) assert(!roster.includes(marker), 'Suspended workspace disclosed roster or workspace-choice metadata.');
      assert.match(roster, /Workspace unavailable/);
    }
    await database.pool.query("update app.workspaces set status = 'active' where id = $1", [workspaceId]);
    await database.pool.query("update app.billing_accounts set status = 'hold', hold_reason = 'HTTP access probe' where workspace_id = $1", [workspaceId]);
    const heldDashboard = await request(dashboardPath, undefined, undefined, member.cookie);
    assert.equal(heldDashboard.status, 200);
    const heldHtml = await heldDashboard.text();
    for (const marker of privateMarkers) assert(heldHtml.includes(marker), `Billing hold denied permitted dashboard marker ${marker}.`);
    for (const path of rosterPaths) {
      const response = await request(path, undefined, undefined, member.cookie);
      assert.equal(response.status, 200);
      const roster = await response.text();
      for (const marker of rosterMarkers) assert(roster.includes(marker), 'Billing hold denied permitted roster reads.');
    }
    // Keep the same session alive: pages must consult current account controls,
    // not just trust an authenticated or previously verified session payload.
    for (const condition of ['disabled', 'unverified'] as const) {
      if (condition === 'disabled') {
        await database.pool.query("insert into app.user_access_controls (user_id, status, disabled_at, reason, version, created_at, updated_at) values ($1, 'disabled', $2, 'HTTP access probe', 1, $2, $2) on conflict (user_id) do update set status = 'disabled', disabled_at = $2, reason = 'HTTP access probe', updated_at = $2", [memberId, now]);
      } else {
        await database.pool.query('update "user" set email_verified = false where id = $1', [memberId]);
      }
      try {
        for (const path of [dashboardPath, ...rosterPaths]) {
          const response = await request(path, undefined, undefined, member.cookie);
          assert.equal(response.status, 200);
          const deniedHtml = await response.text();
          for (const marker of [...privateMarkers, ...rosterMarkers]) assert(!deniedHtml.includes(marker), `${condition} account received private page data.`);
          assert.match(deniedHtml, /Workspace unavailable|Sign in/);
        }
      } finally {
        if (condition === 'disabled') await database.pool.query("update app.user_access_controls set status = 'active', disabled_at = null, reason = null where user_id = $1", [memberId]);
        else await database.pool.query('update "user" set email_verified = true where id = $1', [memberId]);
      }
    }
    const createPath = `/api/workspaces/${workspaceId}/generations`;
    const cancelPath = `${createPath}/${task.taskId}/cancel`;
    assert.equal((await request(createPath, createBody, member.token, undefined, createKey)).status, 200, 'An authorized command replay remains available during billing hold.');
    assert.equal((await request(cancelPath, {}, member.token, undefined, cancelKey)).status, 200);
    const businessSnapshot = async () => {
      const state: Record<string, unknown> = {};
      for (const table of ['generation_tasks', 'assets', 'credit_grants', 'credit_reservations', 'credit_ledger_entries', 'command_results', 'outbox_events']) {
        state[table] = (await database.pool.query(`select jsonb_agg(to_jsonb(t) order by t.id)::text as snapshot from app.${table} t where workspace_id = $1`, [workspaceId])).rows;
      }
      return state;
    };
    const removed = await request(`/api/workspaces/${workspaceId}/members/${memberId}/remove`, {}, owner.token);
    assert.equal(removed.status, 200);
    const beforeReplays = await businessSnapshot();
    for (const [path, body, key] of [[createPath, createBody, createKey], [cancelPath, {}, cancelKey]] as const) {
      const replay = await request(path, body, member.token, undefined, key);
      assert.equal(replay.status, 403, 'Removed member same-key replay must be denied.');
      const response = await replay.text();
      for (const marker of privateMarkers) assert(!response.includes(marker), 'Denied replay disclosed private state.');
    }
    assert.deepEqual(await businessSnapshot(), beforeReplays, 'Rejected replays changed business state.');
    console.log(JSON.stringify({status: 'PASS', createTeam: true, invite: true, accept: true, teamPageMembers: 2, suspendedDashboardAndRostersNoPrivateMarkers: true, activeWorkspaceChoicesOnly: true, billingHoldDashboardAndRosterReads: true, disabledAndUnverifiedLiveSessionPagesDenied: true, removedMemberCreateCancelReplay403: true, rejectedReplayStateUnchanged: true}));
  } finally {
    await cleanupUsers([ownerId, memberId].filter(Boolean));
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  let message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, '[redacted]');
  console.error(message);
  process.exitCode = 1;
});
