export type DocsEntry = Readonly<{
  title: string;
  href: string;
  summary: string;
  section: 'template' | 'skills' | 'apis' | 'releases';
  status: 'published' | 'preview';
}>;

export const docsVersion = 'v1';

export const docsNavigation: readonly DocsEntry[] = [
  {title: 'Overview', href: '/docs/v1', summary: 'Product boundaries and implementation status.', section: 'releases', status: 'published'},
  {title: 'Template', href: '/docs/v1/template', summary: 'Operations and deployment boundaries.', section: 'template', status: 'published'},
  {title: 'Skill usage', href: '/docs/v1/skills/overview', summary: 'Governed customization workflows.', section: 'skills', status: 'published'},
  {title: 'API contracts', href: '/docs/v1/api/overview', summary: 'Session and command contracts.', section: 'apis', status: 'published'},
  {title: 'Releases', href: '/docs/v1/releases', summary: 'Published release and source status.', section: 'releases', status: 'published'},
];

export const docsSections = ['template', 'skills', 'apis', 'releases'] as const;
