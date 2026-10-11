import {createMarkdownRenderer} from 'fumadocs-core/content/md';
import {remarkHeading} from 'fumadocs-core/mdx-plugins/remark-heading';
import {remarkGfm} from 'fumadocs-core/mdx-plugins/remark-gfm';
import {Heading} from 'fumadocs-ui/components/heading';
import {RootProvider} from 'fumadocs-ui/provider/next';
import {notFound} from 'next/navigation';
import {SiteShell} from '../../../components/shell/site-shell';
import {loadDocsCatalog, resolveDocsLink} from '../_lib/source';
import {DocsNavigation} from './navigation';
import '../docs.css';

const {MarkdownServer} = createMarkdownRenderer({remarkPlugins: [[remarkHeading, {generateToc: false}], remarkGfm]});

export async function DocsArticle({sourcePath}: {sourcePath: string}) {
  const pages = loadDocsCatalog();
  const page = pages.find((entry) => entry.sourcePath === sourcePath);
  if (!page) notFound();
  const content = await MarkdownServer({children: page.content, components: {
    h1: (props) => <Heading as="h1" {...props} />,
    h2: (props) => <Heading as="h2" {...props} />,
    h3: (props) => <Heading as="h3" {...props} />,
    a: ({href, children, ...props}) => {
      const target = href ? resolveDocsLink(href, page, pages) : undefined;
      return target ? <a {...props} href={target}>{children}</a> : <span>{children}</span>;
    },
  }});
  return <SiteShell><RootProvider search={{enabled: false}} theme={{enabled: false}}>
    <div className="docs-layout">
      <DocsNavigation pages={pages} currentHref={page.href} release={page.release} />
      <main className="docs-article" aria-label={page.title}>
        <div className="docs-release"><span className="eyebrow">Developer documentation</span><span className="state-pill">{page.release} · published docs</span></div>
        <p className="docs-boundary">Local template preview. Real provider, payment and production verification remain separate release gates.</p>
        {content}
        <footer className="docs-source">Source: <code>content/docs/{page.release}/{page.sourcePath}</code></footer>
      </main>
    </div>
  </RootProvider></SiteShell>;
}
