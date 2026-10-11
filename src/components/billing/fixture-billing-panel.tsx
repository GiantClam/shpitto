'use client';

import {useState} from 'react';

type Product = Readonly<{productKey: string; kind: 'subscription' | 'pack'; credits: string; amountMinor: string; currency: string; interval: 'month' | null}>;

export function FixtureBillingPanel({workspaceId, products}: Readonly<{workspaceId: string; products: readonly Product[]}>) {
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  async function post(path: string, body: Record<string, unknown>, key: string): Promise<Record<string, unknown>> {
    const response = await fetch(path, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': key}, body: JSON.stringify(body)});
    const payload = await response.json() as {ok?: boolean; data?: Record<string, unknown>; error?: {message?: string}};
    if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? 'The billing action could not be completed.');
    return payload.data;
  }
  async function checkout(productKey: string): Promise<void> {
    setWorking(productKey); setMessage('');
    try {
      const data = await post(`/api/workspaces/${workspaceId}/billing/checkout`, {catalogProductKey: productKey}, `fixture-checkout-${productKey}-${crypto.randomUUID()}`);
      if (typeof data.checkoutUrl !== 'string') throw new Error('The fixture checkout did not return a session URL.');
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The checkout could not be opened.');
      setWorking(null);
    }
  }
  async function portal(): Promise<void> {
    setWorking('portal'); setMessage('');
    try {
      const data = await post(`/api/workspaces/${workspaceId}/billing/portal`, {}, `fixture-portal-${crypto.randomUUID()}`);
      if (typeof data.portalUrl !== 'string') throw new Error('The fixture portal did not return a URL.');
      window.location.assign(data.portalUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The billing portal could not be opened.');
      setWorking(null);
    }
  }
  return <section className="generation-panel fixture-billing-panel" aria-labelledby="fixture-billing-heading"><div className="section-heading"><h2 id="fixture-billing-heading">Local Mock billing</h2><span>no real charge</span></div><p>Use the fixture products to exercise checkout, webhook reconciliation and recovery state end to end.</p><div className="fixture-product-list">{products.map((product) => <article className="fixture-product" key={product.productKey}><div><strong>{product.kind === 'subscription' ? 'Monthly credits' : 'Permanent credit pack'}</strong><small>{product.credits} credits{product.interval ? ` · renews monthly` : ' · never expires'}</small></div><div className="fixture-product-action"><strong>{product.currency.toUpperCase()} {(Number(product.amountMinor) / 100).toFixed(2)}</strong><button className="button" type="button" disabled={working !== null} onClick={() => checkout(product.productKey)}>{working === product.productKey ? 'Opening…' : 'Open checkout'}</button></div></article>)}</div><button className="button button-muted" type="button" disabled={working !== null} onClick={portal}>{working === 'portal' ? 'Opening…' : 'Open local billing portal'}</button>{message ? <p role="alert">{message}</p> : null}</section>;
}
