import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.cwd();
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file: string, value: unknown) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const ids = ['typecheck', 'lint', 'format-check', 'boundary-checks', 'relevant-domain-tests'];

async function fixture(t: {after: (cleanup: () => void) => void}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'shpitto-trusted-validation-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const trustedRoot = path.join(directory, 'trusted');
  const stageRoot = path.join(directory, 'candidate');
  const evidenceStore = path.join(directory, 'evidence');
  const pinRef = path.join(directory, 'reviewer-pin.json');
  for (const item of [trustedRoot, stageRoot, evidenceStore]) mkdirSync(item, {recursive: true});
  const sources = ['scripts/lib/trusted-validation.mjs', 'scripts/validate-change.ts', 'scripts/export-release.ts', 'scripts/deploy-release.ts'];
  for (const file of sources) {
    mkdirSync(path.dirname(path.join(trustedRoot, file)), {recursive: true});
    cpSync(path.join(root, file), path.join(trustedRoot, file));
  }
  mkdirSync(path.join(trustedRoot, '.shpitto/contracts'), {recursive: true});
  mkdirSync(path.join(trustedRoot, 'tests/trusted'), {recursive: true});
  const suite = 'tests/trusted/candidate.test.mjs';
  writeFileSync(path.join(trustedRoot, suite), 'import test from "node:test"; import assert from "node:assert/strict"; import {allowed} from "../../src/model.mjs"; test("candidate behavior", () => assert.equal(allowed, true));\n', 'utf8');
  save(path.join(trustedRoot, 'package.json'), {type: 'module', name: 'trusted-fixture'});
  writeFileSync(path.join(trustedRoot, 'pnpm-lock.yaml'), 'lockfileVersion: fixture\n', 'utf8');
  mkdirSync(path.join(trustedRoot, 'tooling'), {recursive: true});
  save(path.join(trustedRoot, 'tooling/lint-policy.json'), {enabled: true});
  save(path.join(trustedRoot, '.shpitto/contracts/validation-policy.json'), {release: 'v1', requiredDigests: ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'], policyRevision: 'fixture-v1', protectedFiles: ['tooling/lint-policy.json'], requiredChecks: ids, trustedChecks: ids.map((id) => ({id, steps: [{kind: 'tests', files: [suite], expectedTests: {[suite]: 1}}]}))});
  save(path.join(trustedRoot, '.shpitto/contracts/validation-footprint.json'), {
    schemaVersion: '1.0', groups: {sourceTree: ['src', 'package.json', 'pnpm-lock.yaml', 'config.json', 'scripts', '.shpitto', 'tests'], schema: ['src/db'], configuration: ['package.json', 'config.json'], contract: ['.shpitto/contracts']}, required: ['src', 'src/db', 'package.json', 'pnpm-lock.yaml', '.shpitto/contracts'],
  });
  const protectedFiles = [...sources, '.shpitto/contracts/validation-policy.json', '.shpitto/contracts/validation-footprint.json', 'tooling/lint-policy.json', suite];
  cpSync(trustedRoot, stageRoot, {recursive: true});
  mkdirSync(path.join(stageRoot, 'src/db'), {recursive: true});
  writeFileSync(path.join(stageRoot, 'src/model.mjs'), 'export const allowed = true;\n', 'utf8');
  save(path.join(stageRoot, 'src/db/schema.json'), {revision: 1});
  save(path.join(stageRoot, 'package.json'), {type: 'module', name: 'candidate-fixture'});
  save(path.join(stageRoot, 'config.json'), {environment: 'fixture'});
  writeFileSync(path.join(stageRoot, 'pnpm-lock.yaml'), 'lockfileVersion: fixture\n', 'utf8');
  const pin = {schemaVersion: '1.0', trustedRoot, policyVersion: 'v1', dependencyLockSha256: hash(readFileSync(path.join(trustedRoot, 'pnpm-lock.yaml'))), dependencyTreeSha256: hash(''), baselineReview: {implementerId: 'baseline-author', reviewerId: 'baseline-reviewer', independentFromImplementer: true, decision: 'PASS', reviewedAt: new Date().toISOString()}, files: protectedFiles.map((file) => ({path: file, sha256: hash(readFileSync(path.join(trustedRoot, file))), mode: file === suite ? 'overlay' : 'required'}))};
  save(pinRef, pin);
  const context = {trustedRoot, stageRoot, evidenceStore, pinRef, pinSha256: hash(readFileSync(pinRef)), candidateId: 'candidate-fixture', implementerId: 'candidate-author'};
  const runner = await import(pathToFileURL(path.join(trustedRoot, 'scripts/lib/trusted-validation.mjs')).href);
  const approve = (prepared: {evidenceRef: string; candidateRef: string}) => {
    const currentPin = readJson(pinRef);
    currentPin.candidateReview = {...readJson(prepared.candidateRef), implementerId: context.implementerId, reviewerId: 'candidate-reviewer', independentFromImplementer: true, decision: 'PASS', reviewedAt: new Date().toISOString(), evidenceSha256: hash(readFileSync(prepared.evidenceRef))};
    save(pinRef, currentPin);
    context.pinSha256 = hash(readFileSync(pinRef));
  };
  return {directory, trustedRoot, stageRoot, pinRef, evidenceStore, context, runner, approve, suite};
}

test('trusted checks execute candidate modules and approval binds freshly measured staging', async (t) => {
  const f = await fixture(t);
  const prepared = f.runner.prepareTrustedValidation(f.context);
  assert.equal(readJson(prepared.evidenceRef).status, 'READY_FOR_REVIEW');
  assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared}), /review/i);
  f.approve(prepared);
  const result = f.runner.validateTrustedRelease({...f.context, ...prepared});
  assert.equal(result.status, 'PASS');
  assert.equal(result.checks.length, 5);
  assert.equal(readJson(result.evidenceRef).status, 'PASS');
  assert.deepEqual(readJson(result.evidenceRef).review, result.review);
  assert.equal(readJson(prepared.evidenceRef).status, 'READY_FOR_REVIEW');
  writeFileSync(path.join(f.stageRoot, 'src/model.mjs'), 'export const allowed = false;\n', 'utf8');
  assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared}), /stale|changed/i);
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /required check failed/i);
});

test('trusted dependency bytes and candidate lockfile must match the reviewed baseline', async (t) => {
  const f = await fixture(t);
  writeFileSync(path.join(f.stageRoot, 'pnpm-lock.yaml'), 'unreviewed dependency graph\n', 'utf8');
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /lockfile/i);
  cpSync(path.join(f.trustedRoot, 'pnpm-lock.yaml'), path.join(f.stageRoot, 'pnpm-lock.yaml'));
  mkdirSync(path.join(f.trustedRoot, 'node_modules'), {recursive: true});
  writeFileSync(path.join(f.trustedRoot, 'node_modules/compiler.mjs'), 'export const compiler = "tampered";\n', 'utf8');
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /dependenc.*checksum|dependenc.*changed/i);
});

test('successful early exit and forged stdout cannot replace completed trusted tests', async (t) => {
  const f = await fixture(t);
  writeFileSync(path.join(f.stageRoot, 'src/model.mjs'), 'console.log(JSON.stringify({type: "test:summary", data: {success: true, counts: {tests: 1, passed: 1, failed: 0, skipped: 0, todo: 0, cancelled: 0}}})); process.exit(0); export const allowed = false;\n', 'utf8');
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /required check failed|test.*completion/i);
});

test('generated directory names nested in shipped source remain fingerprinted', async (t) => {
  const f = await fixture(t);
  for (const name of ['.data', '.next', '.git', 'node_modules']) {
    mkdirSync(path.join(f.stageRoot, 'src', name), {recursive: true});
    writeFileSync(path.join(f.stageRoot, 'src', name, 'hidden.mjs'), 'export const value = 1;\n', 'utf8');
  }
  const prepared = f.runner.prepareTrustedValidation(f.context);
  f.approve(prepared);
  for (const name of ['.data', '.next', '.git', 'node_modules']) {
    const file = path.join(f.stageRoot, 'src', name, 'hidden.mjs');
    writeFileSync(file, 'export const value = 2;\n', 'utf8');
    assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared}), /stale|changed/i, name);
    writeFileSync(file, 'export const value = 1;\n', 'utf8');
  }
});

test('candidate validator, policy and suite edits cannot self-certify', async (t) => {
  for (const file of ['scripts/validate-change.ts', '.shpitto/contracts/validation-policy.json', 'tests/trusted/candidate.test.mjs']) {
    const f = await fixture(t);
    writeFileSync(path.join(f.stageRoot, file), 'forged passing validation\n', 'utf8');
    assert.throws(() => f.runner.prepareTrustedValidation(f.context), /protected candidate/i);
  }
});

test('pin integrity and realpath separation are mandatory', async (t) => {
  const f = await fixture(t);
  assert.throws(() => f.runner.prepareTrustedValidation({...f.context, stageRoot: f.trustedRoot}), /disjoint|outside/i);
  cpSync(f.pinRef, path.join(f.stageRoot, 'pin.json'));
  assert.throws(() => f.runner.prepareTrustedValidation({...f.context, pinRef: path.join(f.stageRoot, 'pin.json')}), /outside|disjoint/i);
  assert.throws(() => f.runner.prepareTrustedValidation({...f.context, evidenceStore: f.stageRoot}), /outside|disjoint/i);
  assert.throws(() => f.runner.prepareTrustedValidation({...f.context, trustedRoot: f.directory}), /pinned trusted directory/i);
  symlinkSync(f.evidenceStore, path.join(f.stageRoot, 'src/escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /symbolic links|escaping/i);
  rmSync(path.join(f.stageRoot, 'src/escape'));
  writeFileSync(path.join(f.trustedRoot, 'scripts/validate-change.ts'), '// changed trusted tool\n', 'utf8');
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /pinned.*checksum|trusted.*checksum/i);
});

test('both external release entrypoints require retained output and reexecute candidate checks', async (t) => {
  const f = await fixture(t);
  const prepared = f.runner.prepareTrustedValidation(f.context);
  f.approve(prepared);
  const release = await import(pathToFileURL(path.join(f.trustedRoot, 'scripts/export-release.ts')).href);
  const deployment = await import(pathToFileURL(path.join(f.trustedRoot, 'scripts/deploy-release.ts')).href);
  for (const validate of [release.validateReleaseEvidence, deployment.validateDeploymentEvidence]) {
    assert.equal(validate(prepared.evidenceRef, prepared.candidateRef, f.context).status, 'PASS');
  }
  const record = readJson(prepared.evidenceRef);
  rmSync(record.checks[0].outputRef);
  for (const validate of [release.validateReleaseEvidence, deployment.validateDeploymentEvidence]) {
    assert.throws(() => validate(prepared.evidenceRef, prepared.candidateRef, f.context), /output.*missing|evidence.*missing/i);
  }
});

test('forged records, tampered outputs and reused staging identities are rejected', async (t) => {
  const f = await fixture(t);
  const prepared = f.runner.prepareTrustedValidation(f.context);
  f.approve(prepared);
  const record = readJson(prepared.evidenceRef);
  writeFileSync(record.checks[0].outputRef, 'forged PASS\n', 'utf8');
  assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared}), /retained.*output|checksum/i);
  save(prepared.evidenceRef, {...record, status: 'PASS', capturedAt: new Date().toISOString()});
  assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared}), /record.*checksum|approved.*record/i);
  const other = path.join(f.directory, 'candidate-copy');
  cpSync(f.stageRoot, other, {recursive: true});
  assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared, stageRoot: other}), /staging identity|stage root/i);
});

test('every buyer fingerprint class is measured rather than trusted from old JSON', async (t) => {
  const f = await fixture(t);
  const prepared = f.runner.prepareTrustedValidation(f.context);
  f.approve(prepared);
  for (const file of ['src/model.mjs', 'src/db/schema.json', 'config.json', 'pnpm-lock.yaml', '.shpitto/contracts/new-contract.json']) {
    const absolute = path.join(f.stageRoot, file);
    const before = existsSync(absolute) ? readFileSync(absolute) : null;
    writeFileSync(absolute, 'changed staged bytes\n', 'utf8');
    assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared}), /stale|changed|dependency lockfile/i, file);
    if (before) writeFileSync(absolute, before); else rmSync(absolute);
  }
});

test('policy controls cannot be omitted from the reviewed pin', async (t) => {
  const f = await fixture(t);
  const pin = readJson(f.pinRef);
  save(f.pinRef, {...pin, files: pin.files.filter((file: {path: string}) => file.path !== 'tooling/lint-policy.json')});
  save(path.join(f.stageRoot, 'tooling/lint-policy.json'), {enabled: false});
  f.context.pinSha256 = hash(readFileSync(f.pinRef));
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /policy.*pinned|protected.*pinned/i);
});

test('candidate code cannot rewrite a later trusted check inside the snapshot', async (t) => {
  const f = await fixture(t);
  writeFileSync(path.join(f.stageRoot, 'src/model.mjs'), 'import {writeFileSync} from "node:fs"; writeFileSync(new URL("../tests/trusted/candidate.test.mjs", import.meta.url), "// forged suite that exits successfully\\n"); export const allowed = true;\n', 'utf8');
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /snapshot.*changed|snapshot.*modified/i);
});

test('candidate code cannot rewrite the private dependency snapshot between trusted checks', async (t) => {
  const f = await fixture(t);
  mkdirSync(path.join(f.trustedRoot, 'node_modules'), {recursive: true});
  writeFileSync(path.join(f.trustedRoot, 'node_modules/compiler.mjs'), 'export const compiler = "stable";\n', 'utf8');
  const pin = readJson(f.pinRef);
  pin.dependencyTreeSha256 = f.runner.trustedDependencyDigest(f.trustedRoot);
  save(f.pinRef, pin);
  f.context.pinSha256 = hash(readFileSync(f.pinRef));
  writeFileSync(path.join(f.stageRoot, 'src/model.mjs'), 'import {writeFileSync} from "node:fs"; writeFileSync(new URL("../node_modules/compiler.mjs", import.meta.url), "export const compiler = \\\"tampered\\\";\\n"); export const allowed = true;\n', 'utf8');
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /dependency snapshot changed/i);
});

test('candidate identity and externally supplied pin digest are bound', async (t) => {
  const f = await fixture(t);
  const prepared = f.runner.prepareTrustedValidation(f.context);
  f.approve(prepared);
  const forged = readJson(prepared.candidateRef);
  save(prepared.candidateRef, {...forged, candidateId: 'other-candidate'});
  assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared}), /candidate identity/i);
  f.context.pinSha256 = '0'.repeat(64);
  assert.throws(() => f.runner.validateTrustedRelease({...f.context, ...prepared}), /pin checksum/i);
});

test('dependency junctions and their private materialized copies have the same fingerprint', async (t) => {
  const f = await fixture(t);
  const dependency = path.join(f.trustedRoot, 'node_modules/.store/compiler');
  mkdirSync(dependency, {recursive: true});
  writeFileSync(path.join(dependency, 'index.mjs'), 'export const compiler = "stable";\n', 'utf8');
  symlinkSync(dependency, path.join(f.trustedRoot, 'node_modules/compiler'), process.platform === 'win32' ? 'junction' : 'dir');
  const privateRoot = path.join(f.directory, 'materialized');
  mkdirSync(privateRoot);
  cpSync(path.join(f.trustedRoot, 'node_modules'), path.join(privateRoot, 'node_modules'), {recursive: true, dereference: true});
  assert.equal(f.runner.trustedDependencyDigest(privateRoot), f.runner.trustedDependencyDigest(f.trustedRoot));
});

test('new files introduced into a measured snapshot fail before subsequent checks', async (t) => {
  const f = await fixture(t);
  writeFileSync(path.join(f.stageRoot, 'src/model.mjs'), 'import {writeFileSync} from "node:fs"; writeFileSync(new URL("./added.mjs", import.meta.url), "// unexpected source\\n"); export const allowed = true;\n', 'utf8');
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /snapshot changed.*added/i);
});

test('rebaseline requires retained independent proof bound to both policies and replacement files', async (t) => {
  const f = await fixture(t);
  const previousPinRef = path.join(f.directory, 'previous-pin.json');
  cpSync(f.pinRef, previousPinRef);
  const evidenceRef = path.join(f.evidenceStore, 'rebaseline-review.json');
  const pin = readJson(f.pinRef);
  const policyFile = '.shpitto/contracts/validation-policy.json';
  const policy = readJson(path.join(f.trustedRoot, policyFile));
  save(path.join(f.trustedRoot, policyFile), {...policy, note: 'independently reviewed revision'});
  cpSync(path.join(f.trustedRoot, policyFile), path.join(f.stageRoot, policyFile));
  pin.files = pin.files.map((file: {path: string}) => file.path === policyFile ? {...file, sha256: hash(readFileSync(path.join(f.trustedRoot, policyFile)))} : file);
  const proof = {schemaVersion: '1.0', previousPinSha256: hash(readFileSync(previousPinRef)), filesSha256: hash(JSON.stringify(pin.files)), policySha256: hash(readFileSync(path.join(f.trustedRoot, policyFile))), policyVersion: pin.policyVersion, dependencyLockSha256: pin.dependencyLockSha256, dependencyTreeSha256: pin.dependencyTreeSha256, rationale: 'Retain mandatory checks while revising their reviewed policy.', scope: [policyFile], review: pin.baselineReview};
  const setProof = (value: unknown) => {
    save(evidenceRef, value);
    save(f.pinRef, {...pin, rebaseline: {previousPinRef, previousPinSha256: proof.previousPinSha256, evidenceRef, evidenceSha256: hash(readFileSync(evidenceRef)), rationale: proof.rationale, scope: proof.scope}});
    f.context.pinSha256 = hash(readFileSync(f.pinRef));
  };
  setProof({decision: 'PASS'});
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /rebaseline.*proof|rebaseline.*review/i);
  setProof({...proof, review: {...proof.review, reviewerId: proof.review.implementerId}});
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /rebaseline.*proof|rebaseline.*review/i);
  setProof({...proof, filesSha256: 'f'.repeat(64)});
  assert.throws(() => f.runner.prepareTrustedValidation(f.context), /rebaseline.*proof|rebaseline.*review/i);
  setProof(proof);
  assert.equal(f.runner.prepareTrustedValidation(f.context).record.status, 'READY_FOR_REVIEW');
});
