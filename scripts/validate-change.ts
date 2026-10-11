import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
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
  'src/app/api/generation', 'src/app/api/webhooks', 'src/app/api/workspaces', 'src/db/migrations', '.shpitto/contracts',
];

function normalize(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
}

export function isProtectedPath(filePath: string): boolean {
  const normalized = normalize(filePath);
  return protectedPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
    || normalized.startsWith('scripts/check-');
}

export function validateChangeManifest(manifest: ChangeManifest): string[] {
  const errors: string[] = [];
  if (!manifest.release || !manifest.baseline || !manifest.intent) errors.push('release, baseline and intent are required');
  if (!Array.isArray(manifest.dirtyWork) || !Array.isArray(manifest.changedFiles)) errors.push('dirtyWork and changedFiles must be arrays');
  for (const file of manifest.changedFiles ?? []) {
    if (!file.path || !file.classification || !file.reason) errors.push(`changed file is incomplete: ${file.path ?? '<missing>'}`);
    if (isProtectedPath(file.path) && file.classification !== 'engineering-change') {
      errors.push(`protected path requires engineering-change classification: ${file.path}`);
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
  const required = ['candidateId', 'capturedAt', 'sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256', 'policyVersion', 'checks', 'review'];
  for (const key of required) if (!evidence[key]) errors.push(`evidence is missing ${key}`);
  for (const key of ['sourceTreeSha256', 'schemaSha256', 'configurationSha256', 'contractSha256', 'validatorSha256', 'lockfileSha256']) {
    if (evidence[key] !== current[key]) errors.push(`stale evidence digest: ${key}`);
  }
  if (!Array.isArray(evidence.checks) || evidence.checks.some((entry) => entry?.status !== 'PASS' || entry?.exitCode !== 0 || !entry?.outputRef)) errors.push('all evidence checks must pass with retained output');
  if ((evidence.review as {independentFromImplementer?: boolean} | undefined)?.independentFromImplementer !== true) errors.push('independent review is required');
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
  }
  if (errors.length) {
    console.error(JSON.stringify({status: 'BLOCKED', errors}, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({status: 'PASS', manifest: manifestRef, evidence: evidenceRef ?? null}, null, 2));
}

if (process.argv[1]?.endsWith('validate-change.ts')) run();

