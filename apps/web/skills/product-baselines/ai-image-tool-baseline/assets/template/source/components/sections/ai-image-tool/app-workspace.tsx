"use client";

import { useState } from "react";

type GenerationHistoryItem = {
  id: string;
  prompt: string;
  status: 'succeeded' | 'failed';
  imageUrl?: string;
  error?: string;
};

type GenerateResponse = {
  ok: boolean;
  result?: { id: string; prompt: string; imageUrl: string; summary: string; provider?: string };
  error?: string;
  historyItem?: GenerationHistoryItem;
};

type GenerateConsoleProps = {
  title: string;
  lead: string;
};

const modelOptions = ['flux-1.1-pro', 'flux-dev', 'flux-schnell'] as const;
const aspectRatioOptions = ['1:1', '3:4', '4:3', '16:9', '9:16'] as const;

const INITIAL_PROMPT = 'cinematic portrait of a ceramic astronaut, rim light, 85mm lens, high detail, deep indigo background';

export function GenerateConsole({ title, lead }: GenerateConsoleProps) {
  const [prompt, setPrompt] = useState(INITIAL_PROMPT);
  const [status, setStatus] = useState<'idle' | 'loading' | 'succeeded' | 'failed'>('idle');
  const [result, setResult] = useState<GenerateResponse['result'] | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [model, setModel] = useState<(typeof modelOptions)[number]>('flux-1.1-pro');
  const [aspectRatio, setAspectRatio] = useState<(typeof aspectRatioOptions)[number]>('1:1');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [referenceUploadError, setReferenceUploadError] = useState('');
  async function uploadReference(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.set('file', file); const response = await fetch('/api/assets/reference', { method: 'POST', body: form }); const payload = await response.json().catch(() => ({})); if (payload.ok) { setReferenceImageUrl(payload.url); setReferenceUploadError(''); } else setReferenceUploadError(payload.error || 'Reference upload failed.'); }

  async function runGeneration() {
    setStatus('loading');
    setError('');
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, model, aspectRatio, referenceImageUrl: referenceImageUrl || undefined }),
    });
    const payload = (await response.json()) as GenerateResponse;
    if (!response.ok || !payload.ok || !payload.result) {
      setStatus('failed');
      setResult(null);
      setError(payload.error || 'Generation failed.');
      const failedHistoryItem = payload.historyItem;
      if (failedHistoryItem) setHistory((current) => [failedHistoryItem, ...current].slice(0, 4));
      return;
    }
    const resultItem = payload.result;
    setStatus('succeeded');
    setResult(resultItem);
    setHistory((current) => [payload.historyItem || { id: resultItem.id, prompt: resultItem.prompt, status: 'succeeded', imageUrl: resultItem.imageUrl }, ...current].slice(0, 4));
  }

  function replayHistory(item: GenerationHistoryItem) {
    setPrompt(item.prompt);
    if (item.status === 'failed') {
      setStatus('failed');
      setResult(null);
      setError(item.error || 'Retry last failed run');
      return;
    }
    setStatus('succeeded');
    setError('');
    setResult(item.imageUrl ? { id: item.id, prompt: item.prompt, imageUrl: item.imageUrl, summary: 'Replayed from local history.' } : null);
  }

  return (
    <section className="container section-stack">
      <div className="app-shell__header">
        <div className="app-shell__title">
          <p className="eyebrow">Generator workspace</p>
          <h1>{title}</h1>
          <p>{lead}</p>
        </div>
        <a href="/app/history" className="button-secondary">View history</a>
      </div>
      <div className="playground-shell">
        <div className="playground-column">
          <article className="playground-card control-stack">
            <div className="playground-toolbar">
              <div className="playground-toolbar__meta"><span>FLUX.1 Playground</span><span>Provider workspace</span></div>
              <span className="token-pill">Provider-backed generation</span>
            </div>
            <div className="prompt-box">
              <div className="control-row"><span className="control-label">Prompt</span><span className="control-value">Generator input</span></div>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <div className="token-list">
                <span className="token-pill">portrait</span>
                <span className="token-pill">studio light</span>
                <span className="token-pill">flux.1</span>
                <span className="token-pill">editorial detail</span>
              </div>
            </div>
            <label className="control-row"><span className="control-label">Model</span><select value={model} onChange={(event) => setModel(event.target.value as typeof model)}><option value="flux-1.1-pro">FLUX 1.1 Pro</option><option value="flux-dev">FLUX Dev</option><option value="flux-schnell">FLUX Schnell</option></select></label>
            <label className="control-row"><span className="control-label">Aspect ratio</span><select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}>{aspectRatioOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="control-row"><span className="control-label">Reference image</span><input type="file" accept="image/*" onChange={uploadReference} /><input type="url" value={referenceImageUrl} onChange={(event) => setReferenceImageUrl(event.target.value)} placeholder="https://... (optional)" /></label>
            {referenceUploadError ? <p className="auth-hint">{referenceUploadError}</p> : null}
            <div className="hero-actions">
              <button type="button" className="button-primary" onClick={runGeneration} disabled={status === "loading"}>{status === "loading" ? "Generating..." : "Generate image"}</button>
              <a href="/app/history" className="button-secondary">History</a>
              <a href="/app/order" className="button-secondary">Billing</a>
            </div>
          </article>
        </div>
        <div className="playground-column">
          <article className="playground-card playground-output">
            <div className="hero-preview-bar"><span>Result preview</span><span>{status === "succeeded" ? "Ready" : status === "failed" ? "Failed" : status === "loading" ? "Running" : "Draft"}</span></div>
            <div className="preview-stage checkerboard" style={result ? { backgroundImage: `url(${result.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
            <div className="playground-status">
              <h3>Run status</h3>
              <p>{status === "succeeded" ? result?.summary || "Generation completed." : status === "failed" ? error || "Latest render failed. Refine the prompt and retry." : status === "loading" ? "Generation in progress. The configured provider is processing this request." : "Prompt, run, and review from one product-owned workspace."}</p>
              {result?.imageUrl ? <div className="hero-actions" style={{ marginTop: "14px" }}><a className="button-secondary" href={result.imageUrl} target="_blank" rel="noreferrer">Open image</a><a className="button-secondary" href={`/api/generations/${result.id}/image`}>Download</a></div> : null}
              <div className="hero-actions" style={{ marginTop: "14px" }}>
                <button type="button" className="button-secondary" onClick={() => { setPrompt(prompt || INITIAL_PROMPT); void runGeneration(); }}>Retry last failed run</button>
              </div>
            </div>
          </article>
          <div className="playground-history">
            {history.length === 0 ? <p className="history-empty">No generations yet. Your rendered images will appear here.</p> : history.map((item) => (
              <button key={item.id} type="button" className="history-card" onClick={() => replayHistory(item)} style={{ textAlign: "left", cursor: "pointer" }}>
                <div className="history-thumb checkerboard" style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span className="apple-tag history-thumb__tag">{item.status === "failed" ? "Failed run" : "Saved run"}</span></div>
                <div className="history-meta">
                  <h3 style={{ margin: 0 }}>{item.status === "failed" ? "Failed run" : "Saved run"}</h3>
                  <p>{item.prompt}</p>
                  <p>{item.status === "failed" ? item.error || "Replay this failed run after refining prompt structure." : "Replay this run, duplicate the prompt, or export the selected image."}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
