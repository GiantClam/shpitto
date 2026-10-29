'use client';

import {useState} from 'react';

type Action = 'success' | 'failed' | 'refund' | 'dispute';

export function FixtureCheckoutClient({sessionId, workspaceId, status}: Readonly<{sessionId: string; workspaceId: string; status: string}>) {
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState<Action | null>(null);
  const [currentStatus, setCurrentStatus] = useState(status);
  async function run(action: Action): Promise<void> {
    setWorking(action);
    setMessage('');
    try {
      const response = await fetch(`/api/checkout/fixture/${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        headers: {'content-type': 'application/json', 'idempotency-key': `fixture-${action}-${sessionId}`},
        body: JSON.stringify({action}),
      });
      const payload = await response.json() as {ok?: boolean; data?: {reconciliation?: {status?: string; replayed?: boolean}}; error?: {message?: string}};
      if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? 'The fixture payment could not be completed.');
      const result = payload.data?.reconciliation;
      if (result?.status) setCurrentStatus(result.status);
      setMessage(result?.replayed ? 'This fixture event was already applied safely.' : `Fixture event applied: ${result?.status ?? 'accepted'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The fixture payment could not be completed.');
    } finally {
      setWorking(null);
    }
  }
  const settled = currentStatus === 'paid' || currentStatus === 'recovery' || currentStatus === 'held';
  return <div className="fixture-actions"><p className="fixture-note">Current state: <strong>{currentStatus}</strong></p><div className="actions"><button className="button" type="button" disabled={working !== null || settled} onClick={() => run('success')}>{working === 'success' ? 'Applying…' : 'Simulate successful payment'}</button><button className="button button-muted" type="button" disabled={working !== null || settled} onClick={() => run('failed')}>{working === 'failed' ? 'Applying…' : 'Simulate failed payment'}</button>{settled ? <><button className="button button-muted" type="button" disabled={working !== null} onClick={() => run('refund')}>{working === 'refund' ? 'Applying…' : 'Simulate refund'}</button><button className="button button-muted" type="button" disabled={working !== null} onClick={() => run('dispute')}>{working === 'dispute' ? 'Applying…' : 'Simulate dispute'}</button></> : null}<a className="button button-muted" href={`/workspaces/${workspaceId}/billing`}>Return to billing</a></div>{message ? <p role="status" aria-live="polite">{message}</p> : null}</div>;
}
