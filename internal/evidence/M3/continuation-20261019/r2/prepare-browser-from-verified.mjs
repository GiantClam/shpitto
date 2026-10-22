import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = process.cwd();
const packet = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => writeFileSync(path.join(packet, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const freeze = read(path.join(root, 'internal/evidence/m7/local-current-20261019/continuation/baseline-r2/candidate.json'));
const attemptRoot = path.join(packet, 'automated/verification-attempts');
const attemptNames = readdirSync(attemptRoot);
assert.equal(attemptNames.length, 1);
const attempt = path.join(attemptRoot, attemptNames[0]);
const deadline = Date.now() + 900_000;
let build;
while (Date.now() < deadline) {
  build = read(path.join(attempt, 'commands.json')).find((row) => row.commandId === 'production-build');
  if (build) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.equal(build?.status, 'PASS', 'Fresh isolated M3 production build must pass first.');
const compiledRoot = process.argv[2];
assert.ok(compiledRoot && existsSync(path.join(compiledRoot, '.next/BUILD_ID')), 'Fresh compiled runtime is required.');
const captured = read(path.join(attempt, 'candidate-before/digest-footprints.json'));
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'shpitto-m3-browser-'));
const runtimeRoot = path.join(tempRoot, 'candidate');
mkdirSync(runtimeRoot);
const omittedNonExecutableBuildInputs = [];
for (const row of captured.sourceTree) {
  const compiledFile = path.join(compiledRoot, row.path);
  if (!existsSync(compiledFile)) {
    assert.equal(row.path, '.env.example', 'Only the sample env file may be omitted by the isolated M3 copy filter.');
    omittedNonExecutableBuildInputs.push(row.path);
  }
  const bytes = readFileSync(existsSync(compiledFile) ? compiledFile : path.join(root, row.path));
  assert.equal(sha(bytes), row.sha256, `Build source differs from the frozen candidate: ${row.path}`);
  const target = path.join(runtimeRoot, row.path);
  mkdirSync(path.dirname(target), {recursive: true});
  writeFileSync(target, bytes);
}
copyFileSync(path.join(compiledRoot, 'pnpm-lock.yaml'), path.join(runtimeRoot, 'pnpm-lock.yaml'));
assert.equal(sha(readFileSync(path.join(runtimeRoot, 'pnpm-lock.yaml'))), freeze.lockfileSha256);
cpSync(path.join(compiledRoot, 'public'), path.join(runtimeRoot, 'public'), {recursive: true});
cpSync(path.join(compiledRoot, '.next'), path.join(runtimeRoot, '.next'), {recursive: true,
  filter: (file) => !['cache', 'node_modules', 'standalone'].includes(path.relative(path.join(compiledRoot, '.next'), file).split(path.sep)[0])});
const dependencyAliases = [];
function copyAliases(source, target) {
  const info = lstatSync(source);
  if (info.isSymbolicLink()) {
    const resolved = realpathSync(source);
    const relative = path.relative(path.join(compiledRoot, 'node_modules'), resolved);
    assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    const dependency = path.join(root, 'node_modules', relative);
    assert.ok(existsSync(dependency));
    mkdirSync(path.dirname(target), {recursive: true});
    if (statSync(dependency).isDirectory()) symlinkSync(dependency, target, 'junction');
    else copyFileSync(dependency, target);
    dependencyAliases.push({path: path.relative(runtimeRoot, target).replaceAll('\\', '/'), dependency});
  } else if (info.isDirectory()) {
    mkdirSync(target, {recursive: true});
    for (const name of readdirSync(source)) copyAliases(path.join(source, name), path.join(target, name));
  } else copyFileSync(source, target);
}
if (existsSync(path.join(compiledRoot, '.next/node_modules'))) copyAliases(path.join(compiledRoot, '.next/node_modules'), path.join(runtimeRoot, '.next/node_modules'));
symlinkSync(path.join(root, 'node_modules'), path.join(runtimeRoot, 'node_modules'), 'junction');
const builtFiles = [];
function visit(directory) {
  for (const name of readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    if (file === path.join(runtimeRoot, '.next/node_modules')) continue;
    if (statSync(file).isDirectory()) visit(file);
    else {
      const bytes = readFileSync(file);
      builtFiles.push({path: path.relative(runtimeRoot, file).replaceAll('\\', '/'), bytes: bytes.length, sha256: sha(bytes)});
    }
  }
}
visit(path.join(runtimeRoot, '.next'));
const provenance = {createdAt: new Date().toISOString(), tempRoot, runtimeRoot,
  sourceTreeSha256: freeze.sourceTreeSha256, allSixCandidateDigests: freeze,
  compiledSourceRoot: compiledRoot, sourceFileCount: captured.sourceTree.length,
  omittedNonExecutableBuildInputs,
  sourceSnapshotVerifiedAgainstFreeze: true,
  buildCommand: build, buildLogSha256: sha(readFileSync(path.join(root, build.outputRef))),
  buildId: readFileSync(path.join(runtimeRoot, '.next/BUILD_ID'), 'utf8').trim(),
  compiledFiles: builtFiles, compiledTreeSha256: sha(builtFiles.map((row) => `${row.path}\0${row.bytes}\0${row.sha256}`).join('\n')),
  dependencySource: path.join(root, 'node_modules'), lockfileMatches: true,
  dependencyAliases, excludedUnusedBuildDirectories: ['.next/cache', '.next/standalone'],
  interpretation: 'Fresh full-source M3 build in a separate disposable browser runtime; no release artifact or production-profile acceptance is asserted.'};
write('browser-runtime-provenance.json', provenance);

const originalPath = path.join(root, '.data/m3-browser-acceptance.mjs');
const original = readFileSync(originalPath, 'utf8');
let harness = original
  .replace("import pg from '../node_modules/pg/lib/index.js';", "import pg from 'pg';")
  .replace(/import \{assertArchiveManifest, assertExtractedFiles\} from '\.\.\/scripts\/lib\/candidate-integrity.mjs';\r?\n/, '')
  .replace(/import \{createCustomerPackage\} from '\.\.\/scripts\/customer-package.ts';\r?\n/, '')
  .replace("const output = path.join(root, 'internal/evidence/M3', `browser-journeys-20261019-${runId}`);", "const output = path.join(root, 'internal/evidence/M3/continuation-20261019/r2', `browser-journeys-${runId}`);")
  .replace('const port = 3112;', 'const port = 3199;')
  .replace(/const sourceEnv = \{\};\r?\nfor \(const file of \['\.env', '\.env\.local'\]\) \{[\s\S]*?\r?\n\}\r?\nconst databaseName/, 'const sourceEnv = {};\nconst databaseName')
  .replace("const assetRoot = path.join(root, '.data', `browser-assets-${runId}`);", "const assetRoot = path.join(runtimeRoot, '.data', `browser-assets-${runId}`);")
  .replace(/  if \(runtimeRoot !== root\) \{[\s\S]*?\r?\n  \}\r?\n  await admin.connect\(\);/, `  const provenance = JSON.parse(readFileSync(path.join(root, 'internal/evidence/M3/continuation-20261019/r2/browser-runtime-provenance.json'), 'utf8'));
  assert.equal(runtimeRoot, provenance.runtimeRoot);
  assert.equal(provenance.sourceTreeSha256, '${freeze.sourceTreeSha256}');
  for (const file of provenance.compiledFiles) assert.equal(createHash('sha256').update(readFileSync(path.join(runtimeRoot, file.path))).digest('hex'), file.sha256);
  json('runtime-candidate-binding.json', {provenanceRef: 'internal/evidence/M3/continuation-20261019/r2/browser-runtime-provenance.json', sourceTreeSha256: provenance.sourceTreeSha256, compiledTreeSha256: provenance.compiledTreeSha256, compiledFilesVerified: true, runtimeRoot});
  await admin.connect();`)
  .replaceAll('.data/m3-browser-acceptance.mjs (disposable generated accounts; no retained credentials)', 'internal/evidence/M3/continuation-20261019/r2/browser-harness.mjs (disposable generated accounts; no retained credentials)');
assert.notEqual(harness, original);
assert.ok(!harness.includes('assertArchiveManifest('));
assert.ok(!harness.includes('sourceEnv[match'));
writeFileSync(path.join(packet, 'browser-harness.mjs'), harness, 'utf8');
write('browser-harness-adaptation.json', {createdAt: new Date().toISOString(), sourceRef: '.data/m3-browser-acceptance.mjs',
  sourceSha256: sha(original), retainedRunnerRef: 'internal/evidence/M3/continuation-20261019/r2/browser-harness.mjs',
  retainedRunnerSha256: sha(harness), changes: ['Port 3199 and owned packet output', 'No ambient env-file loading',
    'Assets confined to disposable runtime', 'Fresh M3 build binding replaces unrelated release-manifest binding', 'Updated retained credential provenance'],
  uiInteractionAssertionsPreserved: true, originalRunnerModified: false, shippedFilesModified: false});
const check = spawnSync(process.execPath, ['--check', path.join(packet, 'browser-harness.mjs')], {encoding: 'utf8', windowsHide: true});
assert.equal(check.status, 0, check.stderr);
console.log(JSON.stringify({status: 'READY', runtimeRoot, sourceTreeSha256: freeze.sourceTreeSha256,
  compiledFiles: builtFiles.length, compiledTreeSha256: provenance.compiledTreeSha256}));
