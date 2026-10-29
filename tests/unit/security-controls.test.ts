import assert from 'node:assert/strict';
import {test} from 'node:test';

import {encryptSecret, decryptSecret} from '../../src/security/secrets.ts';
import {publicSecuritySettings, type RuntimeSecuritySettings} from '../../src/modules/security/settings.ts';
import {verifyTurnstile} from '../../src/modules/security/turnstile.ts';

const settings: RuntimeSecuritySettings = {
  emailVerificationEnabled: false,
  twoFactorRequired: false,
  turnstileEnabled: true,
  turnstileSiteKey: 'site-key',
  turnstileConfigured: true,
  smtpEnabled: true,
  smtpConfigured: true,
  emailDeliveryAvailable: true,
  smtpFromEmail: 'no-reply@example.com',
  smtpFromName: 'Shpitto',
  version: 1,
  turnstileSecretKey: 'secret-key',
  smtpUrl: 'smtps://user:pass@example.com:465',
};

test('encrypted security secrets round-trip without exposing plaintext format', () => {
  const encrypted = encryptSecret('smtp-password', 'better-auth-secret');
  assert.notEqual(encrypted, 'smtp-password');
  assert.equal(decryptSecret(encrypted, 'better-auth-secret'), 'smtp-password');
  assert.throws(() => decryptSecret(encrypted, 'wrong-secret'));
});

test('public security projection omits provider secrets', () => {
  const projected = publicSecuritySettings(settings);
  assert.equal('turnstileSecretKey' in projected, false);
  assert.equal('smtpUrl' in projected, false);
  assert.equal(projected.smtpConfigured, true);
});

test('disabled Turnstile does not call the provider', async () => {
  let calls = 0;
  const fetcher = globalThis.fetch;
  globalThis.fetch = async () => {calls += 1; return new Response('{}');};
  try {
    await verifyTurnstile({...settings, turnstileEnabled: false}, undefined, 'app.example.test', 'login');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = fetcher; }
});

test('enabled Turnstile requires a token and accepts a matching hostname', async () => {
  await assert.rejects(verifyTurnstile(settings, '', 'app.example.test', 'login'), /security check/i);
  const fetcher = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({success: true, hostname: 'app.example.test', action: 'login'}), {status: 200, headers: {'content-type': 'application/json'}});
  try {
    await verifyTurnstile(settings, 'valid-token', 'app.example.test', 'login');
  } finally { globalThis.fetch = fetcher; }
});

test('enabled Turnstile rejects a foreign hostname', async () => {
  const fetcher = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({success: true, hostname: 'evil.example', action: 'login'}), {status: 200});
  try {
    await assert.rejects(verifyTurnstile(settings, 'valid-token', 'app.example.test', 'login'), /security check/i);
  } finally { globalThis.fetch = fetcher; }
});

test('enabled Turnstile rejects a mismatched action', async () => {
  const fetcher = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({success: true, hostname: 'app.example.test', action: 'signup'}), {status: 200});
  try {
    await assert.rejects(verifyTurnstile(settings, 'valid-token', 'app.example.test', 'login'), /security check/i);
  } finally { globalThis.fetch = fetcher; }
});
