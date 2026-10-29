import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const compose = read('deploy/compose.local.yml');
const worker = read('deploy/worker.Dockerfile');
const health = read('scripts/worker-health.mjs');
const runtime = read('scripts/local-worker-runtime.mjs');
const failures = [];

for (const service of ['postgres:', 'mailpit:', 'worker:']) {
  if (!compose.includes(`  ${service}`)) failures.push(`compose.local.yml is missing ${service.slice(0, -1)} service`);
}
for (const volume of ['shpitto-postgres:', 'shpitto-mail:']) {
  if (!compose.includes(`  ${volume}`)) failures.push(`compose.local.yml is missing ${volume.slice(0, -1)} volume`);
}
if (!compose.includes('../.data/assets:/var/lib/shpitto/assets')) failures.push('local worker must share assets with the host web application');
for (const required of ['pg_isready', 'healthcheck:', 'depends_on:', 'GENERATION_DRIVER: mock', 'STORAGE_DRIVER: local', 'LOCAL_POSTGRES_PORT']) {
  if (!compose.includes(required)) failures.push(`compose.local.yml is missing ${required}`);
}
for (const required of [
  'ffmpeg',
  'HEALTHCHECK',
  'pnpm install --frozen-lockfile --prod --ignore-scripts',
  'scripts/local-worker.ts',
  'scripts/migrate.ts',
  'scripts/local-worker-runtime.mjs',
  'tests/fixtures/video/local-demo.mp4',
]) {
  if (!worker.includes(required)) failures.push(`worker.Dockerfile is missing ${required}`);
}
if (!runtime.includes("'--experimental-strip-types', 'scripts/migrate.ts'") || !runtime.includes("'--experimental-strip-types', 'scripts/local-worker.ts'") || !runtime.includes("'scripts/worker-health.mjs'")) {
  failures.push('worker runtime must migrate then start both the local Mock worker and health endpoint');
}
if (!health.includes('/healthz') || !health.includes('ffmpeg')) failures.push('worker health contract must report FFmpeg readiness');
if (/(REPLICATE|FAL_KEY|STRIPE_|RESEND_)/i.test(compose)) failures.push('local compose must not contain cloud credential names');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Local service contract passed.');
