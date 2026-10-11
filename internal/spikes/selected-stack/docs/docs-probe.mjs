import { loader } from 'fumadocs-core/source';

const source = {
  files: [
    { type: 'meta', path: 'docs/meta.json', data: { title: 'Developer Docs', pages: ['index', 'skills', 'api'] } },
    { type: 'page', path: 'docs/index.mdx', slugs: ['index'], data: { title: 'Template', description: 'Template overview' } },
    { type: 'page', path: 'docs/skills.mdx', slugs: ['skills'], data: { title: 'Skills', description: 'Governed skill usage' } },
    { type: 'page', path: 'docs/api.mdx', slugs: ['api'], data: { title: 'API', description: 'Server API contracts' } },
  ],
};

const docs = loader(source, { baseUrl: '/docs' });
const pages = docs.getPages();
const tree = docs.getPageTree();
const searchable = pages.filter((page) => `${page.data.title} ${page.data.description}`.toLowerCase().includes('skill'));

if (pages.length !== 3 || !tree || searchable.length !== 1 || searchable[0].url !== '/docs/skills') {
  throw new Error('Fumadocs static source/search probe failed');
}

console.log(JSON.stringify({
  fumadocsVersionedSource: true,
  staticPageCount: pages.length,
  pageTreeBuilt: true,
  deterministicSearchMatch: searchable[0].url,
  secretsRead: false,
}));
