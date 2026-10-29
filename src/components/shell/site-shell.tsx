import type {ReactNode} from 'react';

import {brand} from '../../config/brand';
import {marketingNavigation, creatorNavigation, getWorkspaceNavigation} from '../../config/navigation';
import {MediaIcon} from '../creation/media-icon';

type SiteShellProps = Readonly<{children: ReactNode; variant?: 'marketing' | 'creator' | 'workspace'; workspaceId?: string}>;

function BrandLogo() {
  return <a className="brand" href="/" aria-label={`${brand.productName} home`}><span className="brand-logo-frame"><img className="brand-logo" src="/brand/shpitto-logo-full.png" alt="" /></span><span className="brand-wordmark">{brand.productName}</span></a>;
}

export function SiteShell({children, variant = 'marketing', workspaceId}: SiteShellProps) {
  const workspace = variant === 'workspace';
  const navigation = workspace ? getWorkspaceNavigation(workspaceId) : marketingNavigation;
  const createHref = workspaceId ? `/dashboard?workspace=${encodeURIComponent(workspaceId)}` : '/dashboard';
  if (variant === 'creator' || workspace) {
    const tools = workspace ? getWorkspaceNavigation(workspaceId) : creatorNavigation;
    return <div className={`site-shell site-shell-${variant} site-shell-tools`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="creator-sidebar">
        <BrandLogo />
        <span className="sidebar-label">CREATE SOMETHING</span>
        <nav aria-label="Primary navigation">{tools.map((item) => <a key={item.href} href={item.href} aria-current={item.href === createHref ? 'page' : undefined}><MediaIcon name={item.icon ?? (item.label === 'Create' ? 'spark' : 'folder')} /><span>{item.label}</span></a>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-tip"><MediaIcon name="spark" /><strong>From idea to first take.</strong><p>Start with a prompt.<br />Make it your own.</p><a href={workspace ? createHref : '/#create'}>Start creating<MediaIcon name="arrow" /></a></div><a className="sidebar-help" href="/docs"><MediaIcon name="help" />Help & guides</a></div>
      </aside>
      <div className="tool-shell-body">
      <header className="creator-topbar"><div className="creator-breadcrumb"><MediaIcon name={workspace ? 'video' : 'home'} /><span>{workspace ? 'Video studio' : 'AI video generator'}</span></div><div className="site-header-actions">{workspace ? <><span className="shell-workspace-badge"><span className="shell-status-dot" /> Private workspace</span><a className="button site-cta" href={createHref}>New creation</a></> : <><a className="site-login-link" href="/login">Log in</a><a className="button site-cta" href="/signup">Get started<MediaIcon name="arrow" /></a></>}</div></header>
        <div id="main-content" tabIndex={-1}>{children}</div>
        <footer className="creator-footer"><span>{brand.productName} · {brand.tagline}</span><a href="/docs">Help & documentation</a></footer>
      </div>
    </div>;
  }
  return (
    <div className={`site-shell site-shell-${variant}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="site-header-inner">
          <BrandLogo />
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
