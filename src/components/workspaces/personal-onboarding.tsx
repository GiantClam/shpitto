'use client';

import {useRouter} from 'next/navigation';
import {useRef, useState, type FormEvent} from 'react';

type SetupResponse = Readonly<{status?: string; workspaceId?: string; error?: string | {message?: string}}>;

export function PersonalOnboarding({localDemoFunding}: Readonly<{localDemoFunding: boolean}>) {
  const router = useRouter();
  const commandKey = useRef<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState('Personal workspace');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  async function complete(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setWorking(true);
    setMessage('');
    commandKey.current ??= `ui-onboarding-${crypto.randomUUID()}`;
    try {
      const response = await fetch('/api/onboarding', {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': commandKey.current}, body: JSON.stringify({workspaceName})});
      const payload = await response.json() as SetupResponse;
      const error = typeof payload.error === 'string' ? payload.error : payload.error?.message;
      if (!response.ok || payload.status !== 'complete' || typeof payload.workspaceId !== 'string') throw new Error(error ?? 'Your personal workspace could not be set up. Please try again.');
      setMessage('Your personal workspace is ready.');
      router.push(`/dashboard?workspace=${encodeURIComponent(payload.workspaceId)}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your personal workspace could not be set up. Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return <section className="generation-panel" aria-labelledby="personal-setup-heading"><h2 id="personal-setup-heading">Set up your personal workspace</h2><p>A private space for your generation tasks and assets. You can also join or create team workspaces.</p>{localDemoFunding ? <p>Includes 100 local demo credits to generate your first Mock clip.</p> : null}<form className="auth-form" onSubmit={complete} aria-busy={working}><label htmlFor="personal-workspace-name">Personal workspace name</label><input id="personal-workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} minLength={1} maxLength={100} required disabled={working} /><button className="button" type="submit" disabled={working}>{working ? 'Setting up…' : 'Complete personal setup'}</button>{message ? <p role="status" aria-live="polite">{message}</p> : null}</form></section>;
}
