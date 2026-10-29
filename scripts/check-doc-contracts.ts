import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

type Manifest = {version: string; source: string; navigation: Array<{title: string; path: string}>; search?: {mode: string; source: string}};

function read(ref: string): string { return readFileSync(path.join(process.cwd(), ref), 'utf8'); }

export function checkDocsManifest(manifest: Manifest, sourceFiles: string[], readSource: (ref: string) => string = read): string[] {
  const errors: string[] = [];
  if (manifest.version !== 'v1' || manifest.source !== 'content/docs/v1') errors.push('manifest must identify the v1 shared source');
  if (manifest.search?.mode !== 'published-only' || manifest.search.source !== manifest.source) errors.push('search must be published-only and use the shared source');
  if (!['Template', 'Skills', 'API', 'Releases'].every((title) => manifest.navigation.some((entry) => entry.title === title))) errors.push('navigation must expose Template, Skills, API and Releases');
  if (new Set(manifest.navigation.map((entry) => entry.path)).size !== manifest.navigation.length) errors.push('navigation paths must be unique');
  if (manifest.navigation.filter((entry) => entry.title.startsWith('Skill · ')).length !== 12) errors.push('navigation must expose all twelve Skill references');
  for (const entry of manifest.navigation) {
    if (entry.path.startsWith('/') || entry.path.split('/').includes('..') || path.posix.normalize(entry.path) !== entry.path || !entry.path.endsWith('.mdx')) {
      errors.push(`navigation path is not a normalized MDX source path: ${entry.path}`);
    }
    if (!sourceFiles.includes(path.posix.join(manifest.source, entry.path))) errors.push(`navigation source was not checked: ${entry.path}`);
  }
  try {
    const registry = JSON.parse(readSource('skills/registry.json')) as {skills?: Array<{id?: string}>};
    for (const skill of registry.skills ?? []) {
      const pathName = `skills/${skill.id}.mdx`;
      if (!manifest.navigation.some((entry) => entry.path === pathName && entry.title === `Skill · ${skill.id}`)) {
        errors.push(`Skill reference is missing from published navigation: ${skill.id}`);
      }
    }
  } catch {
    errors.push('Skill registry could not be read for Docs validation');
  }
  const root = path.resolve(process.cwd());
  for (const file of sourceFiles) {
    const absolute = path.resolve(root, file);
    const relative = path.relative(root, absolute);
    if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
      errors.push(`${file} escapes the repository root`);
      continue;
    }
    if (!existsSync(absolute)) {
      errors.push(`${file} is missing from the published source`);
      continue;
    }
    const content = readSource(file);
    for (const field of ['release:', 'title:', 'section:', 'status:', 'relatedContracts:']) if (!content.includes(field)) errors.push(`${file} is missing ${field}`);
    if (!/status:\s*published/.test(content)) errors.push(`${file} is not published`);
    for (const match of content.matchAll(/`(src\/app\/api\/[^`]+\/route\.ts)`/g)) {
      const route = match[1];
      const normalized = path.posix.normalize(route);
      if (normalized !== route || route.split('/').includes('..') || !existsSync(path.join(process.cwd(), route))) {
        errors.push(`${file} references a missing or unsafe API route: ${route}`);
      }
    }
  }
  const apiPage = sourceFiles.find((file) => file.endsWith('/api/overview.mdx'));
  if (apiPage && !/public.{0,30}api.{0,30}deferred/i.test(readSource(apiPage))) errors.push('API guide must state that the public API is deferred');
  return errors;
}

function run(): void {
  const manifest = JSON.parse(read('content/docs/v1/manifest.json')) as Manifest;
  const sourceFiles = [...new Set(manifest.navigation.map((entry) => path.posix.join(manifest.source, entry.path)))];
  const errors = checkDocsManifest(manifest, sourceFiles);
  if (errors.length) { console.error(JSON.stringify({status: 'FAIL', errors}, null, 2)); process.exitCode = 1; return; }
  console.log(JSON.stringify({status: 'PASS', version: manifest.version, pages: sourceFiles.length, search: manifest.search}, null, 2));
}

if (process.argv[1]?.endsWith('check-doc-contracts.ts')) run();

