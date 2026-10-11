'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import type {FormEvent} from 'react';

type Quote = Readonly<{modelId: string; catalogVersion: number; quantity: string; unitCost: string; totalCost: string; issuedAt: string; quoteHash: string}>;
type InitialTask = Readonly<{taskId: string; status: string; deadlineAt: string; nextActionAt: string}>;
type CommandResponse = Readonly<{ok?: boolean; error?: string | {message?: string}; data?: unknown}>;

function errorMessage(body: CommandResponse, fallback: string): string {
  return typeof body.error === 'string' ? body.error : body.error?.message ?? fallback;
}

function createdTaskSnapshot(data: unknown): InitialTask | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = (data as {value?: unknown}).value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const task = value as {taskId?: unknown; status?: unknown; deadlineAt?: unknown; queueDeadlineAt?: unknown; nextActionAt?: unknown};
  if (typeof task.taskId !== 'string' || typeof task.status !== 'string') return null;
  const deadlineAt = typeof task.deadlineAt === 'string' ? task.deadlineAt : typeof task.queueDeadlineAt === 'string' ? task.queueDeadlineAt : 'persisted deadline';
  return {
    taskId: task.taskId,
    status: task.status,
    deadlineAt,
    nextActionAt: typeof task.nextActionAt === 'string' ? task.nextActionAt : 'persisted next action',
  };
}

function formatPersistedDate(value: string): string {
  if (value === 'persisted deadline' || value === 'persisted next action') return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function GenerationPanel({workspaceId, quote, initialTask}: Readonly<{workspaceId: string; quote: Quote; initialTask: InitialTask | null}>) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [latestTask, setLatestTask] = useState<InitialTask | null>(initialTask);
  useEffect(() => setLatestTask(initialTask), [initialTask?.taskId, initialTask?.status, initialTask?.deadlineAt, initialTask?.nextActionAt]);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState('working'); setMessage('');
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/generations`, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': `ui-${crypto.randomUUID()}`}, body: JSON.stringify({quote, input: {prompt}})});
      const body = await response.json() as CommandResponse;
      if (!response.ok || !body.ok) throw new Error(errorMessage(body, 'The generation could not be created.'));
      setLatestTask(createdTaskSnapshot(body.data));
      setPrompt(''); setState('idle'); setMessage('Queued. The persisted task state will be reloaded after navigation or a restart.'); router.refresh();
    } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : 'The generation could not be created.'); }
  }
  return <section className="generation-panel"><div className="section-heading"><h2>Generate a local clip</h2><span>{quote.totalCost} credits</span></div><form onSubmit={submit} className="generation-form"><label htmlFor="generation-prompt">Prompt</label><textarea id="generation-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={10000} required placeholder="Describe the clip to render locally" /><button className="button" disabled={state === 'working'} type="submit">{state === 'working' ? 'Queueing…' : 'Queue generation'}</button>{message ? <p role={state === 'error' ? 'alert' : 'status'}>{message}</p> : null}</form>{latestTask ? <div className="status-card" aria-live="polite"><strong>Persisted task state</strong><span className={`state-pill state-${latestTask.status}`}>{latestTask.status}</span><small>{latestTask.taskId}</small><small>deadline {formatPersistedDate(latestTask.deadlineAt)} · next action {formatPersistedDate(latestTask.nextActionAt)}</small>{latestTask.status === 'submission_unknown' ? <small>Submission is unknown; wait for reconciliation evidence instead of retrying.</small> : null}{latestTask.status === 'materializing' ? <small>Output is materializing; success requires a private ready asset.</small> : null}</div> : null}</section>;
}

export function CancelTaskButton({workspaceId, taskId}: Readonly<{workspaceId: string; taskId: string}>) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  async function cancel(): Promise<void> {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/generations/${taskId}/cancel`, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': `ui-cancel-${crypto.randomUUID()}`}, body: '{}'});
      const body = await response.json() as CommandResponse;
      if (!response.ok || !body.ok) throw new Error(errorMessage(body, 'The task could not be cancelled.'));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The task could not be cancelled.');
    } finally {
      setWorking(false);
    }
  }
  return <><button className="button button-muted" type="button" onClick={cancel} disabled={working}>{working ? 'Cancelling…' : 'Cancel'}</button>{message ? <p role="alert">{message}</p> : null}</>;
}

export function GenerationRefresh({active}: Readonly<{active: boolean}>) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setInterval(() => router.refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [active, router]);
  return null;
}
