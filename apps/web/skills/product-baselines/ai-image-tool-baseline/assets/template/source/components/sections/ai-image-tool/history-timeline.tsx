"use client";

import { useEffect, useState } from "react";

type GenerationHistoryItem = { id: string; prompt: string; imageUrl?: string; status: 'succeeded' | 'failed'; error?: string; provider?: string; createdAt?: string };
type HistoryTimelineProps = { title: string; lead: string };

export function HistoryTimeline({ title, lead }: HistoryTimelineProps) {
  const [items, setItems] = useState<GenerationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/generations').then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; items?: GenerationHistoryItem[]; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'History could not be loaded.');
      if (active) setItems(Array.isArray(payload.items) ? payload.items : []);
    }).catch((cause) => {
      if (active) setError(String((cause as Error)?.message || cause || 'History could not be loaded.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="container section-stack">
      <div className="app-shell__header">
        <div className="app-shell__title">
          <p className="eyebrow">History</p>
          <h1>{title}</h1>
          <p>{lead}</p>
        </div>
        <a href="/app/generate" className="button-secondary">New render</a>
      </div>
      <div className="history-grid">
        {loading ? <p className="history-empty">Loading generation history...</p> : error ? <p className="history-empty">{error}</p> : items.length === 0 ? <p className="history-empty">No generations yet. Create an image to start your history.</p> : items.map((item) => (
          <article key={item.id} className="history-card">
            <div className="history-thumb checkerboard" style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}><span className="apple-tag history-thumb__tag">{item.status === "failed" ? "Failed run" : "Saved run"}</span></div>
            <div className="history-meta">
              <h2>{item.status === "failed" ? "Failed run" : "Saved run"}</h2>
              <p>{item.prompt}</p>
              <p>{item.status === "failed" ? item.error || "Retry this run after refining the prompt." : `Provider: ${item.provider || "configured"}. Replay this run, duplicate the prompt, or export the selected image.`}</p>
              {item.status === "succeeded" ? <div className="hero-actions"><a className="button-secondary" href={`/api/generations/${item.id}/image`}>Download</a><button type="button" className="button-secondary" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/api/generations/${item.id}/image`)}>Copy share link</button></div> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
