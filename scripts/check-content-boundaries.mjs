import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
const registry = JSON.parse(read('skills/registry.json'));
const exportClasses = JSON.parse(read('.shpitto/contracts/export-classes.json'));
const docsManifest = JSON.parse(read('content/docs/v1/manifest.json'));

if (registry.skills?.length !== 12) failures.push('Skill registry must contain exactly twelve entries');
if (new Set(registry.skills.map((skill) => skill.id)).size !== 12) failures.push('Skill registry IDs must be unique');
if (!registry.protectedPaths.includes('src/db/migrations')) failures.push('Skill registry must protect migrations');
if (!exportClasses.classes.customerRuntime.exclude.includes('internal')) failures.push('customer runtime export must exclude internal evidence');
if (!exportClasses.classes.customerRuntime.exclude.includes('legacy')) failures.push('customer runtime export must exclude legacy source');
if (docsManifest.version !== 'v1' || docsManifest.source !== 'content/docs/v1') failures.push('Docs manifest must identify the shared v1 source');
if (fs.existsSync(path.join(root, 'legacy')) && !fs.existsSync(path.join(root, 'legacy/shpitto-platform/AGENTS.md'))) failures.push('existing legacy AGENTS guidance must be preserved');
if (!/OpenSpec/i.test(read('.shpitto/contracts/root-contract.md'))) failures.push('root contract must reference OpenSpec');

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Content and export boundary check passed.');
