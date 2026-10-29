import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocsCatalog, loadDocsCatalog, resolveDocsLink, searchDocs} from '../../src/app/docs/_lib/source.ts';

const manifest = {version: 'v1', source: 'content/docs/v1', navigation: [{title: 'Visible', path: 'template/visible.mdx'}, {title: 'Private', path: 'template/private.mdx'}]};
const fixture = (status: string, body: string) => `---\nrelease: v1\ntitle: Example\nsection: template\nstatus: ${status}\n---\n${body}`;

test('published catalog reads canonical pages and resolves every direct URL', () => {
  const pages = loadDocsCatalog();
  assert.equal(pages.length, 27);
  assert.equal(new Set(pages.map((page) => page.href)).size, 27);
  assert.ok(pages.every((page) => page.release === 'v1' && page.content.length > 0 && page.href.startsWith('/docs/v1')));
  assert.ok(searchDocs(pages, 'private video').some((page) => page.sourcePath === 'template/local-journey.mdx'));
});

test('unpublished pages never enter the navigation or full text search', () => {
  const pages = createDocsCatalog(manifest, (source) => fixture(source.includes('private') ? 'draft' : 'published', source.includes('private') ? 'confidentialneedle' : 'Useful guide'));
  assert.equal(pages.length, 1);
  assert.deepEqual(searchDocs(pages, 'confidentialneedle'), []);
  assert.equal(searchDocs(pages, 'USEFUL').length, 1);
});

test('catalog rejects untrusted traversal, release mismatch and executable MDX', () => {
  assert.throws(() => createDocsCatalog({...manifest, navigation: [{title: 'Bad', path: '../secret.mdx'}]}, () => ''), /path/);
  assert.throws(() => createDocsCatalog(manifest, () => fixture('published', 'Guide').replace('release: v1', 'release: private')), /release/);
  assert.throws(() => createDocsCatalog(manifest, () => fixture('published', '<script>bad()</script>')), /executable/);
  assert.throws(() => createDocsCatalog(manifest, () => fixture('published', "import x from 'secret'")), /executable/);
});

test('relative links stay within the selected published release', () => {
  const pages = loadDocsCatalog();
  const page = pages.find((entry) => entry.sourcePath === 'template/local-journey.mdx')!;
  assert.equal(resolveDocsLink('../api/overview', page, pages), '/docs/v1/api/overview');
  assert.equal(resolveDocsLink('./operations#health-and-logs', page, pages), '/docs/v1/template/operations#health-and-logs');
  assert.equal(resolveDocsLink('javascript:alert(1)', page, pages), undefined);
  assert.equal(resolveDocsLink('../../private', page, pages), undefined);
  assert.equal(resolveDocsLink('./missing', page, pages), undefined);
});
