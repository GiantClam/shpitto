'use client';

import {useRouter} from 'next/navigation';
import {useState} from 'react';
import type {FormEvent} from 'react';

import {OwnershipTransfer} from '../../../components/workspaces/ownership-transfer';

type Member = Readonly<{userId: string; email: string; role: string}>;

async function mutation(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': `ui-team-${crypto.randomUUID()}`}, body: JSON.stringify(body)});
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const nested = payload?.error;
    const message = nested && typeof nested === 'object' && typeof (nested as {message?: unknown}).message === 'string'
      ? (nested as {message: string}).message
      : typeof nested === 'string' ? nested : 'The team operation failed.';
    throw new Error(message);
  }
  return payload ?? {};
}

export function TeamPanel({workspaceId, workspaceKind = 'team', members, viewerRole}: Readonly<{workspaceId?: string; workspaceKind?: string; members: ReadonlyArray<Member>; viewerRole?: string}>) {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [invitationUrl, setInvitationUrl] = useState('');
  const [working, setWorking] = useState(false);
  async function createTeam(event: FormEvent): Promise<void> { event.preventDefault(); setWorking(true); setMessage(''); try { const result = await mutation('/api/workspaces', {workspaceName: teamName}); const id = typeof result.workspaceId === 'string' ? result.workspaceId : ''; if (id) window.location.assign(`/workspaces/${id}/settings/members`); else setMessage('Team workspace created.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'The team operation failed.'); } finally { setWorking(false); } }
  async function invite(event: FormEvent): Promise<void> { event.preventDefault(); if (!workspaceId) return; setWorking(true); setMessage(''); setInvitationUrl(''); try { const result = await mutation(`/api/workspaces/${workspaceId}/invitations`, {email}); setEmail(''); setMessage('Invitation created.'); if (typeof result.acceptanceUrl === 'string') setInvitationUrl(result.acceptanceUrl); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'The invitation failed.'); } finally { setWorking(false); } }
  async function remove(userId: string): Promise<void> { if (!workspaceId) return; setWorking(true); try { await mutation(`/api/workspaces/${workspaceId}/members/${userId}/remove`, {}); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : 'The member operation failed.'); } finally { setWorking(false); } }
  const owner = workspaceKind === 'team' && viewerRole === 'owner';
  const isTeam = workspaceKind === 'team';
  return <section className="team-panel"><div className="section-heading"><h2>{isTeam ? 'Team workspace' : 'Personal workspace'}</h2><span>{members.length ? `${members.length} members` : 'No members'}</span></div>{!workspaceId ? <form className="inline-form" onSubmit={createTeam}><input aria-label="Team name" value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" required /><button className="button" disabled={working}>Create team</button></form> : <>{owner ? <><form className="inline-form" onSubmit={invite}><input aria-label="Invite email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" required /><button className="button" disabled={working}>Invite member</button></form>{invitationUrl ? <p role="status">Local acceptance link: <a href={invitationUrl}>{invitationUrl}</a></p> : null}</> : null}<div className="member-list">{members.map((member) => <div className="member-row" key={member.userId}><span>{member.email}<small>{member.role}</small></span>{owner && member.role === 'member' ? <button className="button button-muted" type="button" disabled={working} onClick={() => remove(member.userId)}>Remove</button> : null}</div>)}</div>{owner ? <OwnershipTransfer workspaceId={workspaceId} members={members} /> : null}</>}{message ? <p role="status">{message}</p> : null}</section>;
}
