'use client';

import {useState, type ReactNode} from 'react';

import {adminNavigation} from '../../config/navigation';

export function AdminShell({children}: Readonly<{children: ReactNode}>) {
  const [compact, setCompact] = useState(false);
  return (
    <div className={compact ? 'admin-shell admin-shell-compact' : 'admin-shell'}>
      <aside className="admin-sidebar" aria-label="Operations navigation">
        <p className="admin-eyebrow">Operations preview</p>
        <nav>
          {adminNavigation.map((item) => (
            <a key={item.href} href={item.href}>
              <span className="admin-nav-label">{item.label}</span>
              <span className="nav-status" aria-label={item.status}>{item.status}</span>
            </a>
          ))}
        </nav>
        <button type="button" title={compact ? 'Expand navigation' : 'Compact navigation'} onClick={() => setCompact((value) => !value)}>
          {compact ? 'Expand navigation' : 'Compact navigation'}
        </button>
      </aside>
      <main className="admin-content">{children}</main>
    </div>
  );
}
