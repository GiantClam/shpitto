'use client';

import {useRouter} from 'next/navigation';
import {useState} from 'react';

export function InvitationAccept({initialToken = ''}: Readonly<{initialToken?: string}>) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken);
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  async function accept(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch('/api/invitations/accept', {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': `ui-invite-${crypto.randomUUID()}`}, body: JSON.stringify({token})});
      const payload = await response.json().catch(() => null) as {workspaceId?: string; error?: {message?: string} | string} | null;
      const errorValue = payload?.error;
      const errorMessage = errorValue && typeof errorValue === 'object' ? errorValue.message : errorValue;
      if (!response.ok) throw new Error(typeof errorMessage === 'string' ? errorMessage : 'Invitation could not be accepted.');
      setMessage('Invitation accepted.');
      router.push(typeof payload?.workspaceId === 'string' ? `/workspaces/${payload.workspaceId}/settings/members` : '/dashboard/team');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invitation could not be accepted.');
    } finally {
      setWorking(false);
    }
  }
  return <form className="auth-form" onSubmit={accept}><label htmlFor="invitation-token">Invitation token</label><input id="invitation-token" value={token} onChange={(event) => setToken(event.target.value)} minLength={32} maxLength={256} required /><p>Sign in with the invited account first. <a href="/login">Open sign in</a>.</p><button className="button" type="submit" disabled={working}>{working ? 'Accepting…' : 'Accept invitation'}</button>{message ? <p role="status">{message}</p> : null}</form>;
}
