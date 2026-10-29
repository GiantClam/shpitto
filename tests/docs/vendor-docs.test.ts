import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateVendorDocs} from '../../scripts/check-vendor-docs.mjs';

test('vendor Docs navigation stays synchronized with the shared source and buyer guides', () => {
  const manifest = JSON.parse(readFileSync('content/docs/v1/manifest.json', 'utf8'));
  const navigation = JSON.parse(readFileSync('vendor/sales/app/docs/navigation.json', 'utf8'));
  const sourceConfig = readFileSync('vendor/sales/source.config.ts', 'utf8');
  assert.deepEqual(validateVendorDocs({manifest, navigation, sourceConfig}), []);
});

test('vendor Docs validation rejects navigation drift', () => {
  const manifest = JSON.parse(readFileSync('content/docs/v1/manifest.json', 'utf8'));
  const navigation = JSON.parse(readFileSync('vendor/sales/app/docs/navigation.json', 'utf8'));
  const sourceConfig = readFileSync('vendor/sales/source.config.ts', 'utf8');
  navigation.pages = [{title: 'Drifted', path: 'index.mdx'}];
  assert.match(validateVendorDocs({manifest, navigation, sourceConfig}).join('\n'), /out of sync/);
});
