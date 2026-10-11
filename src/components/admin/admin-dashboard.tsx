'use client';

import {useEffect, useMemo, useState} from 'react';

type Tab = 'workspaces' | 'users' | 'generations' | 'billing' | 'audit';
type Page = Readonly<{items: readonly Record<string, unknown>[]; page: number; pageSize: number; hasMore: boolean}>;

const tabs: readonly {id: Tab; label: string; endpoint: string}[] = [
  {id: 'workspaces', label: 'Workspaces', endpoint: '/api/admin/workspaces'},
  {id: 'users', label: 'Users', endpoint: '/api/admin/users'},
  {id: 'generations', label: 'Generations', endpoint: '/api/admin/generations'},
  {id: 'billing', label: 'Billing', endpoint: '/api/admin/billing'},
  {id: 'audit', label: 'Audit', endpoint: '/api/admin/audit'},
];

function display(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('workspaces');
  const [page, setPage] = useState<Page | null>(null);
  const [role, setRole] = useState<string>('');
  const [error, setError] = useState<string>('');
  const endpoint = useMemo(() => tabs.find((item) => item.id === tab)?.endpoint ?? tabs[0].endpoint, [tab]);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([fetch('/api/admin/me'), fetch(endpoint + '?page=1&pageSize=25')]).then(async ([meResponse, pageResponse]) => {
      const me = await meResponse.json() as {role?: string; error?: string};
      const next = await pageResponse.json() as Page & {error?: {message?: string}};
      if (!active) return;
      if (!meResponse.ok || !pageResponse.ok) throw new Error(next.error?.message ?? me.error ?? 'The admin data could not be loaded.');
      setRole(me.role ?? '');
      setPage(next);
    }).catch((reason: unknown) => {
      if (active) { setPage(null); setError(reason instanceof Error ? reason.message : 'The admin data could not be loaded.'); }
    });
    return () => { active = false; };
  }, [endpoint]);

  const columns = page?.items[0] ? Object.keys(page.items[0]) : [];
  return (
    <section className="admin-dashboard" aria-label="Operations data">
      <div className="admin-toolbar">
        <div>
          <p className="admin-eyebrow">Current role</p>
          <strong>{role || 'Unavailable'}</strong>
        </div>
        <div className="admin-tabs" role="tablist" aria-label="Admin resources">
          {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
        </div>
      </div>
      {error ? <p role="alert" className="status-card status-card-error">{error}</p> : null}
      {!error && !page ? <p className="status-card">Loading operational data…</p> : null}
      {page ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
            <tbody>{page.items.map((row, index) => <tr key={String(row.id ?? index) + '-' + index}>{columns.map((column) => <td key={column}>{display(row[column])}</td>)}</tr>)}</tbody>
          </table>
          {page.items.length === 0 ? <p className="status-card">No records match this view.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
