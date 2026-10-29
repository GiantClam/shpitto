import {readFileSync} from 'node:fs';
import path from 'node:path';
import {frontmatter} from 'fumadocs-core/content/md/frontmatter';
import type {PublishedDoc} from './search.ts';
export {searchDocs} from './search.ts';

type DocsManifest = {version: string; source: string; navigation: readonly {title: string; path: string}[]};

export function createDocsCatalog(manifest: DocsManifest, read: (sourcePath: string) => string): PublishedDoc[] {
  if (manifest.version !== 'v1' || manifest.source !== 'content/docs/v1') throw new Error('Untrusted documentation release source.');
  return manifest.navigation.flatMap((entry) => {
    if (!/^[a-z0-9/-]+\.mdx$/.test(entry.path) || entry.path.split('/').includes('..') || path.posix.normalize(entry.path) !== entry.path || entry.path.startsWith('/')) {
      throw new Error('Unsafe documentation path.');
    }
    const parsed = frontmatter(read(`${manifest.source}/${entry.path}`));
    const data = parsed.data as Record<string, unknown>;
    if (data.status !== 'published') return [];
    if (data.release !== manifest.version) throw new Error('Documentation release does not match its source.');
    const prose = parsed.content.replace(/```[^\n]*\n[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    if (/^\s*(?:import|export)\s|<[A-Za-z][^>]*>/m.test(prose)) throw new Error('Documentation must not contain executable MDX or raw HTML.');
    const slug = entry.path.replace(/\.mdx$/, '').split('/').filter((segment) => segment !== 'index');
    return [{title: entry.title, description: typeof data.description === 'string' ? data.description : '', release: manifest.version, section: typeof data.section === 'string' ? data.section : 'releases', sourcePath: entry.path, slug, href: `/docs/${manifest.version}${slug.length ? `/${slug.join('/')}` : ''}`, content: parsed.content}];
  });
}

export function loadDocsCatalog(): PublishedDoc[] {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(path.join(root, 'content/docs/v1/manifest.json'), 'utf8')) as DocsManifest;
  return createDocsCatalog(manifest, (sourcePath) => readFileSync(path.join(root, sourcePath), 'utf8'));
}

export function resolveDocsLink(href: string, page: PublishedDoc, pages: readonly PublishedDoc[]): string | undefined {
  if (href.startsWith('#')) return href;
  if (/^https?:\/\//.test(href)) return href;
  if (href.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(href)) return undefined;
  const [relative, hash] = href.split('#');
  const source = path.posix.normalize(path.posix.join(path.posix.dirname(page.sourcePath), relative.replace(/\.mdx?$/, '')));
  const target = pages.find((entry) => entry.release === page.release && [source, `${source}/index`].includes(entry.sourcePath.replace(/\.mdx$/, '')));
  return target ? `${target.href}${hash ? `#${hash}` : ''}` : undefined;
}
