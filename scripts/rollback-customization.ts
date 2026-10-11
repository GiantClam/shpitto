import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

type Manifest = {changedFiles?: Array<{path: string}>; recovery?: {patchRef?: string; preservesUnrelatedWork?: boolean; overlaps?: string[]}};

export function createRollbackReport(manifest: Manifest): {status: 'READY' | 'BLOCKED'; patchRef?: string; overlaps: string[]; reason?: string} {
  const overlaps = manifest.recovery?.overlaps ?? [];
  if (!manifest.recovery?.patchRef || manifest.recovery.preservesUnrelatedWork !== true) return {status: 'BLOCKED', overlaps, reason: 'A scoped recovery patch and unrelated-work preservation are required.'};
  if (overlaps.length) return {status: 'BLOCKED', overlaps, reason: 'Resolve overlapping ownership before applying rollback.'};
  return {status: 'READY', patchRef: manifest.recovery.patchRef, overlaps: []};
}

function run(): void {
  const manifestRef = process.argv[process.argv.indexOf('--manifest') + 1];
  const outputRef = process.argv[process.argv.indexOf('--output') + 1];
  if (!manifestRef || !outputRef || !existsSync(manifestRef)) throw new Error('Usage: ... --manifest <path> --output <path>');
  const report = createRollbackReport(JSON.parse(readFileSync(path.resolve(process.cwd(), manifestRef), 'utf8')) as Manifest);
  writeFileSync(path.resolve(process.cwd(), outputRef), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'BLOCKED') process.exitCode = 1;
}

if (process.argv[1]?.endsWith('rollback-customization.ts')) run();

