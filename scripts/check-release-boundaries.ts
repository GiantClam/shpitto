import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';

type ExportClass = {include: string[]; exclude: string[]};
type Manifest = {release: string; customerRuntime: ExportClass; buyerGuidance: ExportClass; forbiddenContent: string[]};

function walk(relative: string): string[] {
  const absolute = path.join(process.cwd(), relative);
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [relative.replaceAll('\\', '/')];
  return readdirSync(absolute).flatMap((entry) => walk(path.join(relative, entry)));
}

function includedFiles(exportClass: ExportClass): string[] {
  return [...new Set(exportClass.include.flatMap(walk))].sort();
}

function isExcluded(file: string, excluded: string[]): boolean {
  const normalized = file.replaceAll('\\', '/');
  return excluded.some((entry) => {
    if (entry.startsWith('*')) return normalized.endsWith(entry.slice(1));
    return normalized === entry || normalized.startsWith(`${entry}/`);
  });
}

export function validateReleaseBoundaries(manifest: Manifest, read: (file: string) => string = (file) => readFileSync(path.join(process.cwd(), file), 'utf8')): string[] {
  const errors: string[] = [];
  if (manifest.release !== 'v1') errors.push('export manifest release must be v1');
  for (const [name, exportClass] of Object.entries({customerRuntime: manifest.customerRuntime, buyerGuidance: manifest.buyerGuidance})) {
    if (!exportClass.include.length) errors.push(`${name} must have a positive allowlist`);
    for (const file of includedFiles(exportClass)) {
      if (isExcluded(file, exportClass.exclude)) errors.push(`${name} includes an excluded path: ${file}`);
      const content = read(file);
      if (manifest.forbiddenContent.some((needle) => new RegExp(needle).test(content))) errors.push(`${name} contains forbidden content in ${file}`);
    }
  }
  return errors;
}

function run(): void {
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), '.shpitto/contracts/export-manifest.json'), 'utf8')) as Manifest;
  const errors = validateReleaseBoundaries(manifest);
  if (errors.length) { console.error(JSON.stringify({status: 'FAIL', errors}, null, 2)); process.exitCode = 1; return; }
  console.log(JSON.stringify({status: 'PASS', profile: 'preflight-only', customerFiles: includedFiles(manifest.customerRuntime).length, buyerFiles: includedFiles(manifest.buyerGuidance).length}, null, 2));
}

if (process.argv[1]?.endsWith('check-release-boundaries.ts')) run();
