import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

type NavigationEntry = {title: string; path: string};
type DocsManifest = {version: string; source: string; navigation: NavigationEntry[]};
type ExportedDocument = Readonly<{title: string; sourcePath: string; outputPath: string; markdown: string}>;

const forbidden = [/BEGIN PRIVATE KEY/i, /sk_(?:live|test)_[A-Za-z0-9]+/i, /whsec_[A-Za-z0-9]+/i, /signed[_-]?url/i];

export function stripFrontmatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart();
}

export function buildBuyerDocuments(manifest: DocsManifest, read: (relative: string) => string): ExportedDocument[] {
  if (manifest.version !== 'v1') throw new Error('Only the v1 docs source is supported by this exporter.');
  return manifest.navigation.map((entry) => {
    const sourcePath = path.posix.join(manifest.source, entry.path);
    const source = read(sourcePath);
    if (!/^status:\s*published/m.test(source)) throw new Error(`Unpublished page cannot be exported: ${sourcePath}`);
    if (forbidden.some((pattern) => pattern.test(source))) throw new Error(`Secret-bearing content cannot be exported: ${sourcePath}`);
    const outputPath = path.posix.join('docs/buyer/generated', manifest.version, entry.path.replace(/\.mdx$/, '.md'));
    return Object.freeze({
      title: entry.title,
      sourcePath,
      outputPath,
      markdown: `# ${entry.title}\n\n> Source release: ${manifest.version}\n> Canonical source: ${sourcePath}\n\n${stripFrontmatter(source).trim()}\n`,
    });
  });
}

function run(): void {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(path.join(root, 'content/docs/v1/manifest.json'), 'utf8')) as DocsManifest;
  const documents = buildBuyerDocuments(manifest, (relative) => readFileSync(path.join(root, relative), 'utf8'));
  for (const document of documents) {
    const output = path.join(root, document.outputPath);
    mkdirSync(path.dirname(output), {recursive: true});
    writeFileSync(output, document.markdown, 'utf8');
  }
  console.log(JSON.stringify({status: 'PASS', profile: 'local-buyer-export', release: manifest.version, documents: documents.map(({title, sourcePath, outputPath}) => ({title, sourcePath, outputPath}))}, null, 2));
}

if (process.argv[1]?.endsWith('export-buyer-docs.ts')) run();

