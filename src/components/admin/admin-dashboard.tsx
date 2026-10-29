'use client';

import {Badge} from '../ui/badge';
import {Card, CardContent, CardHeader} from '../ui/card';
import type {AdminCapabilityManifest, OperatorRole} from '../../admin/capabilities';

export function AdminDashboard({role, capabilities, onOpenResource}: Readonly<{
  role: OperatorRole | null;
  capabilities: AdminCapabilityManifest;
  onOpenResource: (resource: 'workspaces' | 'users' | 'generations' | 'billing' | 'audit') => void;
}>) {
  const supportedVariantCapabilities = Object.values(capabilities.capabilities).filter((capability) => capability.runtimeSupported);
  const contractOnlyCapabilities = Object.values(capabilities.capabilities).filter((capability) => !capability.runtimeSupported);
  return <div className="admin-overview">
    <div className="admin-page-heading"><div><p className="admin-eyebrow">Operations overview</p><h1>Review the system with context</h1><p>Every read is session-bound and server-authorized. Protected changes stay behind named commands, reason capture, expected versions and idempotency.</p></div><Badge variant={role === 'superadmin' ? 'accent' : 'neutral'}>{role ?? 'checking role'}</Badge></div>
    <div className="admin-metric-grid">
      {(['workspaces', 'users', 'generations', 'billing', 'audit'] as const).map((resource) => <button key={resource} className="admin-metric-card" type="button" onClick={() => onOpenResource(resource)}><span>{resource === 'generations' ? 'Generation tasks' : resource[0].toUpperCase() + resource.slice(1)}</span><strong>Open view</strong><small>Server-backed, bounded read</small></button>)}
    </div>
    <div className="admin-overview-grid">
      <Card><CardHeader><p className="admin-eyebrow">Template capability</p><h2>{capabilities.templateLabel}</h2></CardHeader><CardContent><p>Shared administration modules are declared once and variant controls are selected by this manifest.</p><ul className="admin-capability-list"><li><Badge variant="success">Available</Badge> {supportedVariantCapabilities.length} runtime-backed media {supportedVariantCapabilities.length === 1 ? 'capability' : 'capabilities'}</li><li><Badge variant="neutral">Common</Badge> {capabilities.commonModules.length} shared operational modules</li>{Object.values(capabilities.capabilities).map((capability) => <li key={capability.id}><Badge variant={capability.runtimeSupported ? 'success' : 'warning'}>{capability.runtimeSupported ? 'Available' : 'Withheld'}</Badge><span><strong>{capability.label}</strong>{capability.fields.length ? ` · fields: ${capability.fields.join(', ')} · actions: ${capability.actions.join(', ')}` : ` · ${capability.note}`}</span></li>)}</ul></CardContent></Card>
      <Card><CardHeader><p className="admin-eyebrow">Authority boundary</p><h2>Server outcomes are the source of truth</h2></CardHeader><CardContent><ul className="admin-capability-list"><li>Better Auth owns the session.</li><li>Global operator roles are checked on every request.</li><li>Allowlisted reads and named commands own data access.</li><li>Audit, idempotency, transactions and migrations remain outside the UI layer.</li></ul></CardContent></Card>
    </div>
  </div>;
}
