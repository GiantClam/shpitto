'use client';

import {useEffect, useState, type FormEvent} from 'react';
import {usePermissions, useRefresh} from 'react-admin';

import {executeAffiliateAdminCommand, type AffiliateAdminCommand} from './affiliate-commands';
import {adminRequest} from './http';

type Command = AffiliateAdminCommand['command'];

function Field({name, label, type = 'text'}: Readonly<{name: string; label: string; type?: 'text' | 'number' | 'url'}>) {
  return <label>{label}<input name={name} type={type} required min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} autoComplete="off" /></label>;
}

function inputOf(form: FormData, command: Command): AffiliateAdminCommand {
  const field = (key: string) => String(form.get(key) ?? '').trim();
  const common = {reason: field('reason'), expectedVersion: Number(field('expectedVersion')), idempotencyKey: crypto.randomUUID()};
  if (command === 'policy') return {...common, command, commissionPolicy: field('commissionPolicy') === 'provider_campaign' ? 'provider_campaign' : 'first_payment', providerCampaignRevision: field('providerCampaignRevision'), approvedDashboardOrigin: field('approvedDashboardOrigin'), dashboardUrl: field('dashboardUrl')};
  if (command === 'release-hold') return {...common, command, workspaceId: field('workspaceId'), caseId: field('caseId')};
  return {...common, command, workspaceId: field('workspaceId'), reviewId: field('reviewId')};
}

export function AffiliatePanel() {
  const {permissions} = usePermissions();
  const refresh = useRefresh();
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [command, setCommand] = useState<Command>('approve');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [retry, setRetry] = useState<AffiliateAdminCommand | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const canCommand = permissions === 'operator' || permissions === 'superadmin';

  async function loadStatus() {setStatus(await adminRequest('/api/admin/affiliates/status'));}
  useEffect(() => {
    let active = true;
    adminRequest<Record<string, unknown>>('/api/admin/affiliates/status').then((value) => {if (active) setStatus(value);}).catch((reason: unknown) => {if (active) setError(reason instanceof Error ? reason.message : 'Affiliate status is unavailable.');});
    return () => {active = false;};
  }, []);

  async function execute(input: AffiliateAdminCommand) {
    setPending(true); setError(''); setResult(null);
    try {setResult(await executeAffiliateAdminCommand(input)); await loadStatus(); refresh();}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Affiliate review could not be completed.');}
    finally {setPending(false);}
  }
  function submit(event: FormEvent<HTMLFormElement>) {event.preventDefault(); const input = inputOf(new FormData(event.currentTarget), command); setRetry(input); void execute(input);}

  const hostedUrl = typeof result?.dashboardUrl === 'string' && result.dashboardUrl.startsWith('https://') ? result.dashboardUrl : null;
  return <section className="operations-card"><h2>Affiliate review and hosted settlement</h2><p>Review commission evidence and unresolved holds before approval. A hosted handoff records a reviewed visit; it never means funds were transferred.</p>
    {status ? <><p role="status">Integration: {String(status.integrationStatus)}. {status.integrationStatus === 'disabled' ? 'Affiliate tracking is disabled.' : 'Provider verification is unavailable; approval and hosted handoff remain blocked until authoritative evidence is available.'}</p><details><summary>Integration and account checkpoint status</summary><pre>{JSON.stringify(status, null, 2)}</pre></details></> : !error ? <p role="status">Loading affiliate configuration…</p> : null}
    <p><a href="#/affiliate-reviews">Commission reviews</a> · <a href="#/affiliate-holds">Review holds</a></p>
    {canCommand ? <form key={command} onSubmit={submit} className="operations-form">
      <label>Affiliate command<select value={command} onChange={(event) => {setCommand(event.target.value as Command); setError(''); setResult(null);}}><option value="approve">Approve commission review</option><option value="deny">Deny commission review</option><option value="release-hold">Release a verified legitimate abuse hold</option><option value="handoff">Review hosted payout handoff</option>{permissions === 'superadmin' ? <option value="policy">Review campaign policy</option> : null}</select></label>
      {command === 'policy' ? <><label>Commission policy<select name="commissionPolicy"><option value="first_payment">First effective payment only</option><option value="provider_campaign">Reviewed provider campaign</option></select></label><Field name="providerCampaignRevision" label="Provider campaign revision" /><Field name="approvedDashboardOrigin" label="Approved HTTPS dashboard origin" type="url" /><Field name="dashboardUrl" label="Configured hosted dashboard URL" type="url" /></> : <><Field name="workspaceId" label="Workspace ID" />{command === 'release-hold' ? <Field name="caseId" label="Review hold case ID" /> : <Field name="reviewId" label="Commission review ID" />}</>}
      <Field name="expectedVersion" label={command === 'policy' ? 'Expected policy version' : command === 'release-hold' ? 'Expected hold version' : 'Expected review version'} type="number" /><Field name="reason" label="Recorded review reason" /><button disabled={pending}>Execute affiliate {command}</button>
    </form> : null}
    {retry ? <div className="operations-retry"><p>Last affiliate {retry.command} key: <code>{retry.idempotencyKey}</code></p><button disabled={pending} type="button" onClick={() => void execute(retry)}>Retry previous affiliate {retry.command}</button></div> : null}
    {pending ? <p role="status">Checking current authority and provider evidence…</p> : null}
    {error ? <p role="alert" className="operations-message">{error}</p> : null}
    {result ? <div aria-live="polite"><h3>Recorded command result</h3><pre>{JSON.stringify(result, null, 2)}</pre>{hostedUrl ? <a href={hostedUrl} target="_blank" rel="noopener noreferrer">Open reviewed hosted dashboard</a> : null}</div> : null}
  </section>;
}
