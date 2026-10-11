import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';

import {eq} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {LocalMailAdapter} from '../src/adapters/mail/local.ts';
import {MailpitMailAdapter} from '../src/adapters/mail/mailpit.ts';
import {getServerEnv} from '../src/config/env.ts';
import {createDatabase, createMigrationClient} from '../src/db/client.ts';
import {userAccessControls} from '../src/db/schema/access.ts';
import {authSession, authUser, authVerification} from '../src/db/schema/auth.ts';
import {billingAccounts} from '../src/db/schema/billing.ts';
import {creditAccounts, workspaceSetups, workspaces} from '../src/db/schema/workspace.ts';
import {createAuth} from '../src/lib/auth.ts';
import {completePersonalWorkspaceOnboarding, getOnboardingStatus} from '../src/modules/workspaces/onboard.ts';

const mail = new LocalMailAdapter();
const env = getServerEnv();
const email = `auth-lifecycle-${randomUUID()}@example.test`;
const oldPassword = `Before-${randomUUID()}`;
const newPassword = `After-${randomUUID()}`;
const sensitiveValues = new Set([oldPassword, newPassword, env.betterAuthSecret, env.databaseUrl].filter(Boolean));

function errorDiagnostic(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error)) return {name: 'UnknownError'};
  const redact = (value: string): string => {
    let sanitized = value;
    for (const secret of sensitiveValues) sanitized = sanitized.replaceAll(secret, '[redacted]');
    return sanitized.replace(/https?:\/\/[^\s]+/g, '[redacted URL]');
  };
  return {
    name: error.name,
    message: redact(error.message),
    stack: error.stack ? redact(error.stack) : undefined,
    ...(error.cause && depth < 2 ? {cause: errorDiagnostic(error.cause, depth + 1)} : {}),
  };
}

function authRequest(path: string, body?: unknown, bearerToken?: string): Request {
  return new Request(new URL(`/api/auth${path}`, env.appUrl), {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      origin: new URL(env.appUrl).origin,
      ...(body === undefined ? {} : {'content-type': 'application/json'}),
      ...(bearerToken ? {authorization: `Bearer ${bearerToken}`} : {}),
    },
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
}

function lastMailLink(subject: string): URL {
  const message = [...mail.messages].reverse().find((entry) => entry.to === email && entry.subject === subject);
  assert(message, `Expected ${subject} message was not delivered.`);
  const link = message.body.match(/https?:\/\/\S+/)?.[0];
  assert(link, 'Authentication email did not contain a link.');
  const url = new URL(link);
  for (const value of url.searchParams.values()) if (value.length > 12) sensitiveValues.add(value);
  const pathToken = url.pathname.match(/\/reset-password\/([^/]+)$/)?.[1];
  if (pathToken) sensitiveValues.add(pathToken);
  assert.equal(url.origin, new URL(env.appUrl).origin);
  return url;
}

async function expectCode(response: Response, expectedStatus: number, expectedCode: string): Promise<void> {
  assert.equal(response.status, expectedStatus);
  const payload = await response.json() as {code?: string};
  assert.equal(payload.code, expectedCode);
}

async function probeHttpTransport(): Promise<void> {
  const deliveries: unknown[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    if (request.url === '/api/v1/send' && request.method === 'POST') {
      deliveries.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.writeHead(deliveries.length === 1 ? 200 : 503, {'content-type': 'application/json'});
      response.end('{}');
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const transport = new MailpitMailAdapter(`http://127.0.0.1:${address.port}`);
    const message = {to: 'capture@example.test', subject: 'Verification contract', body: 'Verification message'};
    assert.deepEqual(await transport.send(message), {ok: true, value: undefined});
    assert.deepEqual(deliveries[0], {From: {Email: 'no-reply@shpitto.local', Name: 'Shpitto'}, To: [{Email: message.to}], Subject: message.subject, Text: message.body});
    const unavailable = await transport.send(message);
    assert.equal(unavailable.ok, false);
    if (!unavailable.ok) {
      assert.equal(unavailable.error.code, 'MAIL_DELIVERY_FAILED');
      assert.equal(unavailable.error.retryable, true);
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function run(): Promise<void> {
  await probeHttpTransport();
  const migrationClient = createMigrationClient();
  await migrationClient.connect();
  try {
    await migrate(drizzle(migrationClient), {migrationsFolder: 'src/db/migrations'});
  } finally {
    await migrationClient.end();
  }
  let database = createDatabase({max: 4});
  let instance = createAuth(database.db, {mailAdapter: mail});
  let userId: string | undefined;
  let workspaceId: string | undefined;
  try {
    const signup = await instance.handler(authRequest('/sign-up/email', {name: 'Auth lifecycle probe', email, password: oldPassword, callbackURL: '/login'}));
    assert.equal(signup.status, 200);
    const account = (await database.db.select().from(authUser).where(eq(authUser.email, email)))[0];
    assert(account, 'Better Auth signup did not persist its user.');
    userId = account.id;
    assert.equal(account.emailVerified, false);
    assert.deepEqual(await getOnboardingStatus(database.db, userId), {status: 'pending', workspaceId: null});
    assert.equal((await database.db.select().from(authSession).where(eq(authSession.userId, userId))).length, 0);
    await expectCode(await instance.handler(authRequest('/sign-in/email', {email, password: oldPassword})), 403, 'EMAIL_NOT_VERIFIED');

    const brokenMail = createAuth(database.db, {mailAdapter: {send: async () => ({ok: false, error: {code: 'OFFLINE', message: 'Fixture unavailable', retryable: true}})}});
    await expectCode(await brokenMail.handler(authRequest('/send-verification-email', {email, callbackURL: '/login'})), 503, 'EMAIL_DELIVERY_UNAVAILABLE');
    const invalidVerification = await instance.handler(authRequest('/verify-email?token=invalid&callbackURL=%2Flogin'));
    assert.equal(invalidVerification.status, 302);
    assert.match(invalidVerification.headers.get('location') ?? '', /error=/);
    assert.equal((await database.db.select().from(authUser).where(eq(authUser.id, userId)))[0]!.emailVerified, false);
    const verified = await instance.handler(new Request(lastMailLink('Verify your Shpitto email')));
    assert.equal(verified.status, 302);
    assert.equal((await database.db.select().from(authUser).where(eq(authUser.id, userId)))[0]!.emailVerified, true);

    const login = await instance.handler(authRequest('/sign-in/email', {email, password: oldPassword}));
    assert.equal(login.status, 200);
    const credentials = await login.json() as {token: string; user: {id: string}};
    assert.equal(credentials.user.id, userId);
    assert.equal(typeof credentials.token, 'string');
    sensitiveValues.add(credentials.token);
    workspaceId = (await completePersonalWorkspaceOnboarding(database.db, userId)).workspaceId;
    await database.pool.end();
    database = createDatabase({max: 4});
    instance = createAuth(database.db, {mailAdapter: mail});
    const restoredSession = await instance.handler(authRequest('/get-session', undefined, credentials.token));
    assert.equal(restoredSession.status, 200);
    assert.equal((await restoredSession.json() as {user: {id: string}}).user.id, userId);
    assert.deepEqual(await completePersonalWorkspaceOnboarding(database.db, userId), {status: 'complete', workspaceId, created: false});

    const resetRequest = await instance.handler(authRequest('/request-password-reset', {email, redirectTo: '/reset-password'}));
    assert.equal(resetRequest.status, 200);
    const resetCallback = await instance.handler(new Request(lastMailLink('Reset your Shpitto password')));
    assert.equal(resetCallback.status, 302);
    const resetLocation = new URL(resetCallback.headers.get('location')!);
    assert.equal(resetLocation.pathname, '/reset-password');
    const resetToken = resetLocation.searchParams.get('token');
    assert(resetToken);
    await expectCode(await instance.handler(authRequest('/reset-password', {token: 'invalid', newPassword})), 400, 'INVALID_TOKEN');
    assert.equal((await instance.handler(authRequest('/reset-password', {token: resetToken, newPassword}))).status, 200);
    await expectCode(await instance.handler(authRequest('/reset-password', {token: resetToken, newPassword: oldPassword})), 400, 'INVALID_TOKEN');
    assert.equal((await database.db.select().from(authSession).where(eq(authSession.userId, userId))).length, 0, 'Password reset retained old sessions.');
    assert.equal(await (await instance.handler(authRequest('/get-session', undefined, credentials.token))).json(), null);
    await expectCode(await instance.handler(authRequest('/sign-in/email', {email, password: oldPassword})), 401, 'INVALID_EMAIL_OR_PASSWORD');
    assert.equal((await instance.handler(authRequest('/sign-in/email', {email, password: newPassword}))).status, 200);

    await database.db.update(userAccessControls).set({status: 'disabled', disabledAt: new Date(), reason: 'Auth lifecycle probe'}).where(eq(userAccessControls.userId, userId));
    await expectCode(await instance.handler(authRequest('/sign-in/email', {email, password: newPassword})), 403, 'ACCOUNT_DISABLED');
    await database.db.update(userAccessControls).set({status: 'active', disabledAt: null, reason: null}).where(eq(userAccessControls.userId, userId));
    await database.db.update(authUser).set({disabledAt: new Date()}).where(eq(authUser.id, userId));
    await expectCode(await instance.handler(authRequest('/sign-in/email', {email, password: newPassword})), 403, 'ACCOUNT_DISABLED');
    await database.db.update(authUser).set({disabledAt: null}).where(eq(authUser.id, userId));

    await instance.handler(authRequest('/request-password-reset', {email, redirectTo: '/reset-password'}));
    const expiredCallback = await instance.handler(new Request(lastMailLink('Reset your Shpitto password')));
    const expiredToken = new URL(expiredCallback.headers.get('location')!).searchParams.get('token');
    assert(expiredToken);
    await database.db.update(authVerification).set({expiresAt: new Date(Date.now() - 1000)}).where(eq(authVerification.identifier, `reset-password:${expiredToken}`));
    await expectCode(await instance.handler(authRequest('/reset-password', {token: expiredToken, newPassword: oldPassword})), 400, 'INVALID_TOKEN');
    console.log(JSON.stringify({status: 'PASS', signupVerifiedThroughEmail: true, persistentSessionRestart: true, onboardingRecovered: true, passwordReset: true, invalidExpiredReplayedTokensRejected: true, oldCredentialsAndSessionsRevoked: true, disabledLoginRejected: true, mailTransport: 'Mailpit HTTP contract fixture', authMail: 'injected recording adapter; no external delivery'}));
  } finally {
    if (userId) {
      await database.db.delete(authVerification).where(eq(authVerification.value, userId));
      await database.db.delete(workspaceSetups).where(eq(workspaceSetups.userId, userId));
      if (workspaceId) {
        await database.db.delete(billingAccounts).where(eq(billingAccounts.workspaceId, workspaceId));
        await database.db.delete(creditAccounts).where(eq(creditAccounts.workspaceId, workspaceId));
        await database.db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      }
      await database.db.delete(authUser).where(eq(authUser.id, userId));
    }
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(JSON.stringify(errorDiagnostic(error)));
  process.exitCode = 1;
});
