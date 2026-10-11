import {notFound} from 'next/navigation';
import {DocsArticle} from '../../_components/article';
import {loadDocsCatalog} from '../../_lib/source';

export const dynamicParams = false;

export function generateStaticParams() {
  return loadDocsCatalog().map((page) => ({release: page.release, slug: page.slug}));
}

export default async function VersionedDocsPage({params}: {params: Promise<{release: string; slug?: string[]}>}) {
  const {release, slug = []} = await params;
  const page = loadDocsCatalog().find((entry) => entry.release === release && entry.slug.join('/') === slug.join('/'));
  if (!page) notFound();
  return <DocsArticle sourcePath={page.sourcePath} />;
}
