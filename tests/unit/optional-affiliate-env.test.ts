import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getServerEnv} from '../../src/config/env.ts';

test('disabled affiliate integration does not make core production config depend on affiliate credentials', () => {
  const fixture: Record<string, string> = {
    NODE_ENV: 'production', APP_URL: 'https://app.example.test', DATABASE_URL: 'postgres://fixture@localhost/fixture',
    STORAGE_S3_ENDPOINT: 'https://s3.example.test', STORAGE_S3_REGION: 'us-east-1', STORAGE_S3_BUCKET: 'fixture', STORAGE_S3_ACCESS_KEY_ID: 'fixture-access', STORAGE_S3_SECRET_ACCESS_KEY: 'fixture-secret', STORAGE_S3_FORCE_PATH_STYLE: 'false',
    BETTER_AUTH_SECRET: 'local-contract-test-only-secret', STORAGE_DRIVER: 's3', GENERATION_DRIVER: 'replicate', MAIL_DRIVER: 'resend',
    REPLICATE_WEBHOOK_SECRET: 'fixture-only', REPLICATE_WEBHOOK_ACCOUNT_ID: 'fixture', FAL_WEBHOOK_PUBLIC_KEY_PEM: 'fixture-only', FAL_WEBHOOK_ACCOUNT_ID: 'fixture',
    AFFILIATE_REFERRAL_SECRET: '', AFFILIATE_WEBHOOK_SECRET: '', AFFILIATE_PROGRAM_ID: '',
  };
  const previous = Object.fromEntries(Object.keys(fixture).map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, fixture);
    assert.equal(getServerEnv().affiliateProgramId, '');
    process.env.BETTER_AUTH_SECRET = 'replace-me';
    assert.throws(() => getServerEnv(), /betterAuthSecret/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
