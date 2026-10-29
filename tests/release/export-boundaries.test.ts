import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReleaseBoundaries} from '../../scripts/check-release-boundaries.ts';

test('release preflight uses positive allowlists and excludes internal/runtime history', () => {
  const manifest = JSON.parse(readFileSync('.shpitto/contracts/export-manifest.json', 'utf8'));
  const errors = validateReleaseBoundaries(manifest);
  assert.deepEqual(errors, []);
  assert.ok(manifest.customerRuntime.exclude.includes('internal'));
  assert.ok(manifest.customerRuntime.exclude.includes('legacy'));
});

test('release preflight rejects secret-bearing content', () => {
  const manifest = JSON.parse(readFileSync('.shpitto/contracts/export-manifest.json', 'utf8'));
  let injected = false;
  const errors = validateReleaseBoundaries(manifest, (file) => {
    if (!injected && file.startsWith('src/')) { injected = true; return 'sk_live_fake'; }
    return readFileSync(file, 'utf8');
  });
  assert.match(errors.join('\n'), /forbidden content/);
});
