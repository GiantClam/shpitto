import {DomainError} from '../db/contracts.ts';
import {parseBillingCatalogSnapshot, type BillingCatalogSnapshot} from '../modules/billing/contracts.ts';

export type StripeTestConfiguration = Readonly<{
  secretKey: string;
  webhookSecret: string;
  portalConfigurationId: string;
  publishableKey: string | null;
  appUrl: string;
  catalog: readonly BillingCatalogSnapshot[];
}>;

/** Explicit acceptance-only activation keeps existing local tests offline. */
export function parseStripeTestConfiguration(input: Readonly<{
  driver: string; runtimeProfile: string; secretKey: string; webhookSecret: string;
  portalConfigurationId: string; appUrl: string; catalogJson: string; publishableKey: string;
}>): StripeTestConfiguration | null {
  if (!input.driver || input.driver === 'fixture') return null;
  if (input.driver !== 'stripe_test' || input.runtimeProfile !== 'acceptance' || !/^sk_test_[A-Za-z0-9]+$/.test(input.secretKey)) {
    throw new DomainError('CONFLICT', 'Stripe test billing requires the explicit acceptance profile and a test key.');
  }
  let origin: URL;
  try { origin = new URL(input.appUrl); } catch { throw new DomainError('VALIDATION', 'The configured billing origin is invalid.'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new DomainError('VALIDATION', 'Stripe test billing requires an HTTPS application origin.');
  }
  if (!input.webhookSecret || !/^bpc_[A-Za-z0-9]+$/.test(input.portalConfigurationId)) {
    throw new DomainError('CONFLICT', 'Stripe test webhook verification and portal configuration are required.');
  }
  const publishableKey = input.publishableKey.trim();
  if (publishableKey && !/^pk_test_[A-Za-z0-9]+$/.test(publishableKey)) {
    throw new DomainError('CONFLICT', 'Stripe test billing requires a test publishable key.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(input.catalogJson); } catch { throw new DomainError('VALIDATION', 'The Stripe test catalog is invalid JSON.'); }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) throw new DomainError('VALIDATION', 'A bounded Stripe test catalog is required.');
  const catalog = parsed.map(parseBillingCatalogSnapshot);
  if (catalog.some(product => product.provider !== 'stripe') || new Set(catalog.map(product => product.productKey)).size !== catalog.length || new Set(catalog.map(product => product.priceReference)).size !== catalog.length) {
    throw new DomainError('VALIDATION', 'Stripe test products and price references must be unique and server-bound.');
  }
  return Object.freeze({secretKey: input.secretKey, webhookSecret: input.webhookSecret, portalConfigurationId: input.portalConfigurationId, publishableKey: publishableKey || null, appUrl: origin.origin, catalog: Object.freeze(catalog)});
}
