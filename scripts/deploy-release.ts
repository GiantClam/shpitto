import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {validateEvidence} from './validate-change.ts';

function readJson<T>(ref: string): T {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), ref), 'utf8')) as T;
}

export function validateDeploymentEvidence(evidenceRef: string, candidateRef: string): void {
  const errors = validateEvidence(readJson<Record<string, unknown>>(evidenceRef), readJson<Record<string, unknown>>(candidateRef));
  if (errors.length) throw new Error(`Deployment blocked: ${errors.join('; ')}`);
}

function run(): void {
  const evidenceRef = process.argv[process.argv.indexOf('--evidence') + 1];
  const candidateRef = process.argv[process.argv.indexOf('--candidate') + 1];
  if (!evidenceRef || !candidateRef || !existsSync(evidenceRef) || !existsSync(candidateRef)) throw new Error('Usage: ... --evidence <path> --candidate <path>');
  validateDeploymentEvidence(evidenceRef, candidateRef);
  console.log(JSON.stringify({status: 'PASS', action: 'deploy-evidence-validated'}, null, 2));
}

if (process.argv[1]?.endsWith('deploy-release.ts')) run();

