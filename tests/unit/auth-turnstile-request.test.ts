import assert from 'node:assert/strict';
import {test} from 'node:test';

import {APIError} from 'better-auth';

import type {AppDatabase} from '../../src/db/client.ts';
import {rejectDisabledEmailSignIn} from '../../src/lib/auth.ts';

function policyDatabase(turnstileEnabled: boolean): AppDatabase {
  const chain = {
    from() { return chain; },
    where() { return chain; },
    async limit() { return [{emailVerificationEnabled: false, twoFactorRequired: false, turnstileEnabled}]; },
  };
  return {select() { return chain; }} as unknown as AppDatabase;
}

function restoreEnv(previous: Readonly<Record<string, string | undefined>>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('server-side email sign-up proceeds without a request when Turnstile is disabled', async () => {
  const keys = ['NODE_ENV', 'SHPTITTO_RUNTIME_PROFILE', 'APP_URL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const fetcher = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response('{}'); };
  try {
    Object.assign(process.env, {NODE_ENV: 'production', SHPTITTO_RUNTIME_PROFILE: 'production'});
    delete process.env.APP_URL;
    const gate = rejectDisabledEmailSignIn(policyDatabase(false));
    const body = {name: 'Acceptance Owner', email: 'owner@shpitto.local', password: 'secret', turnstileToken: 'browser-only'};
    await gate({path: '/sign-up/email', body} as never);
    assert.equal('turnstileToken' in body, false);
    assert.equal(fetches, 0);
    await gate({path: '/sign-in/email', body: {}} as never);
    await gate({path: '/request-password-reset', body: {}} as never);
  } finally {
    globalThis.fetch = fetcher;
    restoreEnv(previous);
  }
});

test('enabled Turnstile still requires a browser request and token', async () => {
  const keys = ['NODE_ENV', 'SHPTITTO_RUNTIME_PROFILE', 'APP_URL'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const fetcher = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; return new Response('{}'); };
  try {
    Object.assign(process.env, {NODE_ENV: 'production', SHPTITTO_RUNTIME_PROFILE: 'production'});
    delete process.env.APP_URL;
    const gate = rejectDisabledEmailSignIn(policyDatabase(true));
    await assert.rejects(gate({path: '/sign-up/email', body: {email: 'owner@shpitto.local'}} as never), (error: unknown) => {
      assert.ok(error instanceof APIError);
      assert.equal(error.body?.code, 'TURNSTILE_REQUEST_INVALID');
      assert.match(error.message, /authentication request is invalid/i);
      return true;
    });
    assert.equal(fetches, 0);

    Object.assign(process.env, {NODE_ENV: 'test'});
    delete process.env.SHPTITTO_RUNTIME_PROFILE;
    process.env.APP_URL = 'https://app.example.test';
    const request = new Request('https://app.example.test/api/auth/sign-up/email', {method: 'POST'});
    await assert.rejects(gate({path: '/sign-up/email', body: {email: 'owner@shpitto.local'}, request} as never), (error: unknown) => {
      assert.ok(error instanceof APIError);
      assert.equal(error.body?.code, 'TURNSTILE_REQUIRED');
      assert.match(error.message, /security check/i);
      return true;
    });
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = fetcher;
    restoreEnv(previous);
  }
});
