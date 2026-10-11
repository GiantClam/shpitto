import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBuyerDocuments, stripFrontmatter} from '../../scripts/export-buyer-docs.ts';

test('buyer exporter strips trusted frontmatter and preserves release identity', () => {
  const manifest = {version: 'v1', source: 'content/docs/v1', navigation: [{title: 'Example', path: 'example.mdx'}]};
  const documents = buildBuyerDocuments(manifest, () => '---\nstatus: published\n---\n\n# Example\n\nBody');
  assert.equal(documents.length, 1);
  assert.match(documents[0].markdown, /Source release: v1/);
  assert.match(documents[0].markdown, /# Example/);
  assert.doesNotMatch(documents[0].markdown, /status: published/);
});

test('buyer exporter rejects unpublished and secret-bearing pages', () => {
  const manifest = {version: 'v1', source: 'content/docs/v1', navigation: [{title: 'Example', path: 'example.mdx'}]};
  assert.throws(() => buildBuyerDocuments(manifest, () => '---\nstatus: draft\n---\n# Example'), /Unpublished/);
  assert.throws(() => buildBuyerDocuments(manifest, () => '---\nstatus: published\n---\nsk_live_fake'), /Secret-bearing/);
});

test('current docs source has published metadata on every manifest page', () => {
  const manifest = JSON.parse(readFileSync('content/docs/v1/manifest.json', 'utf8'));
  for (const entry of manifest.navigation) {
    const source = readFileSync(`content/docs/v1/${entry.path}`, 'utf8');
    assert.match(source, /status:\s*published/);
  }
  assert.equal(stripFrontmatter('---\nstatus: published\n---\nBody'), 'Body');
});
