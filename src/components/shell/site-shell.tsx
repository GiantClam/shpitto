import type {ReactNode} from 'react';

import {brand} from '../../config/brand';
import {marketingNavigation, getWorkspaceNavigation} from '../../config/navigation';

type SiteShellProps = Readonly<{children: ReactNode; variant?: 'marketing' | 'workspace'; workspaceId?: string}>;

export function SiteShell({children, variant = 'marketing', workspaceId}: SiteShellProps) {
  const workspace = variant === 'workspace';
  const navigation = workspace ? getWorkspaceNavigation(workspaceId) : marketingNavigation;
  const createHref = workspaceId ? `/dashboard?workspace=${encodeURIComponent(workspaceId)}` : '/dashboard';
  return (
    <div className={`site-shell site-shell-${variant}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="/" aria-label={`${brand.productName} home`}>
            <span className="brand-logo-frame"><img className="brand-logo" src="/brand/shpitto-logo-full.png" alt={brand.productName} /></span>
          </a>
          <nav aria-label="Primary navigation">
            {navigation.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
                {item.status ? <span className="nav-status">{item.status}</span> : null}
              </a>
            ))}
          </nav>
          <div className="site-header-actions">
            {workspace ? <span className="shell-workspace-badge"><span className="shell-status-dot" /> Studio</span> : <a className="site-login-link" href="/login">Log in</a>}
            <a className="button site-cta" href={createHref}>{workspace ? 'New creation' : 'Start creating'}</a>
          </div>
        </div>
      </header>
      <div id="main-content" tabIndex={-1}>
        {children}
      </div>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div><strong>{brand.productName}</strong><p>{brand.tagline}</p></div>
          <div className="site-footer-links"><a href="/#explore">Explore</a><a href={createHref}>Create a video</a><a href="/docs">Docs</a></div>
        </div>
      </footer>
    </div>
  );
}
