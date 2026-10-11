import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const sha256 = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
const failures = [];
const packageJson = readJson('package.json');
const selectedPackage = readJson('internal/spikes/selected-stack/package.json');
const provenance = readJson('internal/restart/provenance.json');

if (packageJson.packageManager !== selectedPackage.packageManager) {
  failures.push(`packageManager must remain ${selectedPackage.packageManager}`);
}
for (const section of ['dependencies', 'devDependencies']) {
  const expected = JSON.stringify(selectedPackage[section] ?? {});
  const actual = JSON.stringify(packageJson[section] ?? {});
  if (expected !== actual) failures.push(`${section} diverges from the accepted selected-stack baseline`);
}

const expectedLock = provenance.prototype.lockfileSha256;
if (sha256('pnpm-lock.yaml') !== expectedLock) {
  failures.push('pnpm-lock.yaml does not match the accepted prototype digest');
}

const workspace = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
if (!/packages:\s*\[\]/.test(workspace)) failures.push('pnpm-workspace.yaml must keep an empty legacy-free workspace');

const tsconfig = readJson('tsconfig.json');
for (const excluded of ['legacy', 'apps', 'builder', 'packages', 'sites', 'internal']) {
  if (!tsconfig.exclude.includes(excluded)) failures.push(`tsconfig.json must exclude ${excluded}`);
}

const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
for (const excluded of ['legacy', 'apps', 'builder', 'packages', 'sites', 'internal']) {
  if (!dockerignore.split(/\r?\n/).includes(excluded)) failures.push(`.dockerignore must exclude ${excluded}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  packageManager: packageJson.packageManager,
  lockfileSha256: sha256('pnpm-lock.yaml'),
  selectedDependencyBaseline: 'internal/spikes/selected-stack/package.json',
  excludedRoots: tsconfig.exclude,
}, null, 2));
