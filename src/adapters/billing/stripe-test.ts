import Stripe from 'stripe';

import {parseBillingCatalogSnapshot, parseMoneyMinor, type BillingCatalogSnapshot} from '../../modules/billing/contracts.ts';

/** Pinned to the installed stripe 22.6.2 declarations; no environment lookup or runtime activation. */
export const STRIPE_TEST_API_VERSION = '2026-08-26.dahlia' as const satisfies Stripe.LatestApiVersion;

type Metadata = Readonly<Record<string, string>>;
type Reference = string | Readonly<{id: string; deleted?: boolean | void}> | null;
type Page<T> = Readonly<{data: readonly T[]; has_more: boolean}>;
type Customer = Pick<Stripe.Customer, 'id' | 'livemode' | 'metadata'>;
type DeletedCustomer = Pick<Stripe.DeletedCustomer, 'id' | 'deleted'>;
type Price = Pick<Stripe.Price, 'id' | 'livemode' | 'active' | 'currency' | 'unit_amount' | 'billing_scheme' | 'tiers_mode' | 'transform_quantity' | 'type'> & Readonly<{
  recurring: Readonly<{interval: string; interval_count: number; usage_type: string}> | null;
}>;
type Session = Omit<Pick<Stripe.Checkout.Session, 'id' | 'livemode' | 'metadata' | 'client_reference_id' | 'mode' | 'status' | 'payment_status' | 'currency' | 'amount_total' | 'expires_at' | 'url' | 'client_secret' | 'ui_mode'>, 'mode' | 'status' | 'payment_status' | 'ui_mode'> & Readonly<{
  mode: string | null; status: string | null; payment_status: string; ui_mode: string | null;
  customer: Reference; payment_intent: Reference; subscription: Reference;
  line_items?: Page<Readonly<{quantity: number | null; price: Reference}>>;
}>;
type PaymentIntent = Pick<Stripe.PaymentIntent, 'id' | 'livemode' | 'currency' | 'amount_received'> & Readonly<{customer: Reference; status: string}>;
type Refund = Pick<Stripe.Refund, 'id' | 'amount' | 'currency' | 'status' | 'metadata'> & Readonly<{customer: Reference; payment_intent: Reference}>;
type PortalConfiguration = Pick<Stripe.BillingPortal.Configuration, 'id' | 'livemode' | 'active'> & Readonly<{
  features: Readonly<{subscription_update: Readonly<{enabled: boolean}>; subscription_cancel: Readonly<{enabled: boolean; mode: string; proration_behavior?: string}>}>;
}>;
type PortalSession = Pick<Stripe.BillingPortal.Session, 'id' | 'livemode' | 'customer' | 'return_url' | 'url'> & Readonly<{configuration: Reference}>;

/** Structural projections of the installed SDK. Tests inject only these methods; a real Stripe client satisfies this port. */
export type StripeTestClient = {
  customers: {
    create(params: Stripe.CustomerCreateParams, options: Stripe.RequestOptions): Promise<Customer>;
    retrieve(id: string): Promise<Customer | DeletedCustomer>;
    list(params: Stripe.CustomerListParams): Promise<Page<Customer>>;
  };
  prices: {retrieve(id: string): Promise<Price>};
  checkout: {sessions: {
    create(params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions): Promise<Session>;
    retrieve(id: string, params: Stripe.Checkout.SessionRetrieveParams): Promise<Session>;
  }};
  paymentIntents: {retrieve(id: string): Promise<PaymentIntent>};
  refunds: {
    create(params: Stripe.RefundCreateParams, options: Stripe.RequestOptions): Promise<Refund>;
    retrieve(id: string): Promise<Refund>;
    list(params: Stripe.RefundListParams): Promise<Page<Refund>>;
  };
  billingPortal: {
    configurations: {retrieve(id: string): Promise<PortalConfiguration>};
    sessions: {create(params: Stripe.BillingPortal.SessionCreateParams, options: Stripe.RequestOptions): Promise<PortalSession>};
  };
};

/** failed rejects the observation; it is NOT proof that an earlier POST had no side effect. Retain durable intents. */
export type StripeTestProblem = Readonly<{
  status: 'failed' | 'unknown';
  code: 'invalid_input' | 'binding_mismatch' | 'provider_rejected' | 'provider_unavailable' | 'not_found' | 'lookup_incomplete' | 'unrecognized_response';
}>;
/** succeeded means a verified provider response, NOT a paid Checkout or a credit entitlement. */
export type StripeTestResult<T> = Readonly<{status: 'succeeded'; value: Readonly<T>}> | StripeTestProblem;
export type StripeTestCustomer = Readonly<{customerId: string; workspaceId: string; idempotencyKey: string | null}>;
export type StripeTestCustomerInput = Readonly<{workspaceId: string; idempotencyKey: string}>;
export type StripeTestCustomerReadInput = Readonly<{workspaceId: string; customerId: string; idempotencyKey?: string}>;
export type StripeTestCheckoutInput = Readonly<{workspaceId: string; customerId: string; attemptId: string; idempotencyKey: string; catalog: BillingCatalogSnapshot}>;
export type StripeTestCheckout = Readonly<{
  sessionId: string; customerId: string; url: string | null; clientSecret: string | null;
  status: 'open' | 'complete' | 'expired'; paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  paymentIntentId: string | null; subscriptionId: string | null; expiresAt: number;
}>;
export type StripeTestPortalInput = Readonly<{workspaceId: string; customerId: string; idempotencyKey: string}>;
export type StripeTestPortal = Readonly<{sessionId: string; customerId: string; url: string; configurationId: string}>;
export type StripeTestRefundInput = Readonly<{
  workspaceId: string; customerId: string; requestId: string; orderId: string; paymentIntentId: string;
  amountMinor: string; currency: string; idempotencyKey: string;
}>;
/** Only status=succeeded is confirmed cash movement. requires_action maps to pending; canceled maps to failed. */
export type StripeTestRefundResult = StripeTestProblem | Readonly<{
  status: 'pending' | 'failed' | 'succeeded'; refundId: string; paymentIntentId: string; customerId: string;
  amountMinor: string; currency: string; providerStatus: 'pending' | 'requires_action' | 'failed' | 'canceled' | 'succeeded';
}>;
export type StripeTestAdapterConfig = Readonly<{secretKey: string; appUrl: string; portalConfigurationId?: string; client?: StripeTestClient}>;

class AdapterFault extends Error {
  readonly problem: StripeTestProblem;
  constructor(code: StripeTestProblem['code'], status: StripeTestProblem['status'] = 'failed') {
    super('The Stripe test adapter could not verify the operation.');
    this.problem = Object.freeze({status, code});
  }
}

function requireValue(condition: unknown, code: StripeTestProblem['code'] = 'binding_mismatch'): asserts condition {
  if (!condition) throw new AdapterFault(code);
}

function identifier(value: string, prefix?: string): string {
  requireValue(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,199}$/.test(value) && (!prefix || new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(value)), 'invalid_input');
  return value;
}

function key(value: string): string {
  requireValue(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:._-]{7,254}$/.test(value), 'invalid_input');
  return value;
}

function amount(value: string): number {
  const parsed = Number(parseMoneyMinor(value));
  requireValue(Number.isSafeInteger(parsed) && parsed > 0, 'invalid_input');
  return parsed;
}

function reference(value: Reference): string | null {
  if (typeof value === 'string') return value;
  requireValue(!value?.deleted);
  return value?.id ?? null;
}

function boundMetadata(observed: Metadata | null, expected: Metadata): void {
  requireValue(observed && Object.entries(expected).every(([name, value]) => observed[name] === value));
}

function safeProblem(error: unknown): StripeTestProblem {
  if (error instanceof AdapterFault) return error.problem;
  // No SDK message, raw body, request, headers or provider error code crosses this boundary.
  const type = error && typeof error === 'object' && 'type' in error ? error.type : null;
  if (['StripeAuthenticationError', 'StripePermissionError', 'StripeInvalidRequestError', 'StripeIdempotencyError', 'StripeCardError'].includes(type as string)) {
    return Object.freeze({status: 'failed', code: 'provider_rejected'});
  }
  return Object.freeze({status: 'unknown', code: 'provider_unavailable'});
}

async function checked<T>(work: () => Promise<T>): Promise<StripeTestResult<T>> {
  try {return Object.freeze({status: 'succeeded', value: Object.freeze(await work())});}
  catch (error) {return safeProblem(error);}
}

function appOrigin(value: string): string {
  try {
    const url = new URL(value);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    return url.origin;
  } catch {throw new TypeError('A safe application origin is required for Stripe test billing.');}
}

function providerUrl(value: string, host: string): string {
  try {
    const url = new URL(value);
    requireValue(url.protocol === 'https:' && url.hostname === host && !url.port && !url.username && !url.password);
    return url.toString();
  } catch {throw new AdapterFault('binding_mismatch');}
}

/** Bounded complete scan: a missing/ambiguous/truncated match never authorizes another remote create. */
async function lookup<T extends {id: string}>(page: (cursor?: string) => Promise<Page<T>>, matches: (value: T) => boolean): Promise<T> {
  let cursor: string | undefined;
  let found: T | undefined;
  const seen = new Set<string>();
  for (let count = 0; count < 10; count++) {
    const result = await page(cursor);
    for (const item of result.data) {
      if (seen.has(item.id)) throw new AdapterFault('lookup_incomplete', 'unknown');
      seen.add(item.id);
      if (!matches(item)) continue;
      requireValue(!found);
      found = item;
    }
    if (!result.has_more) {
      if (!found) throw new AdapterFault('not_found', 'unknown');
      return found;
    }
    cursor = result.data.at(-1)?.id;
    if (!cursor) throw new AdapterFault('lookup_incomplete', 'unknown');
  }
  throw new AdapterFault('lookup_incomplete', 'unknown');
}

function customerValue(customer: Customer | DeletedCustomer, input: StripeTestCustomerReadInput): StripeTestCustomer {
  requireValue(!('deleted' in customer) && customer.livemode === false && customer.id === input.customerId);
  boundMetadata(customer.metadata, {workspaceId: input.workspaceId, ...(input.idempotencyKey ? {idempotencyKey: input.idempotencyKey} : {})});
  return {customerId: customer.id, workspaceId: input.workspaceId, idempotencyKey: customer.metadata.idempotencyKey ?? null};
}

function checkoutInput(input: StripeTestCheckoutInput): StripeTestCheckoutInput {
  identifier(input.workspaceId); identifier(input.customerId, 'cus_'); identifier(input.attemptId); key(input.idempotencyKey);
  let catalog: BillingCatalogSnapshot;
  try {catalog = parseBillingCatalogSnapshot(input.catalog);} catch {throw new AdapterFault('invalid_input');}
  requireValue(catalog.provider === 'stripe', 'invalid_input'); amount(catalog.amountMinor);
  return Object.freeze({...input, catalog});
}

function checkoutMetadata(input: StripeTestCheckoutInput): Metadata {
  return {workspaceId: input.workspaceId, customerId: input.customerId, attemptId: input.attemptId, idempotencyKey: input.idempotencyKey, catalogHash: input.catalog.snapshotHash, productKey: input.catalog.productKey};
}

function verifyPrice(price: Price, catalog: BillingCatalogSnapshot, creating: boolean): void {
  requireValue(price.livemode === false && (!creating || price.active) && price.id === catalog.priceReference && price.currency === catalog.currency && price.unit_amount === amount(catalog.amountMinor));
  requireValue(price.billing_scheme === 'per_unit' && price.tiers_mode === null && price.transform_quantity === null);
  if (catalog.kind === 'pack') requireValue(price.type === 'one_time' && price.recurring === null);
  else requireValue(price.type === 'recurring' && price.recurring?.interval === 'month' && price.recurring.interval_count === 1 && price.recurring.usage_type === 'licensed');
}

/**
 * Stripe.js splits on `_secret_` and decodes the suffix with decodeURIComponent + base64.
 * The suffix is percent-encoded base64 (`%2B`, `%2F`, `%3D`), not only `[A-Za-z0-9]`.
 * Rejecting that shape turns a payable embedded_page session into a failed verification.
 */
const EMBEDDED_CLIENT_SECRET_SUFFIX = /^(?:[A-Za-z0-9]|%(?:2[BbFf]|3[Dd])){1,4096}$/;

function checkoutClientSecret(session: Session): string | null {
  const secret = session.client_secret;
  if (secret == null) return null;
  const prefix = `${session.id}_secret_`;
  const suffix = secret.startsWith(prefix) ? secret.slice(prefix.length) : '';
  requireValue(EMBEDDED_CLIENT_SECRET_SUFFIX.test(suffix));
  try {
    requireValue(atob(decodeURIComponent(suffix)).length > 0);
  } catch {
    throw new AdapterFault('binding_mismatch');
  }
  return secret;
}

function checkoutValue(session: Session, input: StripeTestCheckoutInput, sessionId?: string, creating = false): StripeTestCheckout {
  requireValue(session.livemode === false && /^cs_test_[A-Za-z0-9]+$/.test(session.id) && (!sessionId || session.id === sessionId));
  requireValue(reference(session.customer) === input.customerId && session.client_reference_id === input.attemptId);
  boundMetadata(session.metadata, checkoutMetadata(input));
  requireValue(session.mode === (input.catalog.kind === 'pack' ? 'payment' : 'subscription'));
  requireValue(session.currency === input.catalog.currency && session.amount_total === amount(input.catalog.amountMinor));
  requireValue(session.line_items && !session.line_items.has_more && session.line_items.data.length === 1);
  const line = session.line_items.data[0]!;
  requireValue(line.quantity === 1 && reference(line.price) === input.catalog.priceReference);
  requireValue(session.status === 'open' || session.status === 'complete' || session.status === 'expired');
  requireValue(session.payment_status === 'paid' || session.payment_status === 'unpaid' || session.payment_status === 'no_payment_required');
  requireValue(Number.isSafeInteger(session.expires_at) && session.expires_at > 0 && (session.payment_status !== 'paid' || session.status === 'complete'));
  const embedded = session.ui_mode === 'embedded_page';
  const hosted = session.ui_mode === 'hosted_page' || session.ui_mode == null;
  if (!embedded && !hosted) throw new AdapterFault('unrecognized_response', 'unknown');
  if (creating) requireValue(embedded);
  const clientSecret = checkoutClientSecret(session);
  const hostedUrl = session.url ? providerUrl(session.url, 'checkout.stripe.com') : null;
  // Embedded sessions must not hand the browser a hosted Checkout URL. Those links stay incomplete
  // while the test account cannot accept charges; the client secret is the payable surface.
  if (embedded) requireValue(hostedUrl === null);
  if (!embedded) requireValue(clientSecret === null && (session.status !== 'open' || hostedUrl));
  if (embedded && session.status === 'open') requireValue(clientSecret);
  const paymentIntentId = reference(session.payment_intent);
  const subscriptionId = reference(session.subscription);
  if (paymentIntentId) identifier(paymentIntentId, 'pi_');
  if (subscriptionId) identifier(subscriptionId, 'sub_');
  return {sessionId: session.id, customerId: input.customerId, url: embedded ? null : hostedUrl, clientSecret: embedded && session.status === 'open' ? clientSecret : null, status: session.status, paymentStatus: session.payment_status, paymentIntentId, subscriptionId, expiresAt: session.expires_at};
}

function refundInput(input: StripeTestRefundInput): StripeTestRefundInput {
  identifier(input.workspaceId); identifier(input.customerId, 'cus_'); identifier(input.requestId); identifier(input.orderId); identifier(input.paymentIntentId, 'pi_'); key(input.idempotencyKey);
  requireValue(typeof input.currency === 'string' && /^[a-z]{3}$/.test(input.currency), 'invalid_input');
  try {amount(input.amountMinor);} catch {throw new AdapterFault('invalid_input');}
  return Object.freeze({...input});
}

function refundMetadata(input: StripeTestRefundInput): Metadata {
  return {workspaceId: input.workspaceId, customerId: input.customerId, requestId: input.requestId, orderId: input.orderId, idempotencyKey: input.idempotencyKey};
}

function refundValue(refund: Refund, input: StripeTestRefundInput, refundId?: string): Exclude<StripeTestRefundResult, StripeTestProblem> {
  requireValue(/^re_[A-Za-z0-9]+$/.test(refund.id) && (!refundId || refund.id === refundId));
  requireValue(reference(refund.payment_intent) === input.paymentIntentId && refund.amount === amount(input.amountMinor) && refund.currency === input.currency);
  requireValue(refund.customer === null || reference(refund.customer) === input.customerId);
  boundMetadata(refund.metadata, refundMetadata(input));
  const providerStatus = refund.status;
  if (providerStatus !== 'succeeded' && providerStatus !== 'pending' && providerStatus !== 'requires_action' && providerStatus !== 'failed' && providerStatus !== 'canceled') throw new AdapterFault('unrecognized_response', 'unknown');
  const status = providerStatus === 'succeeded' ? 'succeeded' : providerStatus === 'failed' || providerStatus === 'canceled' ? 'failed' : 'pending';
  return {status, refundId: refund.id, paymentIntentId: input.paymentIntentId, customerId: input.customerId, amountMinor: input.amountMinor, currency: input.currency, providerStatus};
}

/**
 * Isolated provider port. All inputs must come from server-owned durable intents; this adapter has no
 * authorization, ledger, environment, persistence or automatic retry authority. Reuse the exact key
 * and parameters only within the caller's approved retry window. Persist returned IDs for readback.
 * Lookup scans at most ten pages of 100 records and never creates missing objects. Unknown is not
 * evidence of absence. New Checkout sessions use embedded_page and return a client secret for
 * Stripe.js Embedded Checkout. Historical hosted session URLs, when read back, must still use
 * checkout.stripe.com. Portal URLs support billing.stripe.com only.
 */
export function createStripeTestAdapter(config: StripeTestAdapterConfig) {
  if (typeof config.secretKey !== 'string' || !/^(sk|rk)_test_[A-Za-z0-9]+$/.test(config.secretKey)) throw new TypeError('A Stripe test secret key is required.');
  const origin = appOrigin(config.appUrl);
  const configurationId = config.portalConfigurationId;
  if (configurationId !== undefined && !/^bpc_[A-Za-z0-9]+$/.test(configurationId)) throw new TypeError('A valid Stripe test portal configuration is required.');
  const client: StripeTestClient = config.client ?? new Stripe(config.secretKey, {apiVersion: STRIPE_TEST_API_VERSION, maxNetworkRetries: 0, timeout: 20_000});
  const returnUrl = (workspaceId: string) => new URL(`/workspaces/${encodeURIComponent(workspaceId)}/billing`, origin).toString();

  async function verifiedCustomer(input: StripeTestCustomerReadInput): Promise<StripeTestCustomer> {
    identifier(input.workspaceId); identifier(input.customerId, 'cus_');
    if (input.idempotencyKey !== undefined) key(input.idempotencyKey);
    return customerValue(await client.customers.retrieve(input.customerId), input);
  }

  async function verifyCheckout(input: StripeTestCheckoutInput, creating: boolean): Promise<void> {
    await verifiedCustomer({workspaceId: input.workspaceId, customerId: input.customerId});
    verifyPrice(await client.prices.retrieve(input.catalog.priceReference), input.catalog, creating);
  }

  async function verifyRefund(input: StripeTestRefundInput): Promise<void> {
    await verifiedCustomer({workspaceId: input.workspaceId, customerId: input.customerId});
    const payment = await client.paymentIntents.retrieve(input.paymentIntentId);
    requireValue(payment.id === input.paymentIntentId && payment.livemode === false && reference(payment.customer) === input.customerId);
    requireValue(payment.currency === input.currency && payment.status === 'succeeded' && Number.isSafeInteger(payment.amount_received) && payment.amount_received >= amount(input.amountMinor));
  }

  async function observedRefund(raw: StripeTestRefundInput, observe: (input: StripeTestRefundInput) => Promise<Refund>, refundId?: string): Promise<StripeTestRefundResult> {
    try {
      const input = refundInput(raw);
      if (refundId !== undefined) identifier(refundId, 're_');
      await verifyRefund(input);
      return Object.freeze(refundValue(await observe(input), input, refundId));
    } catch (error) {return safeProblem(error);}
  }

  return Object.freeze({
    provider: 'stripe' as const,
    createCustomer(raw: StripeTestCustomerInput): Promise<StripeTestResult<StripeTestCustomer>> {
      return checked(async () => {
        const input = {workspaceId: identifier(raw.workspaceId), idempotencyKey: key(raw.idempotencyKey)};
        const created = await client.customers.create({metadata: input}, {idempotencyKey: input.idempotencyKey});
        identifier(created.id, 'cus_');
        return customerValue(created, {...input, customerId: created.id});
      });
    },
    retrieveCustomer(raw: StripeTestCustomerReadInput): Promise<StripeTestResult<StripeTestCustomer>> {
      return checked(() => verifiedCustomer({...raw}));
    },
    lookupCustomer(raw: StripeTestCustomerInput): Promise<StripeTestResult<StripeTestCustomer>> {
      return checked(async () => {
        const input = {workspaceId: identifier(raw.workspaceId), idempotencyKey: key(raw.idempotencyKey)};
        const found = await lookup((cursor) => client.customers.list({limit: 100, ...(cursor ? {starting_after: cursor} : {})}), (value) => value.metadata.workspaceId === input.workspaceId && value.metadata.idempotencyKey === input.idempotencyKey);
        identifier(found.id, 'cus_');
        return customerValue(found, {...input, customerId: found.id});
      });
    },
    createCheckout(raw: StripeTestCheckoutInput): Promise<StripeTestResult<StripeTestCheckout>> {
      return checked(async () => {
        const input = checkoutInput(raw);
        await verifyCheckout(input, true);
        const metadata = checkoutMetadata(input);
        const params: Stripe.Checkout.SessionCreateParams = {
          customer: input.customerId, client_reference_id: input.attemptId, mode: input.catalog.kind === 'pack' ? 'payment' : 'subscription',
          line_items: [{price: input.catalog.priceReference, quantity: 1}], metadata,
          ...(input.catalog.kind === 'pack' ? {payment_intent_data: {metadata}} : {subscription_data: {metadata}}),
          ui_mode: 'embedded_page', redirect_on_completion: 'always', return_url: `${returnUrl(input.workspaceId)}?checkout=return&session_id={CHECKOUT_SESSION_ID}`,
          allow_promotion_codes: false, automatic_tax: {enabled: false}, adaptive_pricing: {enabled: false}, expand: ['line_items.data.price'],
        };
        return checkoutValue(await client.checkout.sessions.create(params, {idempotencyKey: input.idempotencyKey}), input, undefined, true);
      });
    },
    retrieveCheckout(raw: StripeTestCheckoutInput & Readonly<{sessionId: string}>): Promise<StripeTestResult<StripeTestCheckout>> {
      return checked(async () => {
        const input = checkoutInput(raw);
        const sessionId = identifier(raw.sessionId, 'cs_test_');
        await verifyCheckout(input, false);
        return checkoutValue(await client.checkout.sessions.retrieve(sessionId, {expand: ['line_items.data.price']}), input, sessionId);
      });
    },
    createPortal(raw: StripeTestPortalInput): Promise<StripeTestResult<StripeTestPortal>> {
      return checked(async () => {
        const input = {...raw, workspaceId: identifier(raw.workspaceId), customerId: identifier(raw.customerId, 'cus_'), idempotencyKey: key(raw.idempotencyKey)};
        requireValue(configurationId, 'invalid_input');
        await verifiedCustomer({workspaceId: input.workspaceId, customerId: input.customerId});
        const configuration = await client.billingPortal.configurations.retrieve(configurationId);
        requireValue(configuration.id === configurationId && configuration.livemode === false && configuration.active);
        requireValue(configuration.features.subscription_update.enabled === false && configuration.features.subscription_cancel.enabled && configuration.features.subscription_cancel.mode === 'at_period_end');
        requireValue(configuration.features.subscription_cancel.proration_behavior === 'none');
        const destination = returnUrl(input.workspaceId);
        const portal = await client.billingPortal.sessions.create({customer: input.customerId, configuration: configurationId, return_url: destination}, {idempotencyKey: input.idempotencyKey});
        requireValue(portal.livemode === false && portal.customer === input.customerId && reference(portal.configuration) === configurationId && portal.return_url === destination);
        identifier(portal.id, 'bps_');
        return {sessionId: portal.id, customerId: input.customerId, configurationId, url: providerUrl(portal.url, 'billing.stripe.com')};
      });
    },
    createRefund(input: StripeTestRefundInput): Promise<StripeTestRefundResult> {
      return observedRefund(input, (value) => client.refunds.create({payment_intent: value.paymentIntentId, amount: amount(value.amountMinor), metadata: refundMetadata(value)}, {idempotencyKey: value.idempotencyKey}));
    },
    retrieveRefund(raw: StripeTestRefundInput & Readonly<{refundId: string}>): Promise<StripeTestRefundResult> {
      const refundId = raw.refundId;
      return observedRefund(raw, () => client.refunds.retrieve(identifier(refundId, 're_')), refundId);
    },
    lookupRefund(input: StripeTestRefundInput): Promise<StripeTestRefundResult> {
      return observedRefund(input, (value) => lookup((cursor) => client.refunds.list({payment_intent: value.paymentIntentId, limit: 100, ...(cursor ? {starting_after: cursor} : {})}), (observed) => observed.metadata?.requestId === value.requestId || observed.metadata?.idempotencyKey === value.idempotencyKey));
    },
  });
}

export type StripeTestAdapter = ReturnType<typeof createStripeTestAdapter>;
