'use client';

import {useEffect, useRef, useState} from 'react';

import {resolveCheckoutHandoff} from './checkout-handoff';

type Product = Readonly<{productKey: string; kind: 'subscription' | 'pack'; credits: string; amountMinor: string; currency: string; interval: 'month' | null}>;
type EmbeddedSession = Readonly<{clientSecret: string; publishableKey: string}>;
type EmbeddedCheckout = Readonly<{mount: (target: HTMLElement) => void; destroy: () => void}>;
type StripeFactory = (publishableKey: string) => Readonly<{
  createEmbeddedCheckoutPage: (options: Readonly<{fetchClientSecret: () => Promise<string>}>) => Promise<EmbeddedCheckout>;
}>;

function loadStripeJs(): Promise<StripeFactory> {
  const current = (window as Window & {Stripe?: StripeFactory}).Stripe;
  if (current) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & {Stripe?: StripeFactory}).Stripe;
      if (loaded) resolve(loaded);
      else reject(new Error('Stripe.js did not load.'));
    };
    script.onerror = () => reject(new Error('Stripe.js could not be loaded.'));
    document.head.appendChild(script);
  });
}

export function FixtureBillingPanel({workspaceId, products, mode = 'fixture'}: Readonly<{workspaceId: string; products: readonly Product[]; mode?: 'fixture' | 'stripe_test'}>) {
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [embedded, setEmbedded] = useState<EmbeddedSession | null>(null);
  const commandKeys = useRef<Record<string, string>>({});
  const mountRef = useRef<HTMLDivElement | null>(null);
  const commandKey = (action: string) => commandKeys.current[action] ??= `billing-${crypto.randomUUID()}`;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'return') setMessage('Payment submitted. Credits appear after the payment is verified.');
  }, []);

  useEffect(() => {
    const session = embedded;
    const target = mountRef.current;
    if (!session || !target) return undefined;
    let destroyed = false;
    let instance: EmbeddedCheckout | undefined;
    void (async () => {
      try {
        const Stripe = await loadStripeJs();
        if (destroyed) return;
        instance = await Stripe(session.publishableKey).createEmbeddedCheckoutPage({fetchClientSecret: () => Promise.resolve(session.clientSecret)});
        if (destroyed) {
          instance.destroy();
          return;
        }
        instance.mount(target);
      } catch (error) {
        if (!destroyed) setMessage(error instanceof Error ? error.message : 'Embedded Checkout could not be opened.');
      }
    })();
    return () => {
      destroyed = true;
      instance?.destroy();
    };
  }, [embedded]);

  async function post(path: string, body: Record<string, unknown>, key: string): Promise<Record<string, unknown>> {
    const response = await fetch(path, {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': key}, body: JSON.stringify(body)});
    const payload = await response.json() as {ok?: boolean; data?: Record<string, unknown>; error?: {message?: string}};
    if (!response.ok || !payload.ok || !payload.data) throw new Error(payload.error?.message ?? 'The billing action could not be completed.');
    return payload.data;
  }
  async function checkout(productKey: string): Promise<void> {
    setWorking(productKey); setMessage(''); setEmbedded(null);
    try {
      const data = await post(`/api/workspaces/${workspaceId}/billing/checkout`, {catalogProductKey: productKey}, commandKey(productKey));
      const handoff = resolveCheckoutHandoff(data);
      if (handoff.action === 'redirect') {
        window.location.assign(handoff.url);
        return;
      }
      if (handoff.action === 'embed') {
        setEmbedded({clientSecret: handoff.clientSecret, publishableKey: handoff.publishableKey});
        setWorking(null);
        return;
      }
      if (handoff.action === 'missing_publishable_key') throw new Error('Card checkout needs the Stripe test publishable key before the payment form can open.');
      throw new Error('Checkout is awaiting verification. Retry this action to check the same purchase.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The checkout could not be opened.');
      setWorking(null);
    }
  }
  async function portal(): Promise<void> {
    setWorking('portal'); setMessage('');
    try {
      const data = await post(`/api/workspaces/${workspaceId}/billing/portal`, {}, commandKey('portal'));
      if (typeof data.portalUrl !== 'string') throw new Error('The billing portal did not return a URL.');
      window.location.assign(data.portalUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The billing portal could not be opened.');
      setWorking(null);
    }
  }
  return <section className="generation-panel fixture-billing-panel" aria-labelledby="fixture-billing-heading">
    <div className="section-heading"><h2 id="fixture-billing-heading">{mode === 'stripe_test' ? 'Stripe test billing' : 'Local Mock billing'}</h2><span>no real charge</span></div>
    <p>{mode === 'stripe_test' ? 'Use a Stripe test card to try monthly credits or a permanent credit pack. Credits appear after the payment is verified.' : 'Use the fixture products to exercise checkout, webhook reconciliation and recovery state end to end.'}</p>
    <div className="fixture-product-list">{products.map((product) => <article className="fixture-product" key={product.productKey}><div><strong>{product.kind === 'subscription' ? 'Monthly credits' : 'Permanent credit pack'}</strong><small>{product.credits} credits{product.interval ? ` · renews monthly` : ' · never expires'}</small></div><div className="fixture-product-action"><strong>{product.currency.toUpperCase()} {(Number(product.amountMinor) / 100).toFixed(2)}</strong><button className="button" type="button" disabled={working !== null} onClick={() => checkout(product.productKey)}>{working === product.productKey ? 'Opening…' : 'Open checkout'}</button></div></article>)}</div>
    {embedded ? <div ref={mountRef} data-checkout-surface="embedded" /> : null}
    <button className="button button-muted" type="button" disabled={working !== null} onClick={portal}>{working === 'portal' ? 'Opening…' : mode === 'stripe_test' ? 'Open billing portal' : 'Open local billing portal'}</button>
    {message ? <p role="alert">{message}</p> : null}
  </section>;
}
