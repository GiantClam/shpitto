import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {isProtectedPath, validateChangeManifest} from '../../scripts/validate-change.ts';

const root = process.cwd();
const read = (ref: string) => readFileSync(path.join(root, ref), 'utf8');

test('four personalization Skills declare the same presentation boundary', () => {
  for (const id of ['customize-brand', 'create-page', 'modify-page', 'customize-site']) {
    const source = read(`skills/${id}/SKILL.md`);
    assert.match(source, /## Allowed scope/);
    assert.match(source, /## Protected contracts/);
    assert.match(source, /## Escalation/);
  }
  assert.match(read('.shpitto/contracts/presentation.json'), /preserveJourneys/);
});

test('presentation paths are editable while business paths are protected', () => {
  assert.equal(isProtectedPath('src/app/(marketing)/page.tsx'), false);
  assert.equal(isProtectedPath('src/components/shell/site-shell.tsx'), false);
  assert.equal(isProtectedPath('src/app/api/workspaces/[workspaceId]/billing/checkout/route.ts'), true);
  assert.equal(isProtectedPath('src/db/schema/generation.ts'), true);
});

test('a protected semantic bypass is rejected even when the request is labeled visual', () => {
  const errors = validateChangeManifest({
    release: 'v1', baseline: 'working-tree', dirtyWork: [], intent: 'refresh pricing visual', classification: 'presentation',
    changedFiles: [{path: 'src/app/api/workspaces/[workspaceId]/billing/checkout/route.ts', classification: 'presentation', reason: 'change button behavior'}],
    checks: [], recovery: {patchRef: 'customization.patch', preservesUnrelatedWork: true, overlaps: []},
  });
  assert.ok(errors.some((error) => error.includes('engineering-change')));
});

test('required presentation journeys remain represented in the application', () => {
  const files = readdirSync(path.join(root, 'src', 'app'), {recursive: true}) as string[];
  const source = files.filter((file) => file.endsWith('.tsx')).map((file) => read(path.join('src', 'app', file))).join('\n');
  for (const marker of ['/login', 'generation', 'Download', 'billing']) assert.match(source, new RegExp(marker.replace('/', '\\/'), 'i'));
});
