import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';

const base = 'internal/evidence/M4/task-5.10/railway-worker';
const platform = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|COMSPEC|SYSTEMROOT|WINDIR|SYSTEMDRIVE|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\))$/i.test(key)));
const secret = randomUUID() + randomUUID();
const env = {...platform, SHPITTO_FIXTURE_ENV_ONLY: '1', NODE_OPTIONS: `--import=${new URL('./full-verification-env-only-20261015.mjs', import.meta.url).href}`,
  NODE_ENV: 'production', SHPTITTO_RUNTIME_PROFILE: 'acceptance', TASK_RUNTIME: 'self_hosted', NEXT_TELEMETRY_DISABLED: '1',
  APP_URL: 'https://app.example.test', DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:1/unused_fixture_database', BETTER_AUTH_SECRET: secret,
  STORAGE_DRIVER: 's3', GENERATION_DRIVER: 'provider', MAIL_DRIVER: 'acceptance', ASSET_ROOT: './.tmp/unused-fixture-assets',
  STORAGE_S3_ENDPOINT: 'https://storage.example.test', STORAGE_S3_REGION: 'auto', STORAGE_S3_BUCKET: 'fixture-only',
  STORAGE_S3_ACCESS_KEY_ID: 'fixture-access', STORAGE_S3_SECRET_ACCESS_KEY: 'fixture-secret',
  REPLICATE_API_TOKEN: '', FAL_KEY: '', TRIGGER_SECRET_KEY: '', TRIGGER_PROJECT_REF: '',
};
const startedAt = new Date().toISOString();
const result = spawnSync('pwsh', ['-NoProfile', '-Command', 'corepack pnpm run verify; exit $LASTEXITCODE'], {cwd: process.cwd(), env, encoding: 'utf8', windowsHide: true, timeout: 600_000, maxBuffer: 16 * 1024 * 1024});
const normalize = (text) => String(text ?? '').replaceAll(secret, '[redacted]').replaceAll('\r\n', '\n').replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '').replace(/[ \t]+$/gm, '').trimEnd() + '\n';
writeFileSync(`${base}/verify-full-post-local-fixtures-20261015.log`, normalize(`${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? '\n' + result.error.message : ''}`), 'utf8');
const receipt = {startedAt, endedAt: new Date().toISOString(), command: 'corepack pnpm run verify', exitCode: result.status,
  status: result.status === 0 ? 'PASS_LOCAL_VERIFICATION' : 'FAIL',
  environmentPolicy: 'Allowlisted OS paths, explicit nonfunctional fixture configuration, process.loadEnvFile disabled and Next dotenv stat discovery blocked. No real provider credentials.',
  fullM4Acceptance: false};
writeFileSync(`${base}/verify-full-post-local-fixtures-20261015.json`, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(receipt));
process.exitCode = result.status === 0 ? 0 : 1;
