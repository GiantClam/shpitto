'use client';

import {useState, type FormEvent} from 'react';

import {executeAdminCommand, type AdminCommandInput} from './commands';
import {adminRequest} from './http';

type Locator = Readonly<{workspaceId: string; purpose: string}>;
type Page = Readonly<{page: number; hasMore: boolean; items: ReadonlyArray<{id: string; orderId: string; status: string; amountMinor: string; currency: string; retry: Extract<AdminCommandInput, {command: 'refund'}> | null}>}>;

export function PendingRefunds() {
  const [locator, setLocator] = useState<Locator | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [pending, setPending] = useState(false);

  async function load(input: Locator, nextPage: number) {
    const query = new URLSearchParams({...input, page: String(nextPage), pageSize: '25'});
    setPage(await adminRequest<Page>(`/api/admin/refunds/pending?${query}`));
  }
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const input = {workspaceId: String(form.get('workspaceId')).trim(), purpose: String(form.get('purpose')).trim()};
    setLocator(input); setPending(true); setError(''); setPage(null); setResult(null);
    try {await load(input, 1);} catch (reason) {setError(reason instanceof Error ? reason.message : 'Pending refunds could not be read.');} finally {setPending(false);}
  }
  async function resume(input: Extract<AdminCommandInput, {command: 'refund'}>) {
    setPending(true); setError(''); setResult(null);
    try {setResult(await executeAdminCommand(input)); if (locator) await load(locator, page?.page ?? 1);} catch (reason) {setError(reason instanceof Error ? reason.message : 'Refund reconciliation failed.');} finally {setPending(false);}
  }
  async function navigate(nextPage: number) {
    if (!locator) return;
    setPending(true); setError('');
    try {await load(locator, nextPage);} catch (reason) {setError(reason instanceof Error ? reason.message : 'Pending refunds could not be read.');} finally {setPending(false);}
  }
  return <section className="operations-card"><h2>Resume pending refunds</h2><p>Recover your persisted refund commands after a reload or interrupted response. Recovery uses the original reason, amount, version and command key, even when the billing version has since changed.</p>
    <form onSubmit={inspect} className="operations-form"><label>Workspace ID<input name="workspaceId" required /></label><label>Access purpose<input name="purpose" required /></label><button disabled={pending}>Read my pending refund commands</button></form>
    {page ? <div>{page.items.length === 0 ? <p>No pending refund commands for your account in this workspace.</p> : page.items.map((row) => <article className="operations-retry" key={row.id}><p><strong>{row.status}</strong> · {row.amountMinor} {row.currency.toUpperCase()} minor units</p><p>Order: <code>{row.orderId}</code><br />Refund request: <code>{row.id}</code></p>{row.retry ? <><p>Original key: <code>{row.retry.idempotencyKey}</code> · reviewed version {row.retry.expectedVersion}<br />Reason: {row.retry.reason}</p><button disabled={pending} onClick={() => void resume(row.retry!)}>Resume exact saved refund command</button></> : <p>Original command evidence is incomplete; this request requires audited recovery.</p>}</article>)}<div className="operations-actions"><button disabled={pending || page.page <= 1} onClick={() => void navigate(page.page - 1)}>Previous pending page</button><button disabled={pending || !page.hasMore} onClick={() => void navigate(page.page + 1)}>Next pending page</button></div></div> : null}
    {pending ? <p role="status">Reading or reconciling persisted refund evidence…</p> : null}{error ? <p role="alert" className="operations-message">{error}</p> : null}{result ? <div aria-live="polite"><h3>Refund recovery result</h3><pre>{JSON.stringify(result, null, 2)}</pre></div> : null}
  </section>;
}
