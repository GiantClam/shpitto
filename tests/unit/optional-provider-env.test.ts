import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getRuntimeProfile, getServerEnv} from '../../src/config/env.ts';
import {getProviderModel} from '../../src/config/provider-models.ts';
import {createReplicateProvider} from '../../src/adapters/providers/replicate/index.ts';
import {createFalProvider} from '../../src/adapters/providers/fal/index.ts';
import {verifyReplicateWebhook} from '../../src/adapters/providers/replicate/webhook.ts';
import {verifyFalWebhook} from '../../src/adapters/providers/fal/webhook.ts';

test('core production config does not require inactive provider webhook credentials', () => {
  const fixture: Record<string, string | undefined> = {
    NODE_ENV: 'production', APP_URL: 'https://app.example.test', DATABASE_URL: 'postgres://fixture@localhost/fixture',
    STORAGE_S3_ENDPOINT: 'https://s3.example.test', STORAGE_S3_REGION: 'us-east-1', STORAGE_S3_BUCKET: 'fixture', STORAGE_S3_ACCESS_KEY_ID: 'fixture-access', STORAGE_S3_SECRET_ACCESS_KEY: 'fixture-secret', STORAGE_S3_FORCE_PATH_STYLE: 'false',
    BETTER_AUTH_SECRET: 'local-contract-test-only-secret', STORAGE_DRIVER: 's3-compatible', GENERATION_DRIVER: 'provider', MAIL_DRIVER: 'smtp',
    REPLICATE_WEBHOOK_SECRET: undefined, REPLICATE_WEBHOOK_ACCOUNT_ID: undefined, FAL_WEBHOOK_PUBLIC_KEY_PEM: undefined, FAL_WEBHOOK_ACCOUNT_ID: undefined,
    AFFILIATE_REFERRAL_SECRET: undefined, AFFILIATE_WEBHOOK_SECRET: undefined, AFFILIATE_PROGRAM_ID: undefined, BILLING_WEBHOOK_SECRET: undefined,
  };
  const previous = Object.fromEntries(Object.keys(fixture).map((key) => [key, process.env[key]]));
  const assign = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
  try {
    assign(fixture);
    const env = getServerEnv();
    assert.equal(env.replicateWebhookSecret, '');
    assert.equal(env.falWebhookPublicKeyPem, '');
    assert.equal(env.storageDriver, 's3');
    const body = new TextEncoder().encode('{}');
    const headers = new Headers();
    const replicate = getProviderModel('replicate-wan22-t2v');
    const fal = getProviderModel('fal-wan22-t2v');
    assert.throws(() => verifyReplicateWebhook(body, headers, {provider: 'replicate', modelKey: replicate.modelKey, requestId: 'fixture', catalog: replicate}, {secret: env.replicateWebhookSecret}), /verification is not configured/);
    assert.throws(() => verifyFalWebhook(body, headers, {provider: 'fal', modelKey: fal.modelKey, requestId: 'fixture', catalog: fal}, {publicKeyPem: env.falWebhookPublicKeyPem}), /verification is not configured/);
    for (const [key, value, field] of [['STORAGE_DRIVER', 'local', 'storageDriver'], ['GENERATION_DRIVER', 'mock', 'generationDriver'], ['MAIL_DRIVER', 'local', 'mailDriver'], ['BETTER_AUTH_SECRET', 'replace-me', 'betterAuthSecret']]) {
      process.env[key] = value;
      assert.throws(() => getServerEnv(), new RegExp(field));
      process.env[key] = fixture[key];
    }
  } finally { assign(previous); }
});



test('production storage fails closed without a private S3-compatible configuration', () => {
  const keys = ['NODE_ENV', 'NEXT_PHASE', 'APP_URL', 'DATABASE_URL', 'BETTER_AUTH_SECRET', 'STORAGE_DRIVER', 'GENERATION_DRIVER', 'MAIL_DRIVER', 'STORAGE_S3_ENDPOINT', 'STORAGE_S3_REGION', 'STORAGE_S3_BUCKET', 'STORAGE_S3_ACCESS_KEY_ID', 'STORAGE_S3_SECRET_ACCESS_KEY'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {NODE_ENV:'production', APP_URL:'https://app.example.test', DATABASE_URL:'postgres://fixture@localhost/fixture', BETTER_AUTH_SECRET:'production-test-secret', STORAGE_DRIVER:'local', GENERATION_DRIVER:'provider', MAIL_DRIVER:'smtp'});
    for (const key of keys.slice(8)) delete process.env[key];
    assert.throws(() => getServerEnv(), /STORAGE_DRIVER/i);
    process.env.STORAGE_DRIVER='s3';
    process.env.NEXT_PHASE='phase-production-build';
    assert.equal(getServerEnv().storageS3Endpoint, '');
    assert.equal(getServerEnv().storageS3Region, 'auto');
    delete process.env.NEXT_PHASE;
    process.env.STORAGE_S3_SECRET_ACCESS_KEY='your-secret-must-not-appear';
    assert.throws(() => getServerEnv(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /S3-compatible storage is incomplete/i);
      assert.match(error.message, /storageS3SecretAccessKey/);
      assert.doesNotMatch(error.message, /your-secret-must-not-appear/);
      return true;
    });
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key]=value; }
  }
});

test('activating either real provider without its own token fails before transport access', () => {
  let requests = 0;
  const transport = {async request() {requests++; return {status: 200, body: {}};}};
  assert.throws(() => createReplicateProvider({mode: 'live', transport}), /requires a server-side token/);
  assert.throws(() => createFalProvider({mode: 'live', transport}), /requires a server-side token/);
  assert.equal(requests, 0);
});

test('acceptance profile is explicit and does not change production catalog behavior', () => {
  const keys = ['NODE_ENV', 'SHPTITTO_RUNTIME_PROFILE', 'APP_URL', 'DATABASE_URL', 'BETTER_AUTH_SECRET', 'STORAGE_DRIVER', 'GENERATION_DRIVER', 'MAIL_DRIVER', 'STORAGE_S3_ENDPOINT', 'STORAGE_S3_REGION', 'STORAGE_S3_BUCKET', 'STORAGE_S3_ACCESS_KEY_ID', 'STORAGE_S3_SECRET_ACCESS_KEY'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {NODE_ENV:'production', SHPTITTO_RUNTIME_PROFILE:'acceptance', APP_URL:'https://staging.example.test', DATABASE_URL:'postgres://fixture@localhost/fixture', BETTER_AUTH_SECRET:'acceptance-test-secret', STORAGE_DRIVER:'s3', GENERATION_DRIVER:'provider', MAIL_DRIVER:'smtp', STORAGE_S3_ENDPOINT:'https://s3.example.test', STORAGE_S3_REGION:'auto', STORAGE_S3_BUCKET:'fixture', STORAGE_S3_ACCESS_KEY_ID:'fixture-access', STORAGE_S3_SECRET_ACCESS_KEY:'fixture-secret'});
    assert.equal(getServerEnv().runtimeProfile, 'acceptance');
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key]=value; }
  }
});

test('explicit local profile survives a production Next standalone runtime', () => {
  const keys = ['NODE_ENV', 'SHPTITTO_RUNTIME_PROFILE', 'APP_URL', 'DATABASE_URL', 'BETTER_AUTH_SECRET', 'STORAGE_DRIVER', 'GENERATION_DRIVER', 'MAIL_DRIVER', 'BILLING_WEBHOOK_SECRET'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {NODE_ENV: 'production', SHPTITTO_RUNTIME_PROFILE: 'local', APP_URL: 'http://127.0.0.1:3199', DATABASE_URL: 'postgres://fixture@localhost/fixture', BETTER_AUTH_SECRET: 'local-standalone-test-secret', STORAGE_DRIVER: 'local', GENERATION_DRIVER: 'mock', MAIL_DRIVER: 'local'});
    assert.equal(getRuntimeProfile(), 'local');
    assert.equal(getServerEnv().runtimeProfile, 'local');
    assert.equal(getServerEnv().billingWebhookSecret, 'local-development-billing-webhook-secret');
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
