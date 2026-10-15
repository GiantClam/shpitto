import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const values = Object.fromEntries(
  example
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const required = ['NODE_ENV', 'APP_URL', 'DATABASE_URL', 'BETTER_AUTH_SECRET', 'STORAGE_DRIVER', 'GENERATION_DRIVER', 'TASK_RUNTIME', 'MAIL_DRIVER'];
const missing = required.filter((key) => !(key in values));
const exampleHasNoRealSecret = !/sk_[A-Za-z0-9]{20,}|pk_[A-Za-z0-9]{20,}|BEGIN PRIVATE KEY/.test(example);
const productionSampleRejected =
  values.GENERATION_DRIVER === 'mock' &&
  values.STORAGE_DRIVER === 'local' &&
  values.MAIL_DRIVER === 'local' &&
  /replace-me|your-/.test(values.BETTER_AUTH_SECRET);

if (missing.length > 0 || !exampleHasNoRealSecret || !productionSampleRejected) {
  console.error(JSON.stringify({missing, exampleHasNoRealSecret, productionSampleRejected}));
  process.exit(1);
}

console.log('Configuration contract passed: placeholders are redacted and demo drivers are rejected for production.');
