"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { TemplateGiftCode } from "../../../lib/billing-store";

export function AdminGiftCodesPanel({ initialItems }: { initialItems: TemplateGiftCode[] }) {
  const [items, setItems] = useState(initialItems);
  const [creditAmount, setCreditAmount] = useState('100');
  const [expiresAt, setExpiresAt] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('');
    try {
      const response = await fetch('/api/admin/gift-codes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ creditAmount: Number(creditAmount), expiresAt: expiresAt || undefined }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.item) { setMessage(payload.error || 'Gift code creation failed.'); return; }
      setItems((current) => [payload.item, ...current]); setMessage(`Created ${payload.item.code}.`);
    } finally { setLoading(false); }
  }
  return (
    <div className="section-stack">
      <form className="cms-panel cms-form-grid" onSubmit={createCode}>
        <div><p className="eyebrow">Create code</p><h2>Issue credits</h2><p>Codes are single-use and are redeemed inside the authenticated app.</p></div>
        <label>Credits<input type="number" min="1" max="100000" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} required /></label>
        <label>Expires at<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
        <div className="hero-actions"><button className="button-primary" type="submit" disabled={loading}>{loading ? "Creating..." : "Create gift code"}</button>{message ? <span className="cms-source">{message}</span> : null}</div>
      </form>
      <div className="cms-table">
        <div className="cms-table__head"><span>Code</span><span>Credits</span><span>Status</span><span>Expires</span><span>Created</span></div>
        {items.map((item) => <div key={item.code} className="cms-table__row"><span><strong>{item.code}</strong><small>{item.usedBy ? `Used by ${item.usedBy}` : "Single-use code"}</small></span><span>{item.creditAmount}</span><span className={item.usedBy ? "cms-status cms-status--needs-attention" : "cms-status cms-status--ready"}>{item.usedBy ? "used" : "available"}</span><span>{item.expiresAt || "Never"}</span><span>{item.createdAt}</span></div>)}
        {!items.length ? <p className="cms-note">No gift codes have been created yet.</p> : null}
      </div>
    </div>
  );
}
