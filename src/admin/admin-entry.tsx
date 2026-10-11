'use client';

import dynamic from 'next/dynamic';
import {useEffect, useState} from 'react';

import {adminRequest} from './http';
import {SecurityPanel, type AdminSecurity} from './security-panel';
import './admin.css';

const AdminApp = dynamic(() => import('./admin-app'), {ssr: false, loading: () => <p role="status">Loading operations center…</p>});

export function AdminEntry() {
  const [security, setSecurity] = useState<AdminSecurity | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    adminRequest<AdminSecurity>('/api/admin/security').then((value) => {if (active) setSecurity(value);}).catch((reason: unknown) => {if (active) setError(reason instanceof Error ? reason.message : 'Operator access is unavailable.');});
    return () => {active = false;};
  }, []);
  if (security?.mfaComplete) return <AdminApp />;
  return <main className="operations-console"><p className="admin-eyebrow">Operations center</p><h1>Secure your operator session</h1><p>Administrative records become available after second-factor verification.</p>{error ? <p role="alert">{error}</p> : security ? <SecurityPanel onVerified={setSecurity} /> : <p role="status">Checking your current global role…</p>}<p><a href="/dashboard">Return to workspace</a></p></main>;
}
