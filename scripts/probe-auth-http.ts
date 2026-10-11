import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

import {eq} from 'drizzle-orm';

import {getServerEnv} from '../src/config/env.ts';
import {createDatabase} from '../src/db/client.ts';
import {userAccessControls} from '../src/db/schema/access.ts';
import {authUser, authVerification} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {commandResults} from '../src/db/schema/commands.ts';
import {auditEvents, creditLedgerEntries, outboxEvents} from '../src/db/schema/credit.ts';
import {creditAccounts, creditGrants, workspaceMembers, workspaceSetups, workspaces} from '../src/db/schema/workspace.ts';

const env = getServerEnv();
const email = `auth-http-${randomUUID()}@example.test`;
const oldPassword = `Old-${randomUUID()}`;
const newPassword = `New-${randomUUID()}`;
const secrets = new Set([oldPassword, newPassword, env.betterAuthSecret, env.databaseUrl].filter(Boolean));
type CapturedMessage = {ID: string; Subject: string; To: Array<{Address: string}>};

async function request(path: string, body?: unknown, token?: string, key?: string): Promise<Response> {
  return fetch(new URL(path, env.appUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin: new URL(env.appUrl).origin,
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
      ...(token ? {authorization: `Bearer ${token}`} : {}),
      ...(key ? {'idempotency-key': key} : {}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
}

async function capturedMessages(): Promise<CapturedMessage[]> {
  const url = new URL('/api/v1/search', env.mailHttpUrl);
  url.searchParams.set('query', `to:${email}`);
  const response = await fetch(url);
  assert.equal(response.status, 200, 'Mailpit search failed.');
  const result = await response.json() as {messages: CapturedMessage[]};
  return result.messages.filter((message) => message.To.some((recipient) => recipient.Address === email));
}

async function capturedLink(subject: string): Promise<URL> {
  const message = (await capturedMessages()).find((entry) => entry.Subject === subject);
  assert(message, 'The expected authentication email was not captured by Mailpit.');
  const response = await fetch(new URL(`/api/v1/message/${message.ID}`, env.mailHttpUrl));
  assert.equal(response.status, 200);
  const detail = await response.json() as {Text: string};
  const link = detail.Text.match(/https?:\/\/\S+/)?.[0];
  assert(link, 'Captured authentication email lacks a link.');
  const url = new URL(link);
  assert.equal(url.origin, new URL(env.appUrl).origin);
  for (const value of url.searchParams.values()) if (value.length > 12) secrets.add(value);
  const pathToken = url.pathname.match(/\/reset-password\/([^/]+)$/)?.[1];
  if (pathToken) secrets.add(pathToken);
  return url;
}

async function expectCode(response: Response, status: number, code: string): Promise<void> {
  assert.equal(response.status, status);
  assert.equal((await response.json() as {code?: string}).code, code);
}

async function run(): Promise<void> {
  const database = createDatabase({max: 2});
  let userId: string | undefined;
  let workspaceId: string | undefined;
  let teamWorkspaceId: string | undefined;
  try {
    for (const page of ['/signup', '/login', '/reset-password']) {
      assert.equal((await request(page)).status, 200, `Authentication page ${page} is unavailable.`);
    }
    const signup = await request('/api/auth/sign-up/email', {name: 'HTTP auth proof', email, password: oldPassword, callbackURL: '/login'});
    assert.equal(signup.status, 200);
    const account = (await database.db.select().from(authUser).where(eq(authUser.email, email)))[0];
    assert(account);
    userId = account.id;
    assert.equal(account.emailVerified, false);
    await expectCode(await request('/api/auth/sign-in/email', {email, password: oldPassword}), 403, 'EMAIL_NOT_VERIFIED');
    const verification = await request((await capturedLink('Verify your Shpitto email')).toString());
    assert.equal(verification.status, 302);
    assert.equal((await database.db.select().from(authUser).where(eq(authUser.id, userId)))[0]!.emailVerified, true);
    const login = await request('/api/auth/sign-in/email', {email, password: oldPassword});
    assert.equal(login.status, 200);
    const credentials = await login.json() as {token: string; user: {id: string}};
    assert.equal(credentials.user.id, userId);
    assert.equal(typeof credentials.token, 'string');
    secrets.add(credentials.token);
    assert.equal((await request('/api/auth/get-session', undefined, credentials.token)).status, 200);
    const pendingPage = await request('/dashboard', undefined, credentials.token);
    assert.equal(pendingPage.status, 200);
    assert.match(await pendingPage.text(), /Set up your personal workspace/, 'A new account must have an explicit personal setup action.');
    assert.equal((await database.db.select().from(workspaces).where(eq(workspaces.createdBy, userId))).length, 0, 'Viewing the dashboard must not create a workspace.');

    teamWorkspaceId = randomUUID();
    const now = new Date();
    await database.db.insert(workspaces).values({id: teamWorkspaceId, kind: 'team', name: 'HTTP onboarding team', createdBy: userId, status: 'active', version: 1, createdAt: now, updatedAt: now});
    await database.db.insert(workspaceMembers).values({workspaceId: teamWorkspaceId, userId, role: 'owner', createdAt: now});
    await database.db.insert(billingAccounts).values({workspaceId: teamWorkspaceId, status: 'active', holdReason: null, version: 1, createdAt: now, updatedAt: now});
    await database.db.insert(creditAccounts).values({workspaceId: teamWorkspaceId, version: 0n, createdAt: now, updatedAt: now});
    const memberPage = await request('/dashboard', undefined, credentials.token);
    assert.match(await memberPage.text(), /Set up your personal workspace/, 'A team membership must not hide pending personal setup.');
    assert.equal((await request('/api/onboarding', {}, undefined, `onboard-${randomUUID()}`)).status, 401);
    assert.equal((await request('/api/onboarding', {}, credentials.token)).status, 400, 'Onboarding must require an idempotency key.');
    const crossOrigin = await fetch(new URL('/api/onboarding', env.appUrl), {method: 'POST', headers: {origin: 'https://untrusted.example.test', authorization: `Bearer ${credentials.token}`, 'content-type': 'application/json', 'idempotency-key': `onboard-${randomUUID()}`}, body: '{}'});
    assert.equal(crossOrigin.status, 403, 'Cross-origin onboarding must be denied.');
    const onboardingKey = `onboard-${randomUUID()}`;
    const concurrentOnboarding = await Promise.all(Array.from({length: 3}, () => request('/api/onboarding', {workspaceName: ' HTTP personal setup ', fundDemoCredits: false, profile: 'production'}, credentials.token, onboardingKey)));
    assert.deepEqual(concurrentOnboarding.map((response) => response.status).sort(), [200, 200, 201], 'Concurrent onboarding must create once and replay twice.');
    const onboarding = concurrentOnboarding.find((response) => response.status === 201)!;
    const created = await onboarding.json() as {workspaceId: string; demoGrantId?: string};
    workspaceId = created.workspaceId;
    assert.equal(typeof created.demoGrantId, 'string', 'The server local profile must fund one Mock generation without a client funding toggle.');
    const grants = await database.db.select().from(creditGrants).where(eq(creditGrants.workspaceId, workspaceId));
    assert.equal(grants.length, 1);
    assert.equal(grants[0]!.source, 'demo');
    assert.equal(grants[0]!.available, 100n);
    const conflict = await request('/api/onboarding', {workspaceName: 'A different personal workspace'}, credentials.token, onboardingKey);
    assert.equal(conflict.status, 409, 'An onboarding key reused with a changed semantic payload must conflict.');
    assert.equal((await conflict.json() as {error: {code: string}}).error.code, 'CONFLICT');
    const replay = await request('/api/onboarding', {workspaceName: 'HTTP personal setup', profile: 'local', fundDemoCredits: true}, credentials.token, onboardingKey);
    assert.equal(replay.status, 200);
    const replayed = await replay.json() as {workspaceId: string; demoGrantId?: string; replayed?: boolean};
    assert.equal(replayed.workspaceId, workspaceId);
    assert.equal(replayed.demoGrantId, created.demoGrantId);
    assert.equal(replayed.replayed, true, 'The same normalized payload must replay its durable command.');
    const newKeyRetry = await request('/api/onboarding', {workspaceName: 'HTTP personal setup'}, credentials.token, `onboard-${randomUUID()}`);
    assert.equal(newKeyRetry.status, 200);
    assert.equal((await newKeyRetry.json() as {demoGrantReplayed?: boolean}).demoGrantReplayed, true);
    const personalRows = (await database.db.select().from(workspaces).where(eq(workspaces.createdBy, userId))).filter((row) => row.kind === 'personal');
    assert.equal(personalRows.length, 1);
    assert.equal(personalRows[0]!.name, 'HTTP personal setup');
    const onboardingCommands = (await database.db.select().from(commandResults).where(eq(commandResults.actorUserId, userId))).filter((row) => row.workspaceId === null && row.commandName === 'workspace.onboard-personal');
    assert.equal(onboardingCommands.length, 2, 'The concurrent original and new-key retry must retain two durable global commands.');
    assert.equal((await database.db.select().from(creditGrants).where(eq(creditGrants.workspaceId, workspaceId))).length, 1, 'A retry must not issue duplicate credits.');
    await database.db.update(userAccessControls).set({status: 'disabled', disabledAt: new Date()}).where(eq(userAccessControls.userId, userId));
    assert.equal((await request('/api/onboarding', {workspaceName: 'HTTP personal setup'}, credentials.token, onboardingKey)).status, 403, 'A disabled account must not replay a previously committed onboarding command.');
    await database.db.update(userAccessControls).set({status: 'active', disabledAt: null}).where(eq(userAccessControls.userId, userId));
    await database.db.update(authUser).set({emailVerified: false}).where(eq(authUser.id, userId));
    assert.equal((await request('/api/onboarding', {workspaceName: 'HTTP personal setup'}, credentials.token, onboardingKey)).status, 403, 'An unverified account must not replay a previously committed onboarding command.');
    await database.db.update(authUser).set({emailVerified: true}).where(eq(authUser.id, userId));
    const completedPage = await request(`/dashboard?workspace=${workspaceId}`, undefined, credentials.token);
    const completedHtml = await completedPage.text();
    assert.match(completedHtml, /Queue generation/);
    assert.doesNotMatch(completedHtml, /Set up your personal workspace/, 'Completed setup must no longer show the onboarding action.');

    assert.equal((await request('/api/auth/request-password-reset', {email, redirectTo: '/reset-password'})).status, 200);
    const callback = await request((await capturedLink('Reset your Shpitto password')).toString());
    assert.equal(callback.status, 302);
    const resetUrl = new URL(callback.headers.get('location')!);
    const resetToken = resetUrl.searchParams.get('token');
    assert(resetToken);
    secrets.add(resetToken);
    const resetPage = await request(resetUrl.toString());
    assert.equal(resetPage.status, 200);
    assert.match(await resetPage.text(), /New password/, 'The reset link did not render the password completion form.');
    assert.equal((await request('/api/auth/reset-password', {token: resetToken, newPassword})).status, 200);
    await expectCode(await request('/api/auth/reset-password', {token: resetToken, newPassword: oldPassword}), 400, 'INVALID_TOKEN');
    await expectCode(await request('/api/auth/sign-in/email', {email, password: oldPassword}), 401, 'INVALID_EMAIL_OR_PASSWORD');
    assert.equal(await (await request('/api/auth/get-session', undefined, credentials.token)).json(), null);
    assert.equal((await request('/api/auth/sign-in/email', {email, password: newPassword})).status, 200);
    await database.db.update(userAccessControls).set({status: 'disabled', disabledAt: new Date(), reason: 'HTTP lifecycle proof'}).where(eq(userAccessControls.userId, userId));
    await expectCode(await request('/api/auth/sign-in/email', {email, password: newPassword}), 403, 'ACCOUNT_DISABLED');
    console.log(JSON.stringify({status: 'PASS', appTransport: 'live Next.js HTTP', mailTransport: 'live Mailpit HTTP send and capture', signup: true, emailVerification: true, persistentLogin: true, onboardingExplicitAction: true, teamMemberPersonalSetup: true, dashboardGetHasNoMutation: true, onboardingAuthOriginKeyGuards: true, serverSelectedLocalFunding: true, onboardingConcurrentSingleWorkspaceGrant: true, onboardingSemanticConflict: true, onboardingNormalizedReplay: true, onboardingReplayReauthorizes: true, onboardingGrantRetry: true, onboardingRetry: true, resetPageCompletionForm: true, passwordReset: true, tokenReplayDenied: true, oldCredentialsAndSessionDenied: true, disabledLoginDenied: true, cloudDelivery: false}));
  } finally {
    try {
      if (userId) {
        await database.db.delete(commandResults).where(eq(commandResults.actorUserId, userId));
        await database.db.delete(authVerification).where(eq(authVerification.value, userId));
        await database.db.delete(workspaceSetups).where(eq(workspaceSetups.userId, userId));
        const owned = await database.db.select({id: workspaces.id}).from(workspaces).where(eq(workspaces.createdBy, userId));
        for (const workspace of owned) {
          await database.db.delete(commandResults).where(eq(commandResults.workspaceId, workspace.id));
          await database.db.delete(outboxEvents).where(eq(outboxEvents.workspaceId, workspace.id));
          await database.db.delete(auditEvents).where(eq(auditEvents.workspaceId, workspace.id));
          await database.db.delete(creditLedgerEntries).where(eq(creditLedgerEntries.workspaceId, workspace.id));
          await database.db.delete(creditGrants).where(eq(creditGrants.workspaceId, workspace.id));
          await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspace.id));
          await database.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, workspace.id));
          await database.db.delete(workspaces).where(eq(workspaces.id, workspace.id));
        }
        await database.db.delete(authUser).where(eq(authUser.id, userId));
      }
      const messages = await capturedMessages();
      if (messages.length > 0) {
        const removed = await fetch(new URL('/api/v1/messages', env.mailHttpUrl), {method: 'DELETE', headers: {'content-type': 'application/json'}, body: JSON.stringify({IDs: messages.map((message) => message.ID)})});
        assert.equal(removed.status, 200, 'Failed to remove this probe\'s captured emails.');
      }
    } finally {
      await database.pool.end();
    }
  }
}

run().catch((error: unknown) => {
  let diagnostic = error instanceof Error ? (error.stack ?? error.message) : 'HTTP authentication proof failed.';
  for (const secret of secrets) diagnostic = diagnostic.replaceAll(secret, '[redacted]');
  console.error(diagnostic.replace(/https?:\/\/[^\s]+/g, '[redacted URL]'));
  process.exitCode = 1;
});
