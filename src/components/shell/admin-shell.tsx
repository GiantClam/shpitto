'use client';

import {useState, type MouseEvent, type ReactNode} from 'react';

import {adminNavigation} from '../../config/navigation';
import type {OperatorRole} from '../../admin/capabilities';

type AdminShellNavigationItem = Readonly<{id: string; label: string; href: string; roles?: readonly OperatorRole[]}>;

export function AdminShell({children, activeView, role, navigation = adminNavigation, onNavigate}: Readonly<{
  children: ReactNode;
  activeView?: string;
  role?: OperatorRole | null;
  navigation?: readonly AdminShellNavigationItem[];
  onNavigate?: (href: string) => void;
}>) {
  const [compact, setCompact] = useState(false);
  const visibleNavigation = navigation.filter((item) => !item.roles || (role ? item.roles.includes(role) : false));

  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(href);
  }

  return (
    <div className={compact ? 'admin-shell admin-shell-compact' : 'admin-shell'}>
      <aside className="admin-sidebar" aria-label="Operations navigation">
        <div className="admin-sidebar-brand">
          <p className="admin-eyebrow">Operations</p>
          <span className="admin-sidebar-subtitle">{role ? `${role} access` : 'Checking access'}</span>
        </div>
        <nav>
          {visibleNavigation.map((item) => (
            <a key={item.id} href={item.href} aria-label={compact ? item.label : undefined} aria-current={activeView === item.id ? 'page' : undefined} onClick={(event) => navigate(event, item.href)}>
              <span className="admin-nav-label">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <a className="admin-sidebar-back" href="/dashboard">Return to workspace</a>
          <button type="button" title={compact ? 'Expand navigation' : 'Compact navigation'} onClick={() => setCompact((value) => !value)}>
            {compact ? 'Expand' : 'Compact'}
          </button>
        </div>
      </aside>
      <main id="admin-content" className="admin-content">{children}</main>
    </div>
  );
}
