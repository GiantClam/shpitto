import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('shared cleanup and compatibility helpers import without loading the optional Trigger SDK', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
    import {registerHooks} from 'node:module';
    registerHooks({resolve(specifier, context, next) {
      if (specifier.startsWith('@trigger.dev/')) throw new Error('optional SDK loaded on baseline path');
      return next(specifier, context);
    }});
    const cleanup = await import('./src/trigger/cleanup-assets.ts');
    if (typeof cleanup.runAssetCleanupBatch !== 'function') throw new Error('missing shared cleanup');
    await import('./src/modules/generation/provider-worker.ts');
  `], {cwd: process.cwd(), encoding: 'utf8', windowsHide: true, timeout: 10_000});
  assert.equal(result.status, 0, result.stderr);
});
