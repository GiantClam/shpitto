import {headers} from 'next/headers';
import {and, asc, desc, eq} from 'drizzle-orm';

import {SiteShell} from '../../../components/shell/site-shell';
import {PersonalOnboarding} from '../../../components/workspaces/personal-onboarding';
import {auth, getAuthDatabase} from '../../../lib/auth';
import {workspaceMembers, workspaces} from '../../../db/schema/workspace';
import {generationTasks} from '../../../db/schema/generation';
import {assets} from '../../../db/schema/asset';
import {getCreditBalance, getGenerationRecoveryProjection, type GenerationRecoveryProjection} from '../../../modules/credits/queries';
import {createAssetDownloadToken} from '../../../modules/assets/authorize';
import {getRuntimeProfile, getServerEnv} from '../../../config/env';
import {getOnboardingStatus} from '../../../modules/workspaces/onboard';
import {createServerQuote, DEFAULT_MODEL_ID, getModelCatalog} from '../../../config/models';
import {getProviderModel} from '../../../config/provider-models';
import type {GenerationModelChoice} from '../../../components/generation/crop-consent';
import {GenerationPanel, GenerationRefresh, CancelTaskButton} from './generation-panel';
import {DomainError} from '../../../db/contracts';
import {authorizeWorkspaceAccess} from '../../../modules/workspaces/authorize';
import {requireActiveVerifiedUser} from '../../../modules/workspaces/policy';

export const dynamic = 'force-dynamic';

function recoveryLabel(status: string, recovery: GenerationRecoveryProjection | undefined): string {
  if (status === 'submission_unknown') return `Submission is unknown; reconciliation probes ${recovery?.attempt?.probeCount ?? 0} and stops at ${recovery?.attempt?.reconcileDeadline.toISOString() ?? recovery?.deadlineAt.toISOString() ?? 'the persisted deadline'}.`;
  if (status === 'materializing') return `Output is materializing; ${recovery?.materializationAttempts ?? 0}/8 attempts, deadline ${recovery?.stageDeadlineAt?.toISOString() ?? recovery?.deadlineAt.toISOString() ?? 'persisted deadline'}.`;
  if (status === 'dispatching' || status === 'submitted' || status === 'running') return `Worker recovery remains active until ${recovery?.deadlineAt.toISOString() ?? 'the persisted deadline'}.`;
  if (status === 'queued') return `Queued recovery window ends ${recovery?.queueDeadlineAt.toISOString() ?? recovery?.deadlineAt.toISOString() ?? 'at the persisted deadline'}.`;
  if (status === 'failed') return `Delivery failed${recovery?.failureCode ? ` (${recovery.failureCode})` : ''}; the persisted settlement remains visible.`;
  if (status === 'succeeded') return 'Private output was delivered and the task is terminal.';
  if (status === 'cancelled') return 'Task was cancelled before dispatch and its reservation was released.';
  return 'Persisted recovery state is available.';
}

function RecoveryEvidence({recovery}: Readonly<{recovery: GenerationRecoveryProjection}>) {
  return <div className="task-recovery" aria-label="Recovery evidence">
    <small>recovery version {recovery.version} · next action {recovery.nextActionAt.toISOString()}</small>
    {recovery.attempt ? <small>attempt {recovery.attempt.id} · #{recovery.attempt.attemptNo} · {recovery.attempt.state} · probes {recovery.attempt.probeCount} · reconcile by {recovery.attempt.reconcileDeadline.toISOString()}</small> : <small>no submission attempt recorded</small>}
    {recovery.reservation ? <small>reservation {recovery.reservation.id} · {recovery.reservation.status} · {recovery.reservation.totalCost} credits</small> : <small>no reservation correlation</small>}
    {recovery.event ? <small>event {recovery.event.id} · {recovery.event.eventType} · {recovery.event.status}</small> : <small>no dispatch event correlation</small>}
    {recovery.command ? <small>command {recovery.command.id} · {recovery.command.commandName} · {recovery.command.status}</small> : <small>no command correlation</small>}
    {recovery.release ? <small>release {recovery.release.id} · {recovery.release.entryType} · {recovery.release.amount} credits</small> : null}
  </div>;
}

export default async function DashboardPage({searchParams}: {searchParams: Promise<{workspace?: string | string[]}>}) {
  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;
  if (!userId) {
    return <SiteShell variant="workspace"><main className="page workspace-page"><p className="eyebrow">Workspace</p><h1>Sign in to continue</h1><p>Your projects, generation history and downloads are private to your account.</p><div className="actions"><a className="button" href="/login">Open sign in</a></div></main></SiteShell>;
  }
  const db = getAuthDatabase();
  const unavailable = <SiteShell variant="workspace"><main className="page workspace-page"><p className="eyebrow">Workspace</p><h1>Workspace unavailable</h1><p>This workspace is unavailable to your account.</p><a className="button" href="/dashboard/team">Choose a team</a></main></SiteShell>;
  try {
    await requireActiveVerifiedUser(db, userId);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return unavailable;
    throw error;
  }
  const [memberships, onboarding] = await Promise.all([
    db.select({workspace: workspaces}).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId)).where(and(eq(workspaceMembers.userId, userId), eq(workspaces.status, 'active'))).orderBy(desc(workspaces.createdAt), asc(workspaces.id)),
    getOnboardingStatus(db, userId),
  ]);
  const personalSetup = onboarding.status === 'pending' ? <PersonalOnboarding localDemoFunding={getRuntimeProfile() === 'local'} /> : null;
  const requestedWorkspaceValue = (await searchParams).workspace;
  const requestedWorkspace = Array.isArray(requestedWorkspaceValue) ? requestedWorkspaceValue[0] : requestedWorkspaceValue;
  const workspace = requestedWorkspace === undefined ? memberships[0]?.workspace : memberships.find((row) => row.workspace.id === requestedWorkspace)?.workspace;
  const workspaceLinks = <nav className="actions" aria-label="Choose workspace">{memberships.map(({workspace: item}) => <a className="button button-muted" key={item.id} href={`/dashboard?workspace=${item.id}`} aria-current={workspace?.id === item.id ? 'page' : undefined}>{item.name} · {item.kind}</a>)}</nav>;
  if (!workspace) return <SiteShell variant="workspace"><main className="page workspace-page"><p className="eyebrow">Workspace</p><h1>{requestedWorkspace === undefined ? 'Create a workspace to begin' : 'Workspace unavailable'}</h1><p>{requestedWorkspace === undefined ? 'Generation tasks, credits and assets are isolated by workspace.' : 'This workspace is unavailable to your account. Choose one of your workspaces below.'}</p>{personalSetup}{workspaceLinks}<div className="actions"><a className="button" href="/workspaces/new">Create a team workspace</a><a className="button button-muted" href="/invitations/accept">Accept an invitation</a></div></main></SiteShell>;
  try {
    await authorizeWorkspaceAccess(db, workspace.id, {userId});
  } catch (error) {
    if (error instanceof DomainError && error.code === 'FORBIDDEN') return unavailable;
    throw error;
  }
  const [balance, tasks, readyAssets] = await Promise.all([
    getCreditBalance(db, workspace.id),
    db.select().from(generationTasks).where(eq(generationTasks.workspaceId, workspace.id)).orderBy(desc(generationTasks.createdAt)).limit(12),
    db.select().from(assets).where(eq(assets.workspaceId, workspace.id)).orderBy(desc(assets.createdAt)).limit(12),
  ]);
  const recovery = await getGenerationRecoveryProjection(db, workspace.id, tasks.map((task) => task.id));
  const recoveryByTask = new Map(recovery.map((row) => [row.taskId, row]));
  const acceptanceProfile = getRuntimeProfile() === 'acceptance';
  const catalogProfile = acceptanceProfile ? 'acceptance' : 'local';
  const catalog = getModelCatalog(catalogProfile);
  const modelChoices: readonly GenerationModelChoice[] = Object.freeze([...catalog.values()].map((entry) => Object.freeze({
    label: entry.label,
    mode: getProviderModel(entry.id).mode,
    quote: createServerQuote(entry.id, '1', {profile: catalogProfile}),
  })));
  const quote = modelChoices[0]?.quote ?? createServerQuote(DEFAULT_MODEL_ID, '1');
  return (
    <SiteShell variant="workspace" workspaceId={workspace.id}>
      <main className="page workspace-page">
        <p className="eyebrow">Creative workspace</p>
        <div className="workspace-heading"><div><h1>{workspace.name}</h1><p>Create a video from a prompt or an image. Keep every take in your private workspace.</p></div><div className="heading-actions"><span className={`state-pill state-${workspace.status}`}>{workspace.status}</span>{workspace.kind === 'team' ? <a className="button button-muted" href={`/workspaces/${workspace.id}/billing`}>Billing</a> : null}<a className="button button-muted" href={workspace.kind === 'team' ? `/workspaces/${workspace.id}/settings/members` : '/dashboard/team'}>Team access</a></div></div>
        {workspaceLinks}
        {personalSetup}
        <div className="workspace-grid">
          <div className="workspace-primary">
            <GenerationPanel workspaceId={workspace.id} quote={quote} modelChoices={modelChoices} initialTask={tasks[0] ? {taskId: tasks[0].id, status: tasks[0].status, deadlineAt: tasks[0].deadlineAt.toISOString(), nextActionAt: tasks[0].nextActionAt.toISOString()} : null} />
            {!acceptanceProfile ? <p className="status-card provider-note">Provider integrations are not configured in the local Mock profile.</p> : <p className="status-card provider-note">Provider choices are admitted by the current server quote and acceptance catalog.</p>}
          </div>
          <aside className="studio-guide" aria-label="Creative workspace guide">
            <div className="studio-guide-topline"><span>WORKFLOW</span><span className="studio-guide-live"><i className="shell-status-dot" /> READY</span></div>
            <h2>A few words. A new perspective.</h2>
            <p>Start with one clear prompt. Then refine the model, format and input until the result earns a place in your library.</p>
            <ol><li><span>01</span><div><strong>Describe the scene</strong><small>Use subject, movement, light and mood.</small></div></li><li><span>02</span><div><strong>Choose a format</strong><small>Landscape for campaigns, portrait for social.</small></div></li><li><span>03</span><div><strong>Keep the result</strong><small>Private outputs stay attached to this workspace.</small></div></li></ol>
            <div className="studio-guide-footer"><span>Credits available</span><strong>{balance.available}</strong></div>
          </aside>
        </div>
        <section className="metric-grid" aria-label="Workspace credits">
          <div className="metric"><span>Available</span><strong>{balance.available}</strong></div>
          <div className="metric"><span>Reserved</span><strong>{balance.reserved}</strong></div>
          <div className="metric"><span>Consumed</span><strong>{balance.consumed}</strong></div>
          <div className={`metric ${balance.held ? 'metric-alert' : ''}`}><span>Ledger</span><strong>{balance.held ? 'Review' : 'Reconciled'}</strong></div>
        </section>
        <GenerationRefresh active={tasks.some((task) => !['succeeded', 'failed', 'cancelled'].includes(task.status))} />
        <section className="credit-section" id="credits"><div className="section-heading"><h2>Credit sources</h2><span>{balance.rows.length} grants</span></div>{balance.rows.length === 0 ? <div className="status-card">No credit grants yet.</div> : <div className="credit-list">{balance.rows.map((row) => <article className="credit-row" key={row.grantId}><div><strong>{row.source}</strong><small>{row.originAllocationId ? `returned from allocation ${row.originAllocationId}` : `grant ${row.grantId}`}</small></div><div><span>{row.available} available · {row.reserved} reserved · {row.consumed} consumed · {row.expired} expired · {row.voided} voided</span><small>{row.expiresAt ? `expires ${row.expiresAt}` : 'no expiry'} · {row.reconciled ? 'reconciled' : 'review required'}</small><small>ledger projection {row.ledgerAvailable} available · {row.ledgerReserved} reserved · {row.ledgerConsumed} consumed · {row.ledgerExpired} expired · {row.ledgerVoided} voided</small>{row.allocations.length > 0 ? <small>allocation lineage: {row.allocations.map((allocation) => `${allocation.allocationId} (${allocation.amount}, ${allocation.reservationStatus}, ${allocation.sourceExpiry ? `expires ${allocation.sourceExpiry}` : 'no expiry'})`).join(' · ')}</small> : null}</div></article>)}</div>}</section>
        <section className="asset-section" id="assets"><div className="section-heading"><h2>Private assets</h2><span>{readyAssets.filter((asset) => asset.state === 'ready').length} ready</span></div>{readyAssets.filter((asset) => asset.state === 'ready').length === 0 ? <div className="status-card">No ready assets yet.</div> : <div className="asset-list">{readyAssets.filter((asset) => asset.state === 'ready').map((asset) => { const token = createAssetDownloadToken(getServerEnv().betterAuthSecret, workspace.id, asset.id); return <article className="asset-row" key={asset.id}><div><strong>{asset.purpose}</strong><small>{asset.mime ?? 'binary'} · {asset.bytes?.toString() ?? 'unknown'} bytes</small></div><a className="button button-muted" href={`/api/workspaces/${workspace.id}/assets/${asset.id}/download?token=${encodeURIComponent(token.token)}`}>Download</a></article>; })}</div>}</section>
        <section className="task-section" id="history"><div className="section-heading"><h2>Generation history</h2><span>{tasks.length} recent</span></div>{tasks.length === 0 ? <div className="status-card">No generation tasks yet.</div> : <div className="task-list">{tasks.map((task) => { const taskRecovery = recoveryByTask.get(task.id); return <article className="task-row" key={task.id}><div><strong>{task.mode}</strong><small>{task.id}</small><small>persisted state {task.status} · version {task.version} · materialization attempts {task.materializationAttempts}</small><small>{task.failureCode ? `failure ${task.failureCode}` : 'no failure recorded'}</small><small>{recoveryLabel(task.status, taskRecovery)}</small>{taskRecovery ? <RecoveryEvidence recovery={taskRecovery} /> : <small>Recovery evidence is not available for this persisted task.</small>}</div><div className="task-meta"><span className={`state-pill state-${task.status}`}>{task.status}</span><small>deadline {task.deadlineAt.toISOString()}</small><small>next action {task.nextActionAt.toISOString()}</small>{task.status === 'queued' ? <CancelTaskButton workspaceId={workspace.id} taskId={task.id} /> : null}</div></article>; })}</div>}</section>
      </main>
    </SiteShell>
  );
}
