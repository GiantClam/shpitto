'use client';

import {useState, type FormEvent} from 'react';

import type {OperatorRole} from './capabilities';
import {executeAdminCommand, previewAdminRefund, readAdminRecovery, type AdminCommand, type AdminCommandInput} from './commands';
import {adminDataProvider} from './data-provider';
import {SecurityPanel} from './security-panel';
import {AffiliatePanel} from './affiliate-panel';
import {PendingRefunds} from './pending-refunds';
import {WorkspaceDetails} from './workspace-details';

type Result = Readonly<{label: string; data: Record<string, unknown>}>;

function commandInput(form: FormData, command: AdminCommand, idempotencyKey: string): AdminCommandInput {
  const field = (key: string) => String(form.get(key) ?? '').trim();
  const common = {reason: field('reason'), expectedVersion: Number(field('expectedVersion')), idempotencyKey};
  if (command === 'workspace-status') return {...common, command, workspaceId: field('workspaceId'), status: field('status') === 'suspended' ? 'suspended' : 'active'};
  if (command === 'disable-user') return {...common, command, targetUserId: field('targetUserId')};
  if (command === 'role') {
    const role = field('role');
    return {...common, command, targetUserId: field('targetUserId'), role: role === 'support' || role === 'operator' || role === 'superadmin' ? role : null};
  }
  if (command === 'credit-adjust') return {...common, command, workspaceId: field('workspaceId'), amount: field('amount'), grantId: field('grantId') || undefined};
  if (command === 'recovery-sweep') return {...common, command, workspaceId: field('workspaceId')};
  if (command === 'webhook-replay') return {...common, command, workspaceId: field('workspaceId'), inboxId: field('inboxId')};
  return {...common, command, workspaceId: field('workspaceId'), orderId: field('orderId'), purpose: field('purpose'), amountMinor: field('amountMinor') || undefined};
}

function Field({name, label, required = true, type = 'text'}: Readonly<{name: string; label: string; required?: boolean; type?: 'text' | 'number'}>) {
  return <label>{label}<input name={name} required={required} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined} autoComplete="off" /></label>;
}

export function CommandPanel({permissions}: Readonly<{permissions: OperatorRole | null}>) {
  const [command, setCommand] = useState<AdminCommand>('workspace-status');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState<AdminCommandInput | null>(null);
  const canCommand = permissions === 'operator' || permissions === 'superadmin';

  async function run(label: string, action: () => Promise<Record<string, unknown>>) {
    setPending(true); setError(''); setResult(null);
    try { setResult({label, data: await action()}); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The operation could not be completed.'); }
    finally { setPending(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = commandInput(new FormData(event.currentTarget), command, crypto.randomUUID());
    setRetry(input);
    void run('Command result', () => executeAdminCommand(input));
  }

  function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const workspaceId = String(form.get('workspaceId')).trim();
    const purpose = String(form.get('purpose')).trim();
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    void run(action === 'recovery' ? 'Recovery evidence' : 'Workspace detail', async () => action === 'recovery' ? readAdminRecovery(workspaceId, purpose) : (await adminDataProvider.getOne('workspaces', {id: workspaceId, meta: {purpose}})).data);
  }

  return <div className="operations-console">
    <header><p className="admin-eyebrow">Operations center</p><h1>Review and act with context</h1><p>Your current role is <strong>{permissions ?? 'loading'}</strong>. Resource views are redacted and paginated. Every request checks your current server authority.</p><a href="/dashboard">Return to workspace</a></header>
    {canCommand ? <>
      <SecurityPanel onVerified={() => undefined} />
      <section className="operations-card"><h2>Workspace inspection</h2><p>Provide the support purpose before opening tenant details. Recovery retains settled outcomes and labels unknown provider cost.</p><form onSubmit={inspect} className="operations-form"><Field name="workspaceId" label="Workspace ID" /><Field name="purpose" label="Access purpose" /><div className="operations-actions"><button disabled={pending} name="action" value="detail">Read workspace and versions</button><button disabled={pending} name="action" value="recovery">Read recovery evidence</button></div></form></section>
      <section className="operations-card"><h2>Named administrative command</h2><p>Use the current version from the relevant view. A stale version has no effect. Negative credit adjustments also require an unused grant.</p>
        <form key={command} onSubmit={submit} className="operations-form">
          <label>Command<select value={command} onChange={(event) => {setCommand(event.target.value as AdminCommand); setResult(null); setError('');}}>
            <option value="workspace-status">Change workspace status</option><option value="disable-user">Disable account</option><option value="credit-adjust">Adjust credits</option><option value="refund">Request refund</option><option value="recovery-sweep">Sweep expired generation tasks</option><option value="webhook-replay">Replay stored provider notification</option>{permissions === 'superadmin' ? <option value="role">Change global role</option> : null}
          </select></label>
          {command === 'disable-user' || command === 'role' ? <Field name="targetUserId" label="Target user ID" /> : <Field name="workspaceId" label="Workspace ID" />}
          {command === 'workspace-status' ? <label>Status<select name="status"><option value="suspended">Suspended</option><option value="active">Active</option></select></label> : null}
          {command === 'webhook-replay' ? <><Field name="inboxId" label="Inbox ID from recovery evidence" /><p>Processes the authenticated stored observation with its original business identity. This command never submits a new paid generation.</p></> : null}
          {command === 'role' ? <label>Global role<select name="role"><option value="support">Support</option><option value="operator">Operator</option><option value="superadmin">Superadmin</option><option value="none">Revoke role</option></select></label> : null}
          {command === 'credit-adjust' ? <><Field name="amount" label="Credit amount (signed integer)" /><Field name="grantId" label="Grant ID (required for a negative amount)" required={false} /></> : null}
          {command === 'refund' ? <><Field name="orderId" label="Order ID" /><Field name="amountMinor" label="Amount in minor units (blank for full eligible amount)" required={false} /><Field name="purpose" label="Tenant access purpose" /><button type="button" disabled={pending} onClick={(event) => {
            const form = new FormData(event.currentTarget.form!);
            void run('Refund preview', () => previewAdminRefund({workspaceId: String(form.get('workspaceId')).trim(), orderId: String(form.get('orderId')).trim(), purpose: String(form.get('purpose')).trim(), amountMinor: String(form.get('amountMinor')).trim() || undefined}));
          }}>Preview refund eligibility and version</button></> : null}
          <Field name="expectedVersion" label={command === 'credit-adjust' ? 'Expected credit account version' : command === 'role' ? 'Expected role version' : command === 'disable-user' ? 'Expected account access version' : command === 'refund' ? 'Expected refund preview version' : 'Expected workspace version'} type="number" />
          <Field name="reason" label="Recorded reason" />
          <button disabled={pending} type="submit">Execute {command.replaceAll('-', ' ')}</button>
        </form>
        {retry ? <div className="operations-retry"><p>Last {retry.command} command key: <code>{retry.idempotencyKey}</code>. Retry preserves its exact body and version.</p><button disabled={pending} type="button" onClick={() => void run('Retry result', () => executeAdminCommand(retry))}>Retry previous {retry.command} command</button></div> : null}
      </section>
      <PendingRefunds />
      <WorkspaceDetails />
    </> : <section className="operations-card"><h2>Support access</h2><p>Use the navigation to review redacted records. Tenant inspection and mutations require an operator or superadmin role.</p></section>}
    <AffiliatePanel permissions={permissions} />
    {error ? <p role="alert" className="operations-message">{error}</p> : null}
    {pending ? <p role="status">Loading current evidence…</p> : null}
    {result ? <section className="operations-card" aria-live="polite"><h2>{result.label}</h2><pre>{JSON.stringify(result.data, null, 2)}</pre></section> : null}
  </div>;
}
