import {createHash, randomUUID} from 'node:crypto';
import {cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {validateEvidence} from '../validate-change.ts';

const digestKeys = ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256'];
const mandatoryTools = ['scripts/lib/trusted-validation.mjs', 'scripts/validate-change.ts', 'scripts/export-release.ts', 'scripts/deploy-release.ts', '.shpitto/contracts/validation-policy.json', '.shpitto/contracts/validation-footprint.json'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const identity = (value) => typeof value === 'string' && value.length > 0 && value === value.trim();
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const fail = (message) => { throw new Error(`Trusted validation blocked: ${message}`); };
const inside = (root, file) => { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); };
const disjoint = (first, second) => !inside(first, second) && !inside(second, first);

function relativePath(value) {
  if (!identity(value) || value.includes('\\') || path.posix.isAbsolute(value) || value.includes(':') || value === '.' || path.posix.normalize(value) !== value || value.split('/').some((part) => !part || part === '..')) fail(`invalid relative tool/footprint path: ${String(value)}`);
  return value;
}

function confinedFile(root, relative) {
  const file = path.join(root, relativePath(relative));
  if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !inside(root, realpathSync(file)) || !lstatSync(file).isFile()) fail(`missing or escaping trusted file: ${relative}`);
  return file;
}

function reviewIsIndependent(review) {
  return review && identity(review.implementerId) && identity(review.reviewerId) && review.implementerId !== review.reviewerId && review.independentFromImplementer === true && review.decision === 'PASS' && identity(review.reviewedAt) && Number.isFinite(Date.parse(review.reviewedAt));
}

export function trustedDependencyDigest(trustedRoot) {
  const dependencyRoot = path.join(realpathSync(trustedRoot), 'node_modules');
  if (!existsSync(dependencyRoot)) return hash('');
  if (lstatSync(dependencyRoot).isSymbolicLink()) fail('trusted dependency directory must be a real directory');
  const files = [];
  const activeDirectories = new Set();
  const walk = (relative) => {
    const absolute = path.join(dependencyRoot, relative);
    const resolved = realpathSync(absolute);
    if (!inside(dependencyRoot, resolved)) fail(`trusted dependency link escapes its tree: ${relative}`);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      if (activeDirectories.has(resolved)) fail(`trusted dependency link cycle: ${relative}`);
      activeDirectories.add(resolved);
      for (const name of readdirSync(absolute).sort()) walk(relative ? `${relative}/${name}` : name);
      activeDirectories.delete(resolved);
    } else if (stat.isFile()) files.push(`${relative}\0file\0${hash(readFileSync(absolute))}`);
    else fail(`unsupported trusted dependency entry: ${relative}`);
  };
  walk('');
  return hash(files.sort().join('\n'));
}

function verifyDependencies(stageRoot, trustedRoot, pin) {
  if (!sha(pin.dependencyLockSha256) || hash(readFileSync(confinedFile(trustedRoot, 'pnpm-lock.yaml'))) !== pin.dependencyLockSha256 || hash(readFileSync(confinedFile(stageRoot, 'pnpm-lock.yaml'))) !== pin.dependencyLockSha256) fail('trusted and candidate lockfiles require the reviewed dependency lockfile checksum');
  if (!sha(pin.dependencyTreeSha256) || trustedDependencyDigest(trustedRoot) !== pin.dependencyTreeSha256) fail('trusted dependency tree checksum changed');
}

function loadContext(options) {
  for (const key of ['stageRoot', 'trustedRoot', 'pinRef', 'pinSha256', 'evidenceStore', 'candidateId', 'implementerId']) if (!identity(options?.[key])) fail(`explicit trusted context needs ${key}`);
  const stageRoot = realpathSync(options.stageRoot);
  const trustedRoot = realpathSync(options.trustedRoot);
  const evidenceStore = realpathSync(options.evidenceStore);
  if (lstatSync(options.pinRef).isSymbolicLink()) fail('reviewer pin must be a regular external file');
  const pinRef = realpathSync(options.pinRef);
  const runtimeRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
  if (!sha(options.pinSha256) || hash(readFileSync(pinRef)) !== options.pinSha256) fail('reviewer pin checksum does not match the externally supplied digest');
  if (runtimeRoot !== trustedRoot) fail('runner must execute from the explicitly pinned trusted directory');
  if (!disjoint(stageRoot, trustedRoot) || !disjoint(stageRoot, evidenceStore) || !disjoint(trustedRoot, evidenceStore) || inside(stageRoot, pinRef) || inside(trustedRoot, pinRef) || inside(evidenceStore, pinRef)) fail('trusted tools, pin and evidence store must be outside and pairwise disjoint from staging');
  const pin = json(pinRef);
  if (pin.schemaVersion !== '1.0' || realpathSync(pin.trustedRoot) !== trustedRoot || !identity(pin.policyVersion) || !reviewIsIndependent(pin.baselineReview)) fail('reviewer-controlled pin needs an explicit independent baseline review');
  verifyDependencies(stageRoot, trustedRoot, pin);
  if (!Array.isArray(pin.files) || !pin.files.length) fail('pin must enumerate trusted tool and suite checksums');
  const pinned = new Map();
  for (const entry of pin.files) {
    const relative = relativePath(entry.path);
    if (pinned.has(relative) || !sha(entry.sha256) || !['required', 'overlay', 'tool'].includes(entry.mode)) fail(`invalid pinned file: ${relative}`);
    if (!/^(scripts\/|tests\/|\.shpitto\/contracts\/|tooling\/|node_modules\/)/.test(relative) || (entry.mode === 'tool') !== relative.startsWith('node_modules/')) fail(`pinned tools cannot replace candidate modules: ${relative}`);
    const absolute = confinedFile(trustedRoot, relative);
    if (hash(readFileSync(absolute)) !== entry.sha256) fail(`pinned trusted checksum changed: ${relative}`);
    const candidate = path.join(stageRoot, relative);
    if (entry.mode !== 'tool' && (existsSync(candidate) || entry.mode === 'required')) {
      if (!existsSync(candidate) || lstatSync(candidate).isSymbolicLink() || !inside(stageRoot, realpathSync(candidate)) || hash(readFileSync(candidate)) !== entry.sha256) fail(`protected candidate validator, policy or suite changed: ${relative}`);
    }
    pinned.set(relative, {...entry, absolute});
  }
  for (const file of mandatoryTools) if (!pinned.has(file) || pinned.get(file).mode !== 'required') fail(`mandatory validator is not pinned: ${file}`);
  if (pin.rebaseline) {
    if (lstatSync(pin.rebaseline.previousPinRef).isSymbolicLink()) fail('previous reviewer pin must be a regular external file');
    const previous = realpathSync(pin.rebaseline.previousPinRef);
    const proof = realpathSync(pin.rebaseline.evidenceRef);
    if (!disjoint(previous, stageRoot) || !disjoint(previous, trustedRoot) || !disjoint(previous, evidenceStore) || inside(stageRoot, proof) || !inside(evidenceStore, proof) || previous === pinRef || !sha(pin.rebaseline.previousPinSha256) || hash(readFileSync(previous)) !== pin.rebaseline.previousPinSha256 || !sha(pin.rebaseline.evidenceSha256) || hash(readFileSync(proof)) !== pin.rebaseline.evidenceSha256 || !identity(pin.rebaseline.rationale) || !Array.isArray(pin.rebaseline.scope) || !pin.rebaseline.scope.length || !pin.rebaseline.scope.every(identity) || !reviewIsIndependent(json(previous).baselineReview)) fail('rebaseline requires previous pin, retained independent review, rationale and scope');
    const retainedProof = json(proof);
    if (retainedProof.schemaVersion !== '1.0' || !reviewIsIndependent(retainedProof.review) || retainedProof.review.reviewerId !== pin.baselineReview.reviewerId || retainedProof.review.implementerId !== pin.baselineReview.implementerId || retainedProof.previousPinSha256 !== pin.rebaseline.previousPinSha256 || retainedProof.filesSha256 !== hash(JSON.stringify(pin.files)) || retainedProof.policySha256 !== pinned.get('.shpitto/contracts/validation-policy.json').sha256 || retainedProof.policyVersion !== pin.policyVersion || retainedProof.dependencyLockSha256 !== pin.dependencyLockSha256 || retainedProof.dependencyTreeSha256 !== pin.dependencyTreeSha256 || retainedProof.rationale !== pin.rebaseline.rationale || JSON.stringify(retainedProof.scope) !== JSON.stringify(pin.rebaseline.scope)) fail('rebaseline proof must bind an independent reviewer, previous pin, replacement files, policy, dependencies, rationale and scope');
  }
  const policy = json(pinned.get('.shpitto/contracts/validation-policy.json').absolute);
  const footprint = json(pinned.get('.shpitto/contracts/validation-footprint.json').absolute);
  if (!Array.isArray(policy.requiredDigests) || JSON.stringify(policy.requiredDigests) !== JSON.stringify(digestKeys)) fail('pinned policy required digests must match the trusted validator contract');
  if (!identity(policy.policyRevision)) fail('pinned policy revision must be explicit');
  if (!Array.isArray(policy.protectedFiles) || !policy.protectedFiles.every(identity)) fail('policy protected files must be explicitly pinned');
  for (const file of policy.protectedFiles) if (pinned.get(relativePath(file))?.mode !== 'required') fail(`policy protected file must be required and pinned: ${file}`);
  if (!Array.isArray(policy.requiredChecks) || !policy.requiredChecks.length || !policy.requiredChecks.every(identity) || new Set(policy.requiredChecks).size !== policy.requiredChecks.length || !Array.isArray(policy.trustedChecks) || policy.trustedChecks.length !== policy.requiredChecks.length || new Set(policy.trustedChecks.map((check) => check.id)).size !== policy.requiredChecks.length || policy.trustedChecks.some((check) => !policy.requiredChecks.includes(check.id) || !Array.isArray(check.steps) || !check.steps.length)) fail('pinned policy must define every required check exactly once');
  const baselineSha256 = hash(JSON.stringify({schemaVersion: pin.schemaVersion, trustedRoot, policyVersion: pin.policyVersion, dependencyLockSha256: pin.dependencyLockSha256, dependencyTreeSha256: pin.dependencyTreeSha256, baselineReview: pin.baselineReview, files: pin.files, rebaseline: pin.rebaseline ?? null}));
  return {...options, stageRoot, trustedRoot, evidenceStore, pinRef, pin, pinned, policy, footprint, baselineSha256};
}

function listFiles(root, include) {
  const files = new Set();
  const walk = (relative) => {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`symbolic links cannot enter staged fingerprints: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(absolute).sort()) {
        walk(`${relative}/${name}`);
      }
    } else if (stat.isFile()) files.add(relative);
    else fail(`unsupported staged file: ${relative}`);
  };
  if (!Array.isArray(include) || !include.length) fail('trusted footprint groups must be nonempty');
  for (const relative of include) walk(relativePath(relative));
  return [...files].sort().map((relative) => { const bytes = readFileSync(path.join(root, relative)); return {path: relative, bytes: bytes.length, sha256: hash(bytes)}; });
}

function measure(context) {
  const {stageRoot, footprint, pinned} = context;
  if (footprint.schemaVersion !== '1.0' || !Array.isArray(footprint.required)) fail('unsupported trusted buyer footprint');
  for (const required of footprint.required) if (!existsSync(path.join(stageRoot, relativePath(required)))) fail(`required buyer staging path is missing: ${required}`);
  const groups = {};
  for (const key of ['sourceTree', 'schema', 'configuration', 'contract']) groups[key] = listFiles(stageRoot, footprint.groups?.[key]);
  const aggregate = (files) => hash(files.map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join('\n'));
  const tools = [...pinned.values()].map((entry) => ({path: entry.path, bytes: readFileSync(entry.absolute).length, sha256: hash(readFileSync(entry.absolute))})).sort((a, b) => a.path.localeCompare(b.path));
  tools.push({path: 'node_modules', bytes: 0, sha256: context.pin.dependencyTreeSha256});
  return {candidate: {candidateId: context.candidateId, stageRoot, sourceTreeSha256: aggregate(groups.sourceTree), schemaSha256: aggregate(groups.schema), configurationSha256: aggregate(groups.configuration), contractSha256: aggregate(groups.contract), validatorSha256: aggregate(tools), lockfileSha256: hash(readFileSync(confinedFile(stageRoot, 'pnpm-lock.yaml')))}, files: groups.sourceTree};
}

function sameDigests(first, second) {
  return digestKeys.every((key) => first[key] === second[key]);
}

function snapshot(context, measured, directory) {
  mkdirSync(directory, {recursive: true});
  for (const file of measured.files) {
    const bytes = readFileSync(path.join(context.stageRoot, file.path));
    if (hash(bytes) !== file.sha256) fail('staging changed while creating validation snapshot');
    const target = path.join(directory, file.path);
    mkdirSync(path.dirname(target), {recursive: true});
    writeFileSync(target, bytes);
  }
  for (const entry of context.pinned.values()) {
    if (entry.mode === 'tool') continue;
    const target = path.join(directory, entry.path);
    mkdirSync(path.dirname(target), {recursive: true});
    cpSync(entry.absolute, target);
  }
  if (existsSync(path.join(context.trustedRoot, 'node_modules'))) cpSync(path.join(context.trustedRoot, 'node_modules'), path.join(directory, 'node_modules'), {recursive: true, dereference: true});
}

function assertSnapshotIntact(context, directory, baseline) {
  for (const entry of baseline) {
    const file = path.join(directory, entry.path);
    if (!existsSync(file) || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || hash(readFileSync(file)) !== entry.sha256) {
      fail(`validation snapshot changed during checks: ${entry.path}`);
    }
  }
  const paths = new Set(baseline.map((entry) => entry.path));
  for (const entry of listFiles(directory, context.footprint.groups.sourceTree)) if (!paths.has(entry.path)) fail(`validation snapshot changed during checks: added ${entry.path}`);
  if (trustedDependencyDigest(directory) !== context.pin.dependencyTreeSha256) fail('validation dependency snapshot changed during checks');
}

function checkArguments(context, step, directory) {
  const pinned = (file) => { const entry = context.pinned.get(relativePath(file)); if (!entry) fail(`un-pinned check program or suite: ${file}`); return entry; };
  if (step.kind === 'tests') {
    if (!Array.isArray(step.files) || !step.files.length || new Set(step.files).size !== step.files.length || !step.expectedTests || Object.keys(step.expectedTests).length !== step.files.length || step.files.some((file) => !Number.isSafeInteger(step.expectedTests[file]) || step.expectedTests[file] < 1)) fail('trusted tests need explicit pinned suite files and reviewed completion counts');
    return ['--experimental-strip-types', '--test', '--test-reporter', import.meta.url, ...step.files.map((file) => { if (pinned(file).mode === 'tool') fail('tests must execute in the candidate snapshot'); return path.join(directory, file); })];
  }
  if (!['node', 'tool'].includes(step.kind) || (step.args !== undefined && (!Array.isArray(step.args) || !step.args.every((arg) => typeof arg === 'string')))) fail('invalid trusted check step');
  const entry = pinned(step.file);
  if ((step.kind === 'tool') !== (entry.mode === 'tool')) fail('trusted dependency tools and candidate-targeted scripts must be declared separately');
  return ['--experimental-strip-types', step.kind === 'tool' ? entry.absolute : path.join(directory, entry.path), ...(step.args ?? [])];
}

// Node runs this reporter in its parent runner. Candidate stdout is retained as
// a test:stdout event, so printing a forged summary cannot satisfy completion.
export default async function* trustedTestReporter(events) {
  for await (const event of events) {
    if (['test:pass', 'test:fail', 'test:stdout', 'test:stderr', 'test:summary'].includes(event.type)) yield `${JSON.stringify(event)}\n`;
  }
}

function testsCompleted(step, stdout, directory) {
  const summaries = stdout.trim().split(/\r?\n/).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter((event) => event?.type === 'test:summary').map((event) => event.data);
  const passed = (summary, expected) => summary?.success === true && summary.counts?.tests === expected && summary.counts.passed === expected && ['failed', 'cancelled', 'skipped', 'todo'].every((key) => summary.counts[key] === 0);
  for (const file of step.files) {
    const matches = summaries.filter((summary) => summary.file && path.resolve(summary.file) === path.join(directory, file));
    if (matches.length !== 1 || !passed(matches[0], step.expectedTests[file])) return false;
  }
  const overall = summaries.filter((summary) => !summary.file);
  return summaries.length === step.files.length + 1 && overall.length === 1 && passed(overall[0], step.files.reduce((count, file) => count + step.expectedTests[file], 0));
}

function execute(context) {
  const measured = measure(context);
  const runRoot = path.join(context.evidenceStore, randomUUID());
  const directory = path.join(runRoot, 'snapshot');
  mkdirSync(runRoot);
  const candidateRef = path.join(runRoot, 'candidate.json');
  const evidenceRef = path.join(runRoot, 'record.json');
  const checks = [];
  try {
    snapshot(context, measured, directory);
    const snapshotBaseline = [...measured.files, ...[...context.pinned.values()]
      .filter((entry) => entry.mode !== 'tool')
      .map((entry) => ({path: entry.path, sha256: hash(readFileSync(entry.absolute))}))]
      .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.path === entry.path) === index);
    const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'].filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
    env.NODE_ENV = 'test';
    for (const check of context.policy.trustedChecks) {
      let output = '';
      let exitCode = 0;
      for (const step of check.steps) {
        const result = spawnSync(process.execPath, checkArguments(context, step, directory), {cwd: directory, env, windowsHide: true, encoding: 'utf8', timeout: check.timeoutMs ?? 120_000, maxBuffer: 4 * 1024 * 1024});
        output += `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}\n` : ''}`;
        assertSnapshotIntact(context, directory, snapshotBaseline);
        if (result.status !== 0 || result.error || (step.kind === 'tests' && !testsCompleted(step, result.stdout ?? '', directory))) {
          if (step.kind === 'tests') output += '\nTrusted test completion counts were not satisfied.\n';
          exitCode = result.status || 1;
          break;
        }
      }
      const outputRef = path.join(runRoot, `${check.id}.log`);
      if (!inside(runRoot, outputRef) || !/^[a-z0-9-]+$/i.test(check.id)) fail('check identity must be safe for retained output');
      writeFileSync(outputRef, output, 'utf8');
      checks.push({id: check.id, status: exitCode === 0 ? 'PASS' : 'FAIL', exitCode, outputRef, outputSha256: hash(readFileSync(outputRef))});
    }
    if (!sameDigests(measured.candidate, measure(context).candidate)) fail('staging changed during required checks');
    verifyDependencies(context.stageRoot, context.trustedRoot, context.pin);
    const record = {...measured.candidate, capturedAt: new Date().toISOString(), implementerId: context.implementerId, policyVersion: context.pin.policyVersion, baselineSha256: context.baselineSha256, status: checks.every((check) => check.status === 'PASS') ? 'READY_FOR_REVIEW' : 'FAIL', checks};
    save(candidateRef, measured.candidate);
    save(evidenceRef, record);
    if (record.status === 'FAIL') fail(`required check failed; retained evidence: ${evidenceRef}`);
    return {candidateRef, evidenceRef, record};
  } finally {
    if (!inside(context.evidenceStore, directory) || path.basename(directory) !== 'snapshot') fail('unsafe validation snapshot cleanup target');
    rmSync(directory, {recursive: true, force: true});
  }
}

export function prepareTrustedValidation(options) {
  return execute(loadContext(options));
}

function retained(context, ref) {
  if (!identity(ref) || !existsSync(ref)) fail('retained evidence or output is missing');
  const actual = realpathSync(ref);
  if (!inside(context.evidenceStore, actual) || lstatSync(ref).isSymbolicLink() || !lstatSync(actual).isFile()) fail('retained evidence/output must stay in the external evidence store');
  return actual;
}

export function validateTrustedRelease(options) {
  const context = loadContext(options);
  const candidateRef = retained(context, options.candidateRef);
  const evidenceRef = retained(context, options.evidenceRef);
  const submitted = json(evidenceRef);
  const candidate = json(candidateRef);
  if (submitted.stageRoot !== context.stageRoot || candidate.stageRoot !== context.stageRoot) fail('staging identity differs from retained stage root');
  if (candidate.candidateId !== context.candidateId || submitted.candidateId !== context.candidateId) fail('retained candidate identity differs from the explicit trusted context');
  const approval = context.pin.candidateReview;
  if (!reviewIsIndependent(approval) || approval.implementerId !== context.implementerId || approval.candidateId !== context.candidateId || approval.stageRoot !== context.stageRoot) fail('independent candidate review is required for this staging identity');
  if (approval.evidenceSha256 !== hash(readFileSync(evidenceRef))) fail('approved record checksum does not match retained record');
  if (submitted.baselineSha256 !== context.baselineSha256 || submitted.implementerId !== context.implementerId || submitted.policyVersion !== context.pin.policyVersion || submitted.status !== 'READY_FOR_REVIEW') fail('retained record does not match the pinned baseline and implementer');
  const current = measure(context).candidate;
  if (!sameDigests(candidate, current) || !sameDigests(approval, current)) fail('stale or changed staged candidate fingerprints');
  for (const check of submitted.checks ?? []) {
    const output = retained(context, check.outputRef);
    if (!sha(check.outputSha256) || hash(readFileSync(output)) !== check.outputSha256) fail('retained check output checksum mismatch');
  }
  const errors = validateEvidence({...submitted, review: approval}, current);
  if (errors.length) fail(errors.join('; '));
  const fresh = execute(context);
  if (!sameDigests(fresh.record, current)) fail('staging changed after approved evidence');
  const acceptedRef = path.join(path.dirname(fresh.evidenceRef), 'accepted.json');
  const accepted = {...fresh.record, status: 'PASS', evidenceRef: acceptedRef, freshEvidenceRef: fresh.evidenceRef, reviewedEvidenceRef: evidenceRef, review: approval};
  save(acceptedRef, accepted);
  return accepted;
}

function run() {
  const {values} = parseArgs({options: {mode: {type: 'string'}, 'stage-root': {type: 'string'}, 'trusted-root': {type: 'string'}, pin: {type: 'string'}, 'pin-sha256': {type: 'string'}, 'evidence-store': {type: 'string'}, 'candidate-id': {type: 'string'}, 'implementer-id': {type: 'string'}, evidence: {type: 'string'}, candidate: {type: 'string'}}});
  const options = {stageRoot: values['stage-root'], trustedRoot: values['trusted-root'], pinRef: values.pin, pinSha256: values['pin-sha256'], evidenceStore: values['evidence-store'], candidateId: values['candidate-id'], implementerId: values['implementer-id'], evidenceRef: values.evidence, candidateRef: values.candidate};
  if (!['prepare', 'validate'].includes(values.mode)) fail('--mode must be prepare or validate');
  const result = values.mode === 'prepare' ? prepareTrustedValidation(options) : validateTrustedRelease(options);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) run();
