import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getServerEnv} from '../../src/config/env.ts';
import {parseTaskRuntime} from '../../src/config/task-runtime.ts';

function withEnvironment(values: Record<string, string>, run: () => void): void {
  const previous = {...process.env};
  try {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, values);
    run();
  } finally {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}

test('self-hosted task runtime is the default without ambient configuration or Trigger credentials', () => {
  withEnvironment({NODE_ENV: 'test'}, () => {
    assert.equal(getServerEnv().taskRuntime, 'self_hosted');
    assert.ok(Object.isFrozen(parseTaskRuntime({mode: '', triggerProjectRef: '', triggerSecretKey: ''})));
  });
});

test('undeployed Trigger opt-in fails closed rather than accepting a dead dispatcher', () => {
  assert.throws(() => parseTaskRuntime({mode: 'trigger', triggerProjectRef: '', triggerSecretKey: ''}), /TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY/);
  assert.throws(() => parseTaskRuntime({mode: 'trigger', triggerProjectRef: 'proj_fixture', triggerSecretKey: ''}), /TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY/);
  assert.throws(() => parseTaskRuntime({mode: 'trigger', triggerProjectRef: '', triggerSecretKey: 'tr_fixture'}), /TRIGGER_PROJECT_REF and TRIGGER_SECRET_KEY/);
  assert.throws(() => parseTaskRuntime({mode: 'trigger', triggerProjectRef: 'proj_fixture', triggerSecretKey: 'tr_fixture'}), /not available in this build/);
  assert.throws(() => parseTaskRuntime({mode: 'scheduler', triggerProjectRef: '', triggerSecretKey: ''}), /TASK_RUNTIME/);
});

test('default production configuration does not require or expose optional Trigger credentials', () => {
  withEnvironment({NODE_ENV: 'production', SHPTITTO_RUNTIME_PROFILE: 'acceptance', APP_URL: 'https://app.example.test',
    DATABASE_URL: 'postgres://fixture:fixture@fixture.railway.internal:5432/disposable', BETTER_AUTH_SECRET: 'fixture-only-auth',
    STORAGE_DRIVER: 's3', GENERATION_DRIVER: 'provider', MAIL_DRIVER: 'acceptance', STORAGE_S3_ENDPOINT: 'https://storage.example.test',
    STORAGE_S3_BUCKET: 'fixture', STORAGE_S3_ACCESS_KEY_ID: 'fixture-access', STORAGE_S3_SECRET_ACCESS_KEY: 'fixture-secret',
    TRIGGER_PROJECT_REF: 'unused-fixture-project', TRIGGER_SECRET_KEY: 'unused-fixture-secret'}, () => {
    const env = getServerEnv();
    assert.equal(env.taskRuntime, 'self_hosted');
    assert.equal(env.triggerSecretKey, '');
    assert.equal(env.triggerProjectRef, '');
  });
});
