import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {assertArchiveManifest, assertExtractedFiles, safeRelativePath, validateArchiveEntries} from './candidate-integrity.mjs';

test('candidate paths reject traversal, Windows drive paths and ambiguous members before extraction', () => {
  for (const value of ['../escape', '/absolute', 'C:/escape', 'customerRuntime/../escape', 'customerRuntime\\escape', 'customerRuntime//file', 'customerRuntime/./file']) assert.throws(() => safeRelativePath(value));
  const files = [{archivePath: 'customerRuntime/package.json'}];
  validateArchiveEntries(['customerRuntime/package.json'], files);
  assert.throws(() => validateArchiveEntries(['customerRuntime/package.json', 'unexpected'], files));
  assert.throws(() => validateArchiveEntries(['customerRuntime/package.json', 'customerRuntime/package.json'], files));
  assert.throws(() => validateArchiveEntries(['customerRuntime/package.json'], [...files, {archivePath: 'customerRuntime/PACKAGE.json'}]));
});

test('candidate verifies archive bytes and all extracted file bytes, rejecting modified and extra files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'candidate-integrity-'));
  const bytes = Buffer.from('frozen customer content');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    writeFileSync(path.join(root, 'candidate.zip'), bytes);
    const manifest = {zip: {path: 'candidate.zip', bytes: bytes.length, sha256}};
    assertArchiveManifest(root, manifest);
    assert.throws(() => assertArchiveManifest(root, {...manifest, zip: {...manifest.zip, sha256: '0'.repeat(64)}}));
    const extracted = path.join(root, 'extracted');
    mkdirSync(path.join(extracted, 'customerRuntime'), {recursive: true});
    writeFileSync(path.join(extracted, 'customerRuntime', 'test.txt'), bytes);
    const files = [{archivePath: 'customerRuntime/test.txt', bytes: bytes.length, sha256}];
    assertExtractedFiles(extracted, files);
    writeFileSync(path.join(extracted, 'customerRuntime', 'test.txt'), Buffer.alloc(bytes.length));
    assert.throws(() => assertExtractedFiles(extracted, files));
    writeFileSync(path.join(extracted, 'customerRuntime', 'test.txt'), bytes);
    writeFileSync(path.join(extracted, 'customerRuntime', 'extra.txt'), 'unexpected');
    assert.throws(() => assertExtractedFiles(extracted, files));
  } finally {rmSync(root, {recursive: true, force: true});}
});
