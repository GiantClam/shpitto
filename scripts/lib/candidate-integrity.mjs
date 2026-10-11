import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function safeRelativePath(value) {
  assert.equal(typeof value, 'string', 'Archive paths must be strings.');
  assert(value.length > 0 && !/[\\:\x00-\x1f]/.test(value), 'Archive path contains an unsafe character.');
  assert(!path.posix.isAbsolute(value) && value.split('/').every((part) => part && part !== '.' && part !== '..'), 'Archive path escapes its extraction root.');
  return value;
}

export function assertArchiveManifest(root, manifest) {
  const zipPath = path.join(root, safeRelativePath(manifest.zip.path));
  const bytes = readFileSync(zipPath);
  assert.equal(bytes.length, manifest.zip.bytes, 'Archive size differs from its manifest.');
  assert.equal(hash(bytes), manifest.zip.sha256, 'Archive SHA-256 differs from its manifest.');
  return zipPath;
}

export function validateArchiveEntries(entries, files) {
  const expected = files.map((file) => safeRelativePath(file.archivePath));
  assert.equal(new Set(expected.map((name) => name.toLowerCase())).size, expected.length, 'Manifest contains duplicate or case-colliding paths.');
  const actual = entries.map(safeRelativePath);
  assert.equal(new Set(actual.map((name) => name.toLowerCase())).size, actual.length, 'Archive contains duplicate or case-colliding paths.');
  assert.deepEqual(actual.sort(), [...expected].sort(), 'Archive members differ from the complete allowlisted manifest.');
}

export function assertExtractedFiles(directory, files) {
  const actual = [];
  const walk = (relative = '') => {
    for (const name of readdirSync(path.join(directory, relative))) {
      const entry = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(path.join(directory, entry));
      assert(!stat.isSymbolicLink(), `Candidate contains a symbolic link: ${entry}`);
      if (stat.isDirectory()) walk(entry);
      else {
        assert(stat.isFile(), `Candidate contains a non-regular file: ${entry}`);
        actual.push(entry);
      }
    }
  };
  walk();
  validateArchiveEntries(actual, files);
  for (const file of files) {
    const bytes = readFileSync(path.join(directory, file.archivePath));
    assert.equal(bytes.length, file.bytes, `Candidate file size differs: ${file.archivePath}`);
    assert.equal(hash(bytes), file.sha256, `Candidate file SHA-256 differs: ${file.archivePath}`);
  }
}
