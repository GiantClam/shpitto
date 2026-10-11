import type {ReactNode} from 'react';

import {brand} from '../../config/brand';
import {marketingNavigation} from '../../config/navigation';

export function SiteShell({children}: Readonly<{children: ReactNode}>) {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="brand" href="/" aria-label={`${brand.productName} home`}>
            <img className="brand-logo" src="/brand/shpitto-logo-full.png" alt={brand.productName} />
          </a>
          <nav aria-label="Primary navigation">
            {marketingNavigation.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
                {item.status ? <span className="nav-status">{item.status}</span> : null}
              </a>
            ))}
          </nav>
          <div className="site-header-actions">
            <a className="site-login-link" href="/login">Log in</a>
            <a className="button site-cta" href="/dashboard">Start building</a>
          </div>
        </div>
      </header>
      <div id="main-content" tabIndex={-1}>
        {children}
      </div>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <p>{brand.productName} · code you own, workflows you reuse.</p>
          <a href="/docs">Read the template contract</a>
        </div>
      </footer>
    </div>
  );
}
