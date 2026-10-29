'use client';

import {useRouter} from 'next/navigation';
import {useState} from 'react';

type Member = Readonly<{userId: string; email: string; role: string}>;

export function OwnershipTransfer({workspaceId, members}: Readonly<{workspaceId: string; members: ReadonlyArray<Member>}>) {
  const router = useRouter();
  const [targetUserId, setTargetUserId] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  async function transfer(): Promise<void> {
    if (!targetUserId) return;
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/transfer`, {
        method: 'POST',
        headers: {'content-type': 'application/json', 'idempotency-key': `ui-transfer-${crypto.randomUUID()}`},
        body: JSON.stringify({targetUserId}),
      });
      const payload = await response.json().catch(() => null) as {error?: {message?: string} | string} | null;
      const errorValue = payload?.error;
      const errorMessage = errorValue && typeof errorValue === 'object' ? errorValue.message : errorValue;
      if (!response.ok) throw new Error(typeof errorMessage === 'string' ? errorMessage : 'Ownership transfer failed.');
      setTargetUserId('');
      setMessage('Ownership transferred.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ownership transfer failed.');
    } finally {
      setWorking(false);
    }
  }
  const eligible = members.filter((member) => member.role === 'member');
  return <div className="ownership-transfer"><label htmlFor="ownership-target">Transfer ownership</label><div className="inline-form"><select id="ownership-target" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} disabled={working || eligible.length === 0}><option value="">Select a verified member</option>{eligible.map((member) => <option key={member.userId} value={member.userId}>{member.email}</option>)}</select><button className="button button-muted" type="button" disabled={working || !targetUserId} onClick={transfer}>Transfer</button></div>{message ? <p role="status">{message}</p> : null}</div>;
}
