import {parseDecimalInteger, semanticHash} from '../../contracts/http.ts';
import {DomainError} from '../../db/contracts.ts';

export type BillingProfile = 'local' | 'test' | 'production';
export type BillingProvider = 'fixture' | 'stripe';
export type BillingProductKind = 'subscription' | 'pack';
export type MoneyMinor = string & {readonly __unit: 'money-minor'};
export type CreditQuantity = string & {readonly __unit: 'integer-credits'};
export type CheckoutRequest = Readonly<{catalogProductKey: string}>;
export type PaymentAlias = Readonly<{provider: BillingProvider; objectKind: 'checkout_session' | 'invoice' | 'payment_intent' | 'charge'; externalId: string}>;
export type BillingCatalogSnapshot = Readonly<{
  catalogVersion: number;
  productKey: string;
  kind: BillingProductKind;
  interval: 'month' | null;
  credits: CreditQuantity;
  amountMinor: MoneyMinor;
  currency: string;
  creditExpiry: 'service_period_end' | 'never';
  provider: BillingProvider;
  priceReference: string;
  snapshotHash: string;
}>;
export type CheckoutAttemptStatus = 'creating' | 'open' | 'unknown' | 'paid' | 'expired' | 'canceled';
export type ReconciliationFence = Readonly<{workspaceId: string; owner: string; token: string; generation: string; leaseUntil: string}>;
export type CashEventKind = 'refund' | 'dispute_opened' | 'dispute_lost' | 'dispute_reversed';

function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new DomainError('VALIDATION', 'A plain billing object is required.');
  }
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new DomainError('VALIDATION', 'Unexpected or missing billing fields.');
  }
  return value;
}

function identifier(input: unknown, field: string): string {
  if (typeof input !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,254}$/.test(input)) {
    throw new DomainError('VALIDATION', `${field} must be a bounded identifier.`);
  }
  return input;
}

function quantity(input: unknown, field: string, positive: boolean): string {
  const value = parseDecimalInteger(input, field);
  if (value.length > 19 || BigInt(value) > 9223372036854775807n || (positive && value === '0')) {
    throw new DomainError('VALIDATION', `${field} is outside the supported integer range.`);
  }
  return value;
}

export function parseMoneyMinor(input: unknown): MoneyMinor {
  return quantity(input, 'amountMinor', false) as MoneyMinor;
}

export function parseCredits(input: unknown): CreditQuantity {
  return quantity(input, 'credits', true) as CreditQuantity;
}

/** Only a product key crosses the request boundary; the server supplies all payment identities. */
export function parseCheckoutRequest(input: unknown): CheckoutRequest {
  const value = object(input, ['catalogProductKey']);
  return Object.freeze({catalogProductKey: identifier(value.catalogProductKey, 'catalogProductKey')});
}

/** Portal commands have no browser-controlled fields; the return destination is server-owned. */
export function parsePortalRequest(input: unknown): Readonly<Record<string, never>> {
  object(input, []);
  return Object.freeze({});
}

export function parsePaymentAlias(input: unknown): PaymentAlias {
  const value = object(input, ['provider', 'objectKind', 'externalId']);
  if (!['fixture', 'stripe'].includes(value.provider as string) || !['checkout_session', 'invoice', 'payment_intent', 'charge'].includes(value.objectKind as string)) {
    throw new DomainError('VALIDATION', 'Unsupported canonical payment alias.');
  }
  return Object.freeze({provider: value.provider as BillingProvider, objectKind: value.objectKind as PaymentAlias['objectKind'], externalId: identifier(value.externalId, 'externalId')});
}

/** Snapshot hashes detect accidental changes; only a server catalog can authorize a purchase. */
export function parseBillingCatalogSnapshot(input: unknown): BillingCatalogSnapshot {
  const value = object(input, ['catalogVersion', 'productKey', 'kind', 'interval', 'credits', 'amountMinor', 'currency', 'creditExpiry', 'provider', 'priceReference', 'snapshotHash']);
  if (!Number.isSafeInteger(value.catalogVersion) || (value.catalogVersion as number) < 1 ||
      !['fixture', 'stripe'].includes(value.provider as string) || typeof value.currency !== 'string' || !/^[a-z]{3}$/.test(value.currency) ||
      !((value.kind === 'subscription' && value.interval === 'month' && value.creditExpiry === 'service_period_end') ||
        (value.kind === 'pack' && value.interval === null && value.creditExpiry === 'never'))) {
    throw new DomainError('VALIDATION', 'Unsupported billing catalog terms.');
  }
  const payload = {
    catalogVersion: value.catalogVersion as number,
    productKey: identifier(value.productKey, 'productKey'),
    kind: value.kind as BillingProductKind,
    interval: value.interval as 'month' | null,
    credits: parseCredits(value.credits),
    amountMinor: parseMoneyMinor(value.amountMinor),
    currency: value.currency,
    creditExpiry: value.creditExpiry as BillingCatalogSnapshot['creditExpiry'],
    provider: value.provider as BillingProvider,
    priceReference: identifier(value.priceReference, 'priceReference'),
  };
  const validPriceReference = payload.provider === 'fixture' ? /^fixture:[A-Za-z0-9:._-]+$/.test(payload.priceReference) : /^price_[A-Za-z0-9]+$/.test(payload.priceReference);
  if (!validPriceReference || payload.amountMinor === '0' || value.snapshotHash !== semanticHash('billing.catalog.snapshot', payload)) {
    throw new DomainError('VALIDATION', 'Billing snapshot identity does not match its terms.');
  }
  return Object.freeze({...payload, snapshotHash: value.snapshotHash as string});
}
