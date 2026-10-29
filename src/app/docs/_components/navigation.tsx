'use client';

import {useState} from 'react';
import {searchDocs, type PublishedDoc} from '../_lib/search';

export function DocsNavigation({pages, currentHref, release}: {pages: readonly PublishedDoc[]; currentHref: string; release: string}) {
  const [query, setQuery] = useState('');
  const results = searchDocs(pages, query);
  const sections = ['template', 'skills', 'apis', 'releases'];
  return <aside className="docs-sidebar" aria-label="Documentation navigation">
    <label htmlFor="docs-version">Documentation version</label>
    <select id="docs-version" value={release} onChange={(event) => { window.location.href = `/docs/${event.target.value}`; }}>
      <option value="v1">v1 · current documentation</option>
    </select>
    <label htmlFor="docs-search">Search published documentation</label>
    <input id="docs-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guides and Skills…" autoComplete="off" />
    {query.trim() ? <div className="docs-search-results">
      <p role="status">{results.length ? `${results.length} result${results.length === 1 ? '' : 's'} in ${release}` : `No results in ${release}. Try another term.`}</p>
      <ul>{results.map((page) => <li key={page.href}><a href={page.href}>{page.title}</a></li>)}</ul>
      <button type="button" onClick={() => setQuery('')}>Clear search</button>
    </div> : <nav aria-label="Published documentation">
      {sections.map((section) => <section key={section}>
        <h2>{section === 'apis' ? 'APIs' : `${section[0].toUpperCase()}${section.slice(1)}`}</h2>
        <ul>{pages.filter((page) => (page.section === 'api' ? 'apis' : page.section) === section).map((page) => <li key={page.href}><a aria-current={page.href === currentHref ? 'page' : undefined} href={page.href}>{page.title}</a></li>)}</ul>
      </section>)}
    </nav>}
  </aside>;
}
