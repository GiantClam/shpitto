import {semanticHash} from '../contracts/http.ts';
import {DomainError} from '../db/contracts.ts';
import {parseBillingCatalogSnapshot, parseCredits, parseMoneyMinor, type BillingCatalogSnapshot, type BillingProfile} from '../modules/billing/contracts.ts';

/** Fictional amounts exercise local contracts only; no Stripe account or price is configured. */
const FIXTURE_PRODUCTS: readonly BillingCatalogSnapshot[] = Object.freeze([
  {productKey: 'fixture-monthly', kind: 'subscription', interval: 'month', credits: '1000', amountMinor: '2500', creditExpiry: 'service_period_end', priceReference: 'fixture:monthly:v1'},
  {productKey: 'fixture-pack', kind: 'pack', interval: null, credits: '250', amountMinor: '900', creditExpiry: 'never', priceReference: 'fixture:pack:v1'},
].map((product) => {
  const payload = {...product, catalogVersion: 1, provider: 'fixture', currency: 'usd', credits: parseCredits(product.credits), amountMinor: parseMoneyMinor(product.amountMinor)};
  return parseBillingCatalogSnapshot({...payload, snapshotHash: semanticHash('billing.catalog.snapshot', payload)});
}));
const EMPTY_CATALOG: readonly BillingCatalogSnapshot[] = Object.freeze([]);

export function getBillingCatalog(profile: BillingProfile): readonly BillingCatalogSnapshot[] {
  if (profile === 'production') return EMPTY_CATALOG;
  if (profile !== 'local' && profile !== 'test') throw new DomainError('VALIDATION', 'An explicit billing profile is required.');
  return FIXTURE_PRODUCTS;
}

export function snapshotBillingProduct(productKey: string, profile: BillingProfile): BillingCatalogSnapshot {
  const product = getBillingCatalog(profile).find((entry) => entry.productKey === productKey);
  if (!product) throw new DomainError('CONFLICT', 'The billing product is unavailable.');
  return Object.freeze({...product});
}
