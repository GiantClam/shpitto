import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const sha256 = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
// Git checkouts may represent historical JSON as CRLF or LF; locks remain raw-byte exact.
const canonicalTextSha256 = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative), 'utf8').replaceAll('\r\n', '\n')).digest('hex');
const canonicalMap = (value) => JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
const failures = [];
const packageJson = readJson('package.json');
const selectedPackage = readJson('internal/spikes/selected-stack/package.json');
const provenance = readJson('internal/restart/provenance.json');
const baseline = readJson('tooling/root-dependency-baseline.json');

for (const [relative, expected, canonical] of [
  ['internal/spikes/selected-stack/package.json', baseline.historical.packageCanonicalSha256, true],
  ['internal/spikes/selected-stack/pnpm-lock.yaml', baseline.historical.lockfileSha256, false],
  ['internal/restart/provenance.json', baseline.historical.provenanceCanonicalSha256, true],
]) {
  if ((canonical ? canonicalTextSha256(relative) : sha256(relative)) !== expected) failures.push(`${relative} historical proof was changed`);
}
if (provenance.prototype.lockfileSha256 !== baseline.historical.lockfileSha256) failures.push('Historical provenance and prototype lock disagree');

const expectedDependencies = {...selectedPackage.dependencies};
for (const [name, change] of Object.entries(baseline.application.dependencyChanges)) {
  if ((selectedPackage.dependencies[name] ?? null) !== change.from) failures.push(`${name} evolution does not match its historical baseline`);
  if (change.to === null) delete expectedDependencies[name];
  else expectedDependencies[name] = change.to;
}

if (packageJson.packageManager !== selectedPackage.packageManager) {
  failures.push(`packageManager must remain ${selectedPackage.packageManager}`);
}
for (const section of ['dependencies', 'devDependencies']) {
  const expected = section === 'dependencies' ? expectedDependencies : selectedPackage[section];
  if (canonicalMap(expected) !== canonicalMap(packageJson[section])) failures.push(`${section} diverges from the reviewed application baseline`);
}
for (const section of ['optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies', 'overrides', 'resolutions', 'pnpm']) {
  if (Object.hasOwn(packageJson, section) !== Object.hasOwn(selectedPackage, section) || canonicalMap(packageJson[section]) !== canonicalMap(selectedPackage[section])) failures.push(`${section} diverges from the reviewed application baseline`);
}

const expectedLock = baseline.application.lockfileSha256;
if (sha256('pnpm-lock.yaml') !== expectedLock) {
  failures.push('pnpm-lock.yaml does not match the reviewed application digest');
}

const workspace = fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
if (!/packages:\s*\[\]/.test(workspace)) failures.push('pnpm-workspace.yaml must keep an empty legacy-free workspace');
if (canonicalTextSha256('pnpm-workspace.yaml') !== baseline.application.workspaceCanonicalSha256) {
  failures.push('pnpm-workspace.yaml does not match the reviewed dependency/build configuration');
}

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
  applicationDependencyEvolution: 'tooling/root-dependency-baseline.json',
  excludedRoots: tsconfig.exclude,
}, null, 2));
