export type PublishedDoc = Readonly<{
  title: string;
  description: string;
  release: string;
  section: string;
  sourcePath: string;
  slug: string[];
  href: string;
  content: string;
}>;

export function searchDocs(pages: readonly PublishedDoc[], query: string): readonly PublishedDoc[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return pages.filter((page) => {
    const text = `${page.title} ${page.description} ${page.content}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
