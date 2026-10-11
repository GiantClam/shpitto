'use client';

import {useState, type FormEvent} from 'react';

import type {WorkspaceDetailPage, WorkspaceDetailSection} from '../modules/operations/workspace-details';
import {adminRequest} from './http';

type Locator = Readonly<{workspaceId: string; purpose: string; section: WorkspaceDetailSection}>;

export function WorkspaceDetails() {
  const [locator, setLocator] = useState<Locator | null>(null);
  const [page, setPage] = useState<WorkspaceDetailPage | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function load(input: Locator, nextPage: number) {
    setPending(true); setError('');
    try {
      const query = new URLSearchParams({purpose: input.purpose, section: input.section, page: String(nextPage), pageSize: '25'});
      setPage(await adminRequest<WorkspaceDetailPage>(`/api/admin/workspaces/${encodeURIComponent(input.workspaceId)}/details?${query}`));
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Workspace records could not be read.');}
    finally {setPending(false);}
  }
  function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const input = {workspaceId: String(form.get('workspaceId')).trim(), purpose: String(form.get('purpose')).trim(), section: String(form.get('section')) as WorkspaceDetailSection};
    setLocator(input); setPage(null); void load(input, 1);
  }
  const columns = page?.items[0] ? Object.keys(page.items[0]) : [];
  return <section className="operations-card"><h2>Workspace records</h2><p>Read memberships, subscription state, credit grants and immutable ledger entries for one workspace. Each page records your access purpose.</p>
    <form onSubmit={inspect} className="operations-form"><label>Workspace ID<input name="workspaceId" required /></label><label>Access purpose<input name="purpose" required minLength={3} maxLength={500} /></label><label>Records<select name="section"><option value="memberships">Memberships</option><option value="subscriptions">Subscriptions</option><option value="grants">Credit grants</option><option value="ledger">Credit ledger</option></select></label><button disabled={pending}>Read workspace records</button></form>
    {page ? <div><p>{page.section} · workspace <code>{page.workspaceId}</code> · page {page.page}</p>{page.items.length ? <div style={{overflowX: 'auto'}}><table className="operations-table"><thead><tr>{columns.map((column) => <th key={column} scope="col">{column.replaceAll(/([a-z])([A-Z])/g, '$1 $2')}</th>)}</tr></thead><tbody>{page.items.map((row) => <tr key={String(row.id)}>{columns.map((column) => <td key={column}>{row[column] === null ? '—' : String(row[column])}</td>)}</tr>)}</tbody></table></div> : <p>No records on this page.</p>}<div className="operations-actions"><button disabled={pending || page.page <= 1} onClick={() => locator && void load(locator, page.page - 1)}>Previous records page</button><button disabled={pending || !page.hasMore} onClick={() => locator && void load(locator, page.page + 1)}>Next records page</button></div></div> : null}
    {pending ? <p role="status">Reading workspace records…</p> : null}{error ? <p role="alert" className="operations-message">{error}</p> : null}
  </section>;
}
