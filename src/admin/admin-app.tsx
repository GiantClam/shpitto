'use client';

import {useEffect, useState} from 'react';

import {AdminDashboard} from '../components/admin/admin-dashboard';
import {AdminShell} from '../components/shell/admin-shell';
import {adminNavigation} from '../config/navigation';
import {getAdminCapabilities, resolveTemplateKind, type AdminView, type OperatorRole} from './capabilities';
import {adminRequest} from './http';
import {AdminResourceView} from './resource-view';
import {CommandPanel} from './command-panel';
import './admin.css';

function viewFromLocation(): AdminView {
  if (typeof window === 'undefined') return 'overview';
  const value = new URLSearchParams(window.location.search).get('view');
  return ['workspaces', 'users', 'generations', 'billing', 'audit', 'affiliate-reviews', 'affiliate-holds', 'operations'].includes(value ?? '') ? value as AdminView : 'overview';
}
export default function AdminApp() {
  const [view, setView] = useState<AdminView>(viewFromLocation);
  const [role, setRole] = useState<OperatorRole | null>(null);
  const [error, setError] = useState('');
  const [templateKind, setTemplateKind] = useState(resolveTemplateKind(typeof window === 'undefined' ? undefined : document.documentElement.dataset.templateKind));
  const capabilities = getAdminCapabilities(templateKind);

  useEffect(() => {
    let active = true;
    adminRequest<{role: OperatorRole}>('/api/admin/me').then((identity) => {if (active) setRole(identity.role);}).catch((reason: unknown) => {if (active) setError(reason instanceof Error ? reason.message : 'Operator access is unavailable.');});
    const onPopState = () => setView(viewFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => {active = false; window.removeEventListener('popstate', onPopState);};
  }, []);

  function openView(nextView: AdminView) {
    const path = nextView === 'overview' ? '/admin' : `/admin?view=${encodeURIComponent(nextView)}`;
    window.history.pushState({}, '', path);
    setView(nextView);
  }

  return <AdminShell role={role} activeView={view} navigation={adminNavigation} onNavigate={(href) => {
    const url = new URL(href, window.location.origin);
    const nextView = url.searchParams.get('view');
    openView(nextView ? nextView as AdminView : 'overview');
  }}>
    <div className="admin-app-bar"><div><p className="admin-eyebrow">{capabilities.templateLabel}</p><span className="admin-breadcrumb">Operations / {view === 'overview' ? 'Overview' : view.replaceAll('-', ' ')}</span></div><label className="admin-template-switch">Template variant<select value={templateKind} onChange={(event) => setTemplateKind(resolveTemplateKind(event.target.value))}><option value="video">Video</option><option value="image">Image</option></select></label></div>
    {error ? <div className="admin-state admin-state-error" role="alert"><strong>Operator session unavailable.</strong><span>{error}</span></div> : null}
    {view === 'overview' ? <AdminDashboard role={role} capabilities={capabilities} onOpenResource={openView} /> : null}
    {view === 'operations' ? <CommandPanel permissions={role} /> : null}
    {view !== 'overview' && view !== 'operations' ? <AdminResourceView resource={view} /> : null}
</AdminShell>;
}
