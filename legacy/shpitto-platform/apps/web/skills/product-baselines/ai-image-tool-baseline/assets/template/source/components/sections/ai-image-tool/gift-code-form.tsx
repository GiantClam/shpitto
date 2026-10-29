"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export function GiftCodeForm() {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  async function redeem() { setLoading(true); try { const response = await fetch('/api/gift-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) }); const payload = await response.json().catch(() => ({})); setMessage(payload.ok ? `Added ${payload.creditAmount} credits.` : payload.error || 'Gift code redemption failed.'); if (payload.ok) setCode(''); } finally { setLoading(false); } }
  return <div className="section-stack"><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="FLUX-FREE-2026" /><div className="hero-actions"><button type="button" className="button-primary" disabled={loading || !code.trim()} onClick={redeem}>{loading ? 'Applying...' : 'Apply credit'}</button><a href="/app" className="button-secondary">Back to hub</a></div><p className="auth-hint" role="status">{message}</p></div>;
}
