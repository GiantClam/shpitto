'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {InputCrop} from '../../../components/generation/input-crop';
import {buildGenerationRequest, cropScopeKey, hasConfirmedCrop} from '../../../components/generation/crop-consent';
import type {AspectRatio, GenerationModelChoice, PublicGenerationQuote} from '../../../components/generation/crop-consent';
import type {CropChange} from '../../../components/generation/input-crop';

type Quote = PublicGenerationQuote;
type InitialTask = Readonly<{taskId: string; status: string; deadlineAt: string; nextActionAt: string}>;
type CommandResponse = Readonly<{ok?: boolean; error?: string | {message?: string}; data?: unknown}>;
const selectionStyle = {background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--shell-radius-sm)', minHeight: 'var(--shell-control-height)', minWidth: 0, padding: '.65rem .75rem', width: '100%'};

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

export function GenerationPanel({workspaceId, quote, initialTask, modelChoices}: Readonly<{workspaceId: string; quote: Quote; initialTask: InitialTask | null; modelChoices?: readonly GenerationModelChoice[]}>) {
  const router = useRouter();
  // Only the existing local Mock fallback is implicit. Real choices must be admitted server-side.
  const choices: readonly GenerationModelChoice[] = modelChoices ?? (quote.modelId === 'mock-video' ? [{label: 'Mock video (local)', mode: 'text-to-video', quote}] : []);
  const [selectedModelId, setSelectedModelId] = useState(quote.modelId);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [crop, setCrop] = useState<(CropChange & Readonly<{scopeKey: string}>) | null>(null);
  const model = choices.find((choice) => choice.quote.modelId === selectedModelId);
  const scope = {workspaceId, modelId: selectedModelId, catalogVersion: model?.quote.catalogVersion ?? quote.catalogVersion, aspectRatio};
  const scopeKey = cropScopeKey(scope);
  const [consentScope, setConsentScope] = useState(scopeKey);
  // Reset before committing a changed scope; returning to an old workspace must not revive consent.
  if (consentScope !== scopeKey) {setConsentScope(scopeKey); setCrop(null);}
  const revision = {...scope, revision: crop?.scopeKey === scopeKey ? crop.revision : 0};
  const consent = crop?.scopeKey === scopeKey ? crop.consent : null;
  const imageRequired = model?.mode === 'image-to-video';
  const cropReady = !imageRequired || hasConfirmedCrop(revision, consent);
  const submitting = useRef(false);
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [latestTask, setLatestTask] = useState<InitialTask | null>(initialTask);
  useEffect(() => setLatestTask(initialTask), [initialTask?.taskId, initialTask?.status, initialTask?.deadlineAt, initialTask?.nextActionAt]);
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting.current) return;
    if (!model || !cropReady) {setState('error'); setMessage('Select an available model and confirm its owned image crop before generating.'); return;}
    submitting.current = true;
    setState('working'); setMessage('');
    try {
      const request = buildGenerationRequest(revision, model, prompt, consent);
      const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/generations`, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': `ui-${crypto.randomUUID()}`}, body: JSON.stringify(request)});
      const body = await response.json() as CommandResponse;
      if (!response.ok || !body.ok) throw new Error(errorMessage(body, 'The generation could not be created.'));
      setLatestTask(createdTaskSnapshot(body.data));
      setPrompt(''); setState('idle'); setMessage('Queued. The persisted task state will be reloaded after navigation or a restart.'); router.refresh();
    } catch (error) { setState('error'); setMessage(error instanceof Error ? error.message : 'The generation could not be created.'); }
    finally {submitting.current = false;}
  }
  return <section className="generation-panel">
    <div className="section-heading"><h2>Generate a clip</h2><span>{model ? `${model.quote.totalCost} credits` : 'No available model'}</span></div>
    <form onSubmit={submit} className="generation-form">
      <label htmlFor="generation-model">Model</label>
      <select id="generation-model" style={selectionStyle} value={model ? selectedModelId : ''} disabled={state === 'working'} onChange={(event) => {setSelectedModelId(event.target.value); setCrop(null); setMessage('');}}>
        {!model ? <option value="" disabled>Select an available model</option> : null}
        {choices.map((choice) => <option key={choice.quote.modelId} value={choice.quote.modelId}>{choice.label} · {choice.mode === 'image-to-video' ? 'Image to video' : 'Text to video'} · {choice.quote.totalCost} credits</option>)}
      </select>
      <label htmlFor="generation-aspect">Aspect ratio</label>
      <select id="generation-aspect" style={selectionStyle} value={aspectRatio} disabled={state === 'working'} onChange={(event) => {setAspectRatio(event.target.value as AspectRatio); setCrop(null); setMessage('');}}>
        <option value="16:9">16:9 · Landscape</option><option value="9:16">9:16 · Portrait</option>
      </select>
      <p>Real video preset: approximately five seconds at 720p. Mock is a local simulation.</p>
      {imageRequired ? <InputCrop key={scopeKey} scope={scope} disabled={state === 'working'} onChange={(change) => setCrop({...change, scopeKey})} /> : null}
      <label htmlFor="generation-prompt">Prompt</label>
      <textarea id="generation-prompt" value={prompt} disabled={state === 'working'} onChange={(event) => setPrompt(event.target.value)} maxLength={10000} required placeholder="Describe the clip" />
      <button className="button" disabled={state === 'working' || !model || !cropReady} type="submit">{state === 'working' ? 'Queueing…' : 'Queue generation'}</button>
      {!model ? <p role="status">No admitted model quote is available. Refresh or choose an available model.</p> : null}
      {message ? <p role={state === 'error' ? 'alert' : 'status'}>{message}</p> : null}
    </form>
    {latestTask ? <div className="status-card" aria-live="polite"><strong>Persisted task state</strong><span className={`state-pill state-${latestTask.status}`}>{latestTask.status}</span><small>{latestTask.taskId}</small><small>deadline {formatPersistedDate(latestTask.deadlineAt)} · next action {formatPersistedDate(latestTask.nextActionAt)}</small>{latestTask.status === 'submission_unknown' ? <small>Submission is unknown; wait for reconciliation evidence instead of retrying.</small> : null}{latestTask.status === 'materializing' ? <small>Output is materializing; success requires a private ready asset.</small> : null}</div> : null}
  </section>;
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
