import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, realpathSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

export type ChangeFile = Readonly<{path: string; classification: string; reason: string}>;
export type ChangeManifest = Readonly<{
  release: string;
  baseline: string;
  dirtyWork: string[];
  intent: string;
  changedFiles: ChangeFile[];
  classification: string;
  checks: Array<{id: string; status: string; outputRef: string}>;
  recovery: {patchRef: string; preservesUnrelatedWork: boolean; overlaps: string[]};
}>;

const protectedPrefixes = [
  'src/db', 'src/modules', 'src/adapters', 'src/app/api/auth', 'src/app/api/billing',
  'src/app/api/generation', 'src/app/api/webhooks', 'src/app/api/workspaces', 'src/db/migrations', '.shpitto/contracts', 'scripts', 'tooling',
];
const validationPolicy = JSON.parse(readFileSync(new URL('../.shpitto/contracts/validation-policy.json', import.meta.url), 'utf8')) as {requiredChecks: string[]};

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function identity(value: unknown): value is string {
  return nonempty(value) && value === value.trim();
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalize(value: string): string {
  return path.posix.normalize(value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '')).toLowerCase();
}

function repositoryPath(value: unknown): value is string {
  if (!identity(value) || /[:\0<>"|?*]/.test(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) return false;
  return value.replaceAll('\\', '/').split('/').every((part) => part.length > 0 && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

export function isProtectedPath(filePath: string): boolean {
  const normalized = normalize(filePath);
  return protectedPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

export function validateChangeManifest(manifest: ChangeManifest): string[] {
  const errors: string[] = [];
  const classifications = ['presentation', 'content', 'approved-config', 'engineering-change', 'blocked'];
  if (!manifest.release || !manifest.baseline || !manifest.intent) errors.push('release, baseline and intent are required');
  if (!classifications.includes(manifest.classification)) errors.push('overall classification must use a declared workflow class');
  if (!Array.isArray(manifest.dirtyWork) || !Array.isArray(manifest.changedFiles)) errors.push('dirtyWork and changedFiles must be arrays');
  for (const file of manifest.changedFiles ?? []) {
    if (!file.path || !file.classification || !file.reason) errors.push(`changed file is incomplete: ${file.path ?? '<missing>'}`);
    if (!repositoryPath(file.path)) {
      errors.push(`changed file must use an unambiguous repository-relative path: ${file.path ?? '<missing>'}`);
      continue;
    }
    if (!classifications.includes(file.classification)) errors.push(`changed file classification must use a declared workflow class: ${file.path}`);
    if (isProtectedPath(file.path) && file.classification !== 'engineering-change') {
      errors.push(`protected path requires engineering-change classification: ${file.path}`);
    }
    if ((isProtectedPath(file.path) || file.classification === 'engineering-change') && manifest.classification !== 'engineering-change') {
      errors.push(`overall workflow requires engineering-change classification: ${file.path}`);
    }
  }
  for (const check of manifest.checks ?? []) {
    if (!check.id || !check.status || !check.outputRef) errors.push('each check needs id, status and outputRef');
  }
  if (!manifest.recovery?.patchRef || manifest.recovery.preservesUnrelatedWork !== true || !Array.isArray(manifest.recovery.overlaps)) {
    errors.push('recovery must include a scoped patch, unrelated-work preservation and overlap list');
  }
  return errors;
}

export function validateEvidence(evidence: Record<string, unknown>, current: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const required = ['candidateId', 'capturedAt', 'implementerId', 'sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256', 'policyVersion', 'checks', 'review'];
  for (const key of required) if (!evidence[key]) errors.push(`evidence is missing ${key}`);
  if (evidence.status !== undefined && !['READY_FOR_REVIEW', 'PASS'].includes(String(evidence.status))) errors.push('evidence status must be READY_FOR_REVIEW or PASS');
  if (!identity(evidence.capturedAt) || !Number.isFinite(Date.parse(evidence.capturedAt))) errors.push('evidence capturedAt must be a valid date string');
  if (!identity(evidence.policyVersion)) errors.push('evidence policyVersion must be a canonical nonempty identity');
  if (!identity(evidence.candidateId) || !identity(current.candidateId) || evidence.candidateId !== current.candidateId) errors.push('evidence must match the explicit current candidate identity');
  for (const key of ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256']) {
    if (!sha256(evidence[key]) || !sha256(current[key])) errors.push(`evidence and current candidate need SHA-256 strings: ${key}`);
    if (evidence[key] !== current[key]) errors.push(`stale evidence digest: ${key}`);
  }
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const checkIds = new Set<string>();
  if (checks.length === 0) errors.push('evidence must include all required checks');
  for (const check of checks) {
    if (!record(check) || !nonempty(check.id) || check.id !== check.id.trim() || !nonempty(check.outputRef) || check.status !== 'PASS' || check.exitCode !== 0) {
      errors.push('all evidence checks need an identity, successful result and retained output');
      continue;
    }
    if (checkIds.has(check.id)) errors.push(`duplicate evidence check: ${check.id}`);
    checkIds.add(check.id);
  }
  for (const id of validationPolicy.requiredChecks) if (!checkIds.has(id)) errors.push(`missing successful required check: ${id}`);
  const review = evidence.review;
  if (!identity(evidence.implementerId) || !record(review) || !identity(review.reviewerId) || review.reviewerId === evidence.implementerId || review.independentFromImplementer !== true || review.decision !== 'PASS') {
    errors.push('an explicit independent PASS from a named reviewer distinct from the implementer is required');
  }
  return errors;
}

export function validateRetainedEvidence(evidence: Record<string, unknown>, evidenceRef: string): string[] {
  const errors: string[] = [];
  if (!['READY_FOR_REVIEW', 'PASS'].includes(String(evidence.status))) errors.push('retained evidence must have READY_FOR_REVIEW or PASS status');
  const checks = Array.isArray(evidence.checks) ? evidence.checks : [];
  const evidenceDirectory = realpathSync(path.dirname(path.resolve(evidenceRef)));
  for (const check of checks) {
    if (!record(check) || !nonempty(check.outputRef) || !sha256(check.outputSha256)) {
      errors.push('retained evidence checks need output references and SHA-256 values');
      continue;
    }
    const output = path.resolve(evidenceDirectory, String(check.outputRef));
    const actual = existsSync(output) ? realpathSync(output) : output;
    const relative = path.relative(evidenceDirectory, actual);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !existsSync(output) || lstatSync(output).isSymbolicLink() || !lstatSync(actual).isFile()) {
      errors.push(`retained check output is missing or escapes evidence store: ${check.id ?? '<missing>'}`);
      continue;
    }
    if (sha256File(actual) !== check.outputSha256) errors.push(`retained check output checksum mismatch: ${check.id ?? '<missing>'}`);
  }
  return errors;
}

export function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function run(): void {
  const root = process.cwd();
  const {values} = parseArgs({options: {manifest: {type: 'string'}, evidence: {type: 'string'}, candidate: {type: 'string'}}});
  const manifestRef = values.manifest;
  const evidenceRef = values.evidence;
  const candidateRef = values.candidate;
  if (!manifestRef) throw new Error('Usage: node --experimental-strip-types scripts/validate-change.ts --manifest <path> [--evidence <path>]');
  const manifest = readJson<ChangeManifest>(path.resolve(root, manifestRef));
  const errors = validateChangeManifest(manifest);
  if (evidenceRef) {
    if (!candidateRef) throw new Error('--evidence requires --candidate <current candidate JSON>; historical internal evidence is not a buyer baseline.');
    const evidence = readJson<Record<string, unknown>>(path.resolve(root, evidenceRef));
    const candidate = readJson<Record<string, unknown>>(path.resolve(root, candidateRef));
    errors.push(...validateEvidence(evidence, candidate));
    errors.push(...validateRetainedEvidence(evidence, path.resolve(root, evidenceRef)));
  }
  if (errors.length) {
    console.error(JSON.stringify({status: 'BLOCKED', errors}, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({status: 'PASS', scope: 'manifest-and-retained-evidence-validation', releaseAuthorization: false, manifest: manifestRef, evidence: evidenceRef ?? null}, null, 2));
}

if (process.argv[1]?.endsWith('validate-change.ts')) run();

