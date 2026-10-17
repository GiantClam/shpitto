'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';
import type {FormEvent} from 'react';
import {MediaIcon} from '../../../components/creation/media-icon';
import {InputCrop} from '../../../components/generation/input-crop';
import {buildGenerationRequest, cropScopeKey, generationChoicesForMode, hasConfirmedCrop} from '../../../components/generation/crop-consent';
import {clearCreationDraft, readCreationDraft, selectCreationDraftModel} from '../../../components/generation/creation-draft';
import type {AspectRatio, GenerationModelChoice, PublicGenerationQuote} from '../../../components/generation/crop-consent';
import type {CropChange} from '../../../components/generation/input-crop';

type Quote = PublicGenerationQuote;
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

export function GenerationPanel({workspaceId, quote, initialTask, modelChoices}: Readonly<{workspaceId: string; quote: Quote; initialTask: InitialTask | null; modelChoices?: readonly GenerationModelChoice[]}>) {
  const router = useRouter();
  // Only the existing local Mock fallback is implicit. Real choices must be admitted server-side.
  const choices: readonly GenerationModelChoice[] = modelChoices ?? (quote.modelId === 'mock-video' ? [{label: 'Mock video (local)', mode: 'text-to-video', quote}] : []);
  const initialModel = choices.find((choice) => choice.quote.modelId === quote.modelId) ?? choices[0];
  const [selectedMode, setSelectedMode] = useState<GenerationModelChoice['mode']>(initialModel?.mode ?? 'text-to-video');
  const [selectedModelId, setSelectedModelId] = useState(quote.modelId);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [crop, setCrop] = useState<(CropChange & Readonly<{scopeKey: string}>) | null>(null);
  const modeChoices = generationChoicesForMode(choices, selectedMode);
  const model = modeChoices.find((choice) => choice.quote.modelId === selectedModelId) ?? modeChoices[0] ?? null;
  const scope = {workspaceId, modelId: selectedModelId, catalogVersion: model?.quote.catalogVersion ?? quote.catalogVersion, aspectRatio};
  const scopeKey = cropScopeKey(scope);
  const [consentScope, setConsentScope] = useState(scopeKey);
  // Reset before committing a changed scope; returning to an old workspace must not revive consent.
  if (consentScope !== scopeKey) {setConsentScope(scopeKey); setCrop(null);}
  const revision = {...scope, revision: crop?.scopeKey === scopeKey ? crop.revision : 0};
  const consent = crop?.scopeKey === scopeKey ? crop.consent : null;
  const imageRequired = selectedMode === 'image-to-video';
  const cropReady = !imageRequired || hasConfirmedCrop(revision, consent);
  const submitting = useRef(false);
  const [prompt, setPrompt] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [latestTask, setLatestTask] = useState<InitialTask | null>(initialTask);
  const draftChecked = useRef(false);
  useEffect(() => {
    if (draftChecked.current) return;
    draftChecked.current = true;
    let storage: Storage;
    try {storage = window.sessionStorage;}
    catch {setMessage('Your browser could not restore the saved draft. Enter your prompt to continue.'); return;}
    const draft = readCreationDraft(storage);
    if (!draft) return;
    // Consume before restoring so a later workspace mount cannot replay the pending draft.
    if (!clearCreationDraft(storage)) {
      setMessage('Your browser could not clear the saved draft. Enter your prompt to continue.');
      return;
    }
    const restoredModel = selectCreationDraftModel(draft, choices);
    setPrompt(draft.prompt);
    setSelectedMode(draft.mode);
    setAspectRatio(draft.aspectRatio);
    setSelectedModelId(restoredModel?.quote.modelId ?? '');
    setCrop(null);
    setMessage(restoredModel
      ? `Draft restored. Review the selected model and credit cost before generating.${draft.mode === 'image-to-video' ? ' Upload your image and confirm its crop to continue.' : ''}`
      : `Draft restored, but no ${draft.mode === 'image-to-video' ? 'image-to-video' : 'text-to-video'} model is available in this workspace. Refresh or explicitly choose an available model, then review its credit cost before generating.`);
  }, []);
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
  function chooseMode(nextMode: GenerationModelChoice['mode']): void {
    const nextChoices = generationChoicesForMode(choices, nextMode);
    setSelectedMode(nextMode);
    setSelectedModelId(nextChoices[0]?.quote.modelId ?? '');
    setCrop(null);
    setMessage('');
    setState('idle');
  }
  return <section className="generation-panel studio-composer">
    <div className="composer-heading"><div><span className="composer-kicker">CREATE · VIDEO STUDIO</span><h2>Give your idea a first frame.</h2><p>Describe the scene, choose your canvas and see where the idea takes you.</p></div><div className="composer-cost"><span>ESTIMATED COST</span><strong>{model ? `${model.quote.totalCost} credits` : 'Unavailable'}</strong></div></div>
    <div className="generation-mode-switch" role="group" aria-label="Video creation mode">
      <button type="button" aria-pressed={selectedMode === 'text-to-video'} disabled={state === 'working'} onClick={() => chooseMode('text-to-video')}><MediaIcon name="video" />Text to video</button>
      <button type="button" aria-pressed={selectedMode === 'image-to-video'} disabled={state === 'working'} onClick={() => chooseMode('image-to-video')}><MediaIcon name="image" />Image to video</button>
    </div>
    <p className="composer-mode">{selectedMode === 'image-to-video' ? 'Animate a still image' : 'Create from a text prompt'} <span>{modeChoices.length} {modeChoices.length === 1 ? 'model' : 'models'} available</span></p>
    <form onSubmit={submit} className="generation-form">
      <div className="composer-fields">
        <div className="composer-field"><label htmlFor="generation-model">Model</label>
      <select id="generation-model" className="studio-select" value={model ? selectedModelId : ''} disabled={state === 'working'} onChange={(event) => {setSelectedModelId(event.target.value); setCrop(null); setMessage('');}}>
        {!model ? <option value="" disabled>No model available for this mode</option> : null}
        {modeChoices.map((choice) => <option key={choice.quote.modelId} value={choice.quote.modelId}>{choice.label} · {choice.quote.totalCost} credits</option>)}
      </select>
        </div>
        <div className="composer-field"><label htmlFor="generation-aspect">Canvas</label>
      <select id="generation-aspect" className="studio-select" value={aspectRatio} disabled={state === 'working'} onChange={(event) => {setAspectRatio(event.target.value as AspectRatio); setCrop(null); setMessage('');}}>
        <option value="16:9">16:9 · Landscape</option><option value="9:16">9:16 · Portrait</option>
      </select>
        </div>
      </div>
      <p className="composer-note"><span>✦</span> Five-second video · 720p · Choose a model and review its credit cost before creating.</p>
      {imageRequired && model ? <InputCrop key={scopeKey} scope={scope} disabled={state === 'working'} onChange={(change) => setCrop({...change, scopeKey})} /> : null}
      <div className="prompt-field"><div className="prompt-label-row"><label htmlFor="generation-prompt">Prompt</label><span>Describe subject · motion · light · mood</span></div>
      <textarea id="generation-prompt" value={prompt} disabled={state === 'working'} onChange={(event) => setPrompt(event.target.value)} maxLength={10000} required placeholder="A midnight product launch in a glass gallery, slow camera push-in, warm reflections, editorial lighting" />
      </div>
      <div className="composer-actions"><button className="button" disabled={state === 'working' || !model || !cropReady} type="submit">{state === 'working' ? 'Queueing…' : 'Generate video ↗'}</button><span>Private to your workspace</span></div>
      {!model ? <p role="status">No admitted {selectedMode === 'image-to-video' ? 'image-to-video' : 'text-to-video'} model is available in this workspace. Refresh or choose another mode.</p> : null}
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
