import {createHash} from 'node:crypto';

import type {BillingCatalogSnapshot} from '../../modules/billing/contracts.ts';

export type BillingCustomerInput = Readonly<{workspaceId: string; idempotencyKey: string}>;
export type BillingCustomerResult = Readonly<{customerId: string}> | Readonly<{unknown: true}>;
export type BillingCheckoutInput = Readonly<{
  attemptId: string;
  workspaceId: string;
  customerId: string;
  idempotencyKey: string;
  catalog: BillingCatalogSnapshot;
}>;
export type BillingCheckoutObservation = Readonly<{
  sessionId: string;
  url: string | null;
  /** Present for an open embedded Checkout Session. Absent for fixture and historical hosted sessions. */
  clientSecret?: string | null;
  status?: 'open' | 'paid' | 'expired' | 'canceled';
}> | Readonly<{unknown: true}>;

export type BillingCheckoutProvider = Readonly<{
  provider: 'fixture' | 'stripe';
  ensureCustomer?(input: BillingCustomerInput): Promise<BillingCustomerResult>;
  createCustomer?(input: BillingCustomerInput): Promise<BillingCustomerResult>;
  retrieveCustomer?(input: Readonly<{workspaceId: string; customerId: string}>): Promise<BillingCustomerResult>;
  retrieveCheckout?(input: BillingCheckoutInput & Readonly<{sessionId: string}>): Promise<BillingCheckoutObservation>;
  createCheckout(input: BillingCheckoutInput): Promise<Readonly<{sessionId: string; url: string | null; clientSecret?: string | null}> | {unknown: true}>;
  createPortal(input: Readonly<{
    workspaceId: string;
    customerId: string;
    idempotencyKey: string;
    returnUrl: string;
  }>): Promise<Readonly<{url: string}>>;
}>;

function fixtureAppUrl(configured: string | undefined): string {
  const value = configured?.trim();
  if (!value) return 'http://localhost:3100';
  try {
    const origin = new URL(value);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) return 'http://localhost:3100';
    return origin.origin;
  } catch {
    return 'http://localhost:3100';
  }
}

/**
 * A deterministic in-process provider for local/test verification. It never
 * opens a network connection or creates a real payment-provider object.
 */
export function createFakeBillingProvider(options: Readonly<{unknownCheckoutKeys?: ReadonlySet<string>; appUrl?: string}> = {}): BillingCheckoutProvider {
  const checkoutResults = new Map<string, Readonly<{sessionId: string; url: string}> | {unknown: true}>();
  const portalResults = new Map<string, Readonly<{url: string}>>();
  return Object.freeze({
    provider: 'fixture' as const,
    async createCheckout(input) {
      const existing = checkoutResults.get(input.idempotencyKey);
      if (existing) return existing;
      if (options.unknownCheckoutKeys?.has(input.idempotencyKey)) {
        const unknown = {unknown: true} as const;
        checkoutResults.set(input.idempotencyKey, unknown);
        return unknown;
      }
      const suffix = createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24);
      const result = Object.freeze({sessionId: `fixture_session_${suffix}`, url: `${fixtureAppUrl(options.appUrl)}/checkout/fixture/${suffix}`});
      checkoutResults.set(input.idempotencyKey, result);
      return result;
    },
    async createPortal(input) {
      const existing = portalResults.get(input.idempotencyKey);
      if (existing) return existing;
      const suffix = createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24);
      const result = Object.freeze({url: `${fixtureAppUrl(options.appUrl)}/billing/portal/fixture/${suffix}`});
      portalResults.set(input.idempotencyKey, result);
      return result;
    },
  });
}
