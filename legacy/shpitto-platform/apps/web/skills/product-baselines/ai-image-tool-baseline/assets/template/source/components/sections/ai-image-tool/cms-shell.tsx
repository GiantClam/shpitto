import type { ReactNode } from "react";
import type { CmsDataSource } from "../../../lib/cms";

type CmsShellProps = {
  active: 'overview' | 'tasks' | 'projects' | 'assets' | 'settings' | 'users' | 'gift-codes';
  title: string;
  lead: string;
  source: CmsDataSource;
  children: ReactNode;
};

const items = [
  { id: 'overview', href: '/admin', label: 'Overview' },
  { id: 'tasks', href: '/admin/tasks', label: 'Tasks' },
  { id: 'projects', href: '/admin/projects', label: 'Projects' },
  { id: 'assets', href: '/admin/assets', label: 'Assets' },
  { id: 'users', href: '/admin/users', label: 'Users' },
  { id: 'gift-codes', href: '/admin/gift-codes', label: 'Gift codes' },
  { id: 'settings', href: '/admin/settings', label: 'Settings' },
] as const;

function sourceLabel(source: CmsDataSource) {
  if (source === 'payload') return 'Payload connected';
  if (source === 'product-api') return 'Product API connected';
  return 'Preview seed data';
}

export function CmsShell({ active, title, lead, source, children }: CmsShellProps) {
  return (
    <section className="container section-stack">
      <div className="cms-shell">
        <aside className="cms-sidebar">
          <div className="cms-sidebar__brand"><span className="brand-mark">Admin CMS</span><span className="cms-source">{sourceLabel(source)}</span></div>
          <nav className="cms-nav" aria-label="CMS navigation">
            {items.map((item) => (
              <a key={item.id} href={item.href} className={item.id === active ? "cms-nav__link cms-nav__link--active" : "cms-nav__link"}>{item.label}</a>
            ))}
          </nav>
          <div className="cms-sidebar__footer"><a href="/app">Back to app</a><a href="/app/generate">New generation</a></div>
        </aside>
        <main className="cms-main">
          <div className="app-shell__header">
            <div className="app-shell__title"><p className="eyebrow">Admin CMS</p><h1>{title}</h1><p>{lead}</p></div>
            <span className="cms-source cms-source--large">{sourceLabel(source)}</span>
          </div>
          {children}
        </main>
      </div>
    </section>
  );
}
