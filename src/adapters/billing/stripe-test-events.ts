import type Stripe from 'stripe';

import {parseBillingCatalogSnapshot, type BillingCatalogSnapshot, type ReconciliationFence} from '../../modules/billing/contracts.ts';
import type {PaymentObservation} from '../../modules/billing/reconcile-payment.ts';
import type {ReconciliationScope} from '../../modules/billing/reconciliation-fence.ts';
import type {SubscriptionObservation} from '../../modules/billing/subscriptions.ts';

type Reference = string | Readonly<{id: string; deleted?: boolean | void}> | null;
type Page<T> = Readonly<{data: readonly T[]; has_more: boolean}>;
type Price = Pick<Stripe.Price, 'id' | 'livemode' | 'currency' | 'unit_amount' | 'billing_scheme' | 'tiers_mode' | 'transform_quantity'> & Readonly<{
  type: string; recurring: Readonly<{interval: string; interval_count: number; usage_type: string}> | null;
}>;
type Session = Pick<Stripe.Checkout.Session, 'id' | 'livemode' | 'currency' | 'amount_total' | 'amount_subtotal'> & Readonly<{
  customer: Reference; payment_intent: Reference; subscription: Reference; invoice: Reference; metadata?: Readonly<Record<string, string>> | null; client_reference_id?: string | null;
  mode: string; status: string | null; payment_status: string;
  automatic_tax: Readonly<{enabled: boolean}>; discounts: readonly unknown[] | null;
  total_details: Readonly<{amount_discount: number; amount_tax: number; amount_shipping: number | null}> | null;
}>;
type CheckoutLine = Pick<Stripe.LineItem, 'id' | 'quantity' | 'currency' | 'amount_subtotal' | 'amount_total' | 'amount_discount' | 'amount_tax'> & Readonly<{
  price: Reference; discounts?: readonly unknown[]; taxes?: readonly unknown[];
}>;
type Intent = Pick<Stripe.PaymentIntent, 'id' | 'livemode' | 'currency' | 'amount' | 'amount_received'> & Readonly<{
  customer: Reference; latest_charge: Reference; status: string;
}>;
type Charge = Pick<Stripe.Charge, 'id' | 'livemode' | 'amount' | 'amount_captured' | 'currency' | 'paid' | 'captured' | 'created'> & Readonly<{
  customer: Reference; payment_intent: Reference; status: string;
}>;
// Refund has no livemode field in the pinned SDK. Its canonical Charge and Intent establish mode.
type Refund = Pick<Stripe.Refund, 'id' | 'amount' | 'currency' | 'created' | 'status'> & Readonly<{
  customer: Reference; charge: Reference; payment_intent: Reference;
}>;
type Dispute = Pick<Stripe.Dispute, 'id' | 'livemode' | 'amount' | 'currency' | 'created'> & Readonly<{
  charge: Reference; payment_intent: Reference; status: string;
}>;
type SubscriptionItem = Pick<Stripe.SubscriptionItem, 'id' | 'subscription' | 'quantity' | 'current_period_start' | 'current_period_end'> & Readonly<{
  price: Reference; discounts: readonly unknown[]; tax_rates: readonly unknown[] | null;
}>;
type Subscription = Pick<Stripe.Subscription, 'id' | 'livemode' | 'cancel_at_period_end'> & Readonly<{
  customer: Reference; status: string; automatic_tax: Readonly<{enabled: boolean}>;
  default_tax_rates?: readonly unknown[] | null; discounts: readonly unknown[]; items: Page<SubscriptionItem>;
}>;
type InvoiceLine = Pick<Stripe.InvoiceLineItem, 'id' | 'invoice' | 'livemode' | 'currency' | 'amount' | 'subtotal' | 'quantity' | 'period'> & Readonly<{
  quantity_decimal: Stripe.Decimal | string | null;
  subscription?: Reference; discounts: readonly unknown[]; discount_amounts: readonly unknown[] | null;
  pretax_credit_amounts: readonly unknown[] | null; taxes: readonly unknown[] | null;
  pricing: Readonly<{type: string; price_details?: Readonly<{price: Reference}>; unit_amount_decimal: Stripe.Decimal | string | null}> | null;
  parent: Readonly<{type: string; subscription_item_details?: Readonly<{subscription: string | null; subscription_item: string; proration: boolean}> | null}> | null;
}>;
type InvoicePayment = Pick<Stripe.InvoicePayment, 'id' | 'livemode' | 'status' | 'amount_paid' | 'currency'> & Readonly<{
  invoice: Reference; payment: Readonly<{type: string; payment_intent?: Reference}>;
}>;
type Invoice = Pick<Stripe.Invoice, 'id' | 'livemode' | 'currency' | 'amount_paid' | 'amount_due' | 'amount_remaining' | 'amount_paid_off_stripe' | 'total' | 'subtotal' | 'starting_balance' | 'ending_balance' | 'pre_payment_credit_notes_amount' | 'post_payment_credit_notes_amount'> & Readonly<{
  customer: Reference; status: string | null; billing_reason: string | null;
  automatic_tax: Readonly<{enabled: boolean}>; default_tax_rates: readonly unknown[]; discounts: readonly unknown[];
  total_discount_amounts: readonly unknown[] | null; total_taxes: readonly unknown[] | null; total_pretax_credit_amounts?: readonly unknown[] | null;
  parent: Readonly<{type: string; subscription_details?: Readonly<{subscription: Reference}> | null}> | null;
  payments?: Page<InvoicePayment>; lines: Page<InvoiceLine>; status_transitions: Readonly<{paid_at: number | null}>;
}>;

/** Read-only projections of stripe 22.6.2 / 2026-08-26.dahlia. A real SDK client satisfies this port. */
export type StripeTestEventClient = Readonly<{
  checkout: {sessions: {
    retrieve(id: string, params?: Stripe.Checkout.SessionRetrieveParams): Promise<Session>;
    list(params: Stripe.Checkout.SessionListParams): Promise<Page<Session>>;
    listLineItems(id: string, params?: Stripe.Checkout.SessionListLineItemsParams): Promise<Page<CheckoutLine>>;
  }};
  invoices: {retrieve(id: string, params?: Stripe.InvoiceRetrieveParams): Promise<Invoice>};
  invoicePayments: {list(params: Stripe.InvoicePaymentListParams): Promise<Page<InvoicePayment>>};
  subscriptions: {retrieve(id: string, params?: Stripe.SubscriptionRetrieveParams): Promise<Subscription>};
  prices: {retrieve(id: string): Promise<Price>};
  paymentIntents: {retrieve(id: string): Promise<Intent>};
  charges: {retrieve(id: string): Promise<Charge>};
  refunds: {retrieve(id: string): Promise<Refund>; list(params: Stripe.RefundListParams): Promise<Page<Refund>>};
  disputes: {retrieve(id: string): Promise<Dispute>};
}>;

const eventObjects = {
  'checkout.session.completed': ['checkout.session', 'cs_test_'],
  'checkout.session.async_payment_succeeded': ['checkout.session', 'cs_test_'],
  'invoice.paid': ['invoice', 'in_'],
  'invoice.payment_succeeded': ['invoice', 'in_'],
  'payment_intent.succeeded': ['payment_intent', 'pi_'],
  'charge.refunded': ['charge', 'ch_'],
  'charge.dispute.created': ['dispute', 'du_'],
  'charge.dispute.updated': ['dispute', 'du_'],
  'charge.dispute.closed': ['dispute', 'du_'],
  'refund.created': ['refund', 're_'],
  'refund.updated': ['refund', 're_'],
  'refund.failed': ['refund', 're_'],
  'customer.subscription.created': ['subscription', 'sub_'],
  'customer.subscription.updated': ['subscription', 'sub_'],
  'customer.subscription.deleted': ['subscription', 'sub_'],
} as const;
export const STRIPE_TEST_EVENT_TYPES = Object.freeze(Object.keys(eventObjects) as Array<keyof typeof eventObjects>);
export type StripeTestEventHint = Readonly<{
  eventId: string; eventType: keyof typeof eventObjects; objectId: string; objectType: string; livemode: false;
}>;
export type StripeTestEventDiscovery = ReconciliationScope & Readonly<{provider: 'stripe'; customerId: string; hint: StripeTestEventHint}>;
/** Only server-owned persisted bindings may be passed here. Metadata never supplies these fields. */
export type StripeTestEventBinding = Readonly<{
  workspaceId: string; customerId: string; catalogSnapshot: BillingCatalogSnapshot;
  checkoutSessionId?: string; invoiceId?: string; paymentIntentId?: string; chargeId?: string;
  externalSubscriptionId?: string; periodStart?: string; periodEnd?: string;
  billingReason?: 'subscription_create' | 'subscription_cycle';
}>;
type Canonical = Readonly<{
  hint: StripeTestEventHint; customerId: string; session?: Session; invoice?: Invoice;
  subscription?: Subscription; intent?: Intent; charge?: Charge; refund?: Refund; dispute?: Dispute;
}>;

function requireIdentity(condition: unknown, message = 'Stripe canonical identity, customer, or test mode does not match.'): asserts condition {
  if (!condition) throw new TypeError(message);
}

function identifier(value: unknown, prefix: string): string {
  requireIdentity(typeof value === 'string' && value.length <= 255 && value.startsWith(prefix) && /^[A-Za-z0-9_]+$/.test(value));
  return value;
}

function reference(value: Reference | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  requireIdentity(value.deleted !== true);
  return value.id;
}

function testObject<T extends {id: string; livemode: boolean}>(value: T, id: string): T {
  requireIdentity(value.id === id && value.livemode === false);
  return value;
}

function object(value: unknown): Record<string, unknown> {
  requireIdentity(value && typeof value === 'object' && !Array.isArray(value), 'Stripe event must contain an object.');
  return value as Record<string, unknown>;
}

/** Authentication belongs to the HTTP boundary. This parser accepts only authenticated raw bytes. */
export function parseWebhookEvent(raw: Uint8Array | string): StripeTestEventHint {
  const bytes = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw;
  requireIdentity(bytes.byteLength > 0 && bytes.byteLength <= 256 * 1024, 'Stripe event exceeds the payload limit.');
  let decoded: unknown;
  try {decoded = JSON.parse(Buffer.from(bytes).toString('utf8'));} catch {throw new TypeError('Stripe event JSON is invalid.');}
  const body = object(decoded);
  requireIdentity(body.livemode === false && typeof body.type === 'string' && Object.hasOwn(eventObjects, body.type), 'Unsupported or live Stripe event.');
  const eventType = body.type as StripeTestEventHint['eventType'];
  const [objectType, prefix] = eventObjects[eventType];
  const resource = object(object(body.data).object);
  requireIdentity(resource.object === objectType && resource.livemode !== true, 'Stripe event object type or mode does not match.');
  return Object.freeze({eventId: identifier(body.id, 'evt_'), eventType, objectId: identifier(resource.id, prefix), objectType, livemode: false});
}
export const parseStripeTestEvent = parseWebhookEvent;

function empty(value: readonly unknown[] | null | undefined): boolean {return value == null || value.length === 0;}
function positive(value: number | null | undefined): value is number {return Number.isSafeInteger(value) && value! > 0;}
function money(value: number): string {return Number.isSafeInteger(value) && value >= 0 ? String(value) : '0';}
function timestamp(value: number | null | undefined): string | undefined {
  if (!positive(value) || value > 8_640_000_000_000) return undefined;
  return new Date(value * 1000).toISOString();
}

function monthly(start: number, end: number): boolean {
  if (!timestamp(start) || !timestamp(end) || end <= start) return false;
  const from = new Date(start * 1000);
  const target = new Date(start * 1000);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const fromLastDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)).getUTCDate();
  // A January 31 anchor returns to March 31 after February clamps it to 28/29.
  const anchors = from.getUTCDate() === fromLastDay
    ? Array.from({length: 32 - from.getUTCDate()}, (_, offset) => from.getUTCDate() + offset)
    : [from.getUTCDate()];
  return anchors.some((day) => {
    target.setUTCDate(Math.min(day, lastDay));
    return target.getTime() === end * 1000;
  });
}

function priceSupported(price: Price | undefined, catalog: BillingCatalogSnapshot): boolean {
  return !!price && price.livemode === false && price.id === catalog.priceReference && price.currency === catalog.currency &&
    positive(price.unit_amount) && String(price.unit_amount) === catalog.amountMinor && price.billing_scheme === 'per_unit' &&
    price.tiers_mode === null && price.transform_quantity === null && (catalog.kind === 'pack'
      ? price.type === 'one_time' && price.recurring === null
      : price.type === 'recurring' && price.recurring?.interval === 'month' && price.recurring.interval_count === 1 && price.recurring.usage_type === 'licensed');
}

function cashSupported(state: Canonical, catalog: BillingCatalogSnapshot): boolean {
  const {intent, charge} = state;
  return !!intent && !!charge && intent.status === 'succeeded' && charge.status === 'succeeded' && charge.paid && charge.captured &&
    positive(intent.amount_received) && String(intent.amount_received) === catalog.amountMinor && intent.amount === intent.amount_received &&
    charge.amount === intent.amount_received && charge.amount_captured === charge.amount &&
    intent.currency === catalog.currency && charge.currency === catalog.currency;
}

function subscriptionSupported(subscription: Subscription | undefined, price: Price | undefined, catalog: BillingCatalogSnapshot): boolean {
  const item = subscription?.items.data[0];
  return catalog.kind === 'subscription' && !!subscription && !subscription.items.has_more && subscription.items.data.length === 1 &&
    !!item && item.subscription === subscription.id && item.quantity === 1 && reference(item.price) === price?.id &&
    empty(item.discounts) && empty(item.tax_rates) && empty(subscription.discounts) && empty(subscription.default_tax_rates) &&
    subscription.automatic_tax.enabled === false && priceSupported(price, catalog);
}

/**
 * Both stages perform read-only provider I/O outside transactions. Commit a claim before normalize.
 * Apply each returned payment under its own claim and canonical refetch; never reuse one fence for
 * a payment and a subscription mirror. select.refundId limits charge.refunded to one refund apply.
 * No environment, credentials, catalog lookup, database access, or SDK construction occurs here.
 */
export function createStripeTestEventMapper(client: StripeTestEventClient) {
  async function canonical(hint: StripeTestEventHint): Promise<Canonical> {
    const expected = eventObjects[hint.eventType];
    requireIdentity(expected && hint.livemode === false && hint.objectType === expected[0]);
    identifier(hint.eventId, 'evt_'); identifier(hint.objectId, expected[1]);
    let session: Session | undefined;
    let invoice: Invoice | undefined;
    let subscription: Subscription | undefined;
    let intent: Intent | undefined;
    let charge: Charge | undefined;
    let refund: Refund | undefined;
    let dispute: Dispute | undefined;
    if (hint.objectType === 'checkout.session') session = testObject(await client.checkout.sessions.retrieve(hint.objectId), hint.objectId);
    if (hint.objectType === 'invoice') invoice = testObject(await client.invoices.retrieve(hint.objectId, {expand: ['payments']}), hint.objectId);
    if (hint.objectType === 'subscription') subscription = testObject(await client.subscriptions.retrieve(hint.objectId), hint.objectId);
    if (hint.objectType === 'payment_intent') {
      intent = testObject(await client.paymentIntents.retrieve(hint.objectId), hint.objectId);
    }
    if (hint.objectType === 'charge') charge = testObject(await client.charges.retrieve(hint.objectId), hint.objectId);
    if (hint.objectType === 'refund') {
      refund = await client.refunds.retrieve(hint.objectId);
      requireIdentity(refund.id === hint.objectId);
      const chargeId = identifier(reference(refund.charge), 'ch_');
      charge = testObject(await client.charges.retrieve(chargeId), chargeId);
    }
    if (hint.objectType === 'dispute') {
      dispute = testObject(await client.disputes.retrieve(hint.objectId), hint.objectId);
      const id = identifier(reference(dispute.charge), 'ch_');
      charge = testObject(await client.charges.retrieve(id), id);
    }
    const directIntentId = reference(session?.payment_intent) ?? reference(charge?.payment_intent);
    if (directIntentId && !intent) intent = testObject(await client.paymentIntents.retrieve(identifier(directIntentId, 'pi_')), directIntentId);
    if (intent && !session) {
      const sessions = await client.checkout.sessions.list({payment_intent: intent.id, limit: 2});
      // Subscription-cycle Checkout Sessions can be returned by Stripe's
      // payment_intent filter even though their session payment_intent is
      // null; the cycle's PaymentIntent belongs to the invoice instead.
      const matchingSessions = sessions.data.filter(value => reference(value.payment_intent) === intent!.id);
      if (!sessions.has_more && matchingSessions.length === 1) {
        const id = identifier(matchingSessions[0]!.id, 'cs_test_');
        session = testObject(await client.checkout.sessions.retrieve(id), id);
        requireIdentity(reference(session.payment_intent) === intent.id);
      }
      if (!session && !invoice) {
        const payments = await client.invoicePayments.list({payment: {type: 'payment_intent', payment_intent: intent.id}, limit: 2});
        if (!payments.has_more && payments.data.length === 1) {
          const payment = payments.data[0]!;
          requireIdentity(payment.livemode === false && payment.payment.type === 'payment_intent' && reference(payment.payment.payment_intent) === intent.id);
          const id = identifier(reference(payment.invoice), 'in_');
          invoice = testObject(await client.invoices.retrieve(id, {expand: ['payments']}), id);
        }
      }
    }
    const invoiceId = reference(session?.invoice);
    if (invoiceId && !invoice) invoice = testObject(await client.invoices.retrieve(identifier(invoiceId, 'in_'), {expand: ['payments']}), invoiceId);
    const subscriptionId = reference(invoice?.parent?.type === 'subscription_details' ? invoice.parent.subscription_details?.subscription : undefined) ?? reference(session?.subscription);
    if (subscriptionId && !subscription) subscription = testObject(await client.subscriptions.retrieve(identifier(subscriptionId, 'sub_')), subscriptionId);
    if (subscription && !session && invoice?.billing_reason !== 'subscription_cycle') {
      const sessions = await client.checkout.sessions.list({subscription: subscription.id, limit: 2});
      const matches = sessions.data.filter((value) => !invoice || reference(value.invoice) === invoice.id);
      if (!sessions.has_more && matches.length === 1) {
        const id = identifier(matches[0]!.id, 'cs_test_');
        session = testObject(await client.checkout.sessions.retrieve(id), id);
      }
    }
    if (session && invoice) requireIdentity(reference(session.invoice) === invoice.id);
    if (session && subscription) requireIdentity(reference(session.subscription) === subscription.id);
    if (session && !invoice && reference(session.invoice)) {
      const id = identifier(reference(session.invoice), 'in_');
      invoice = testObject(await client.invoices.retrieve(id, {expand: ['payments']}), id);
      requireIdentity(reference(invoice.parent?.subscription_details?.subscription) === subscription?.id);
    }
    for (const line of invoice?.lines.data ?? []) requireIdentity(line.livemode === false);
    const payment = invoice?.payments?.data.length === 1 ? invoice.payments.data[0] : undefined;
    if (payment) requireIdentity(payment.livemode === false && reference(payment.invoice) === invoice!.id);
    const intentId = reference(session?.payment_intent) ?? reference(charge?.payment_intent) ?? reference(payment?.payment.type === 'payment_intent' ? payment.payment.payment_intent : undefined);
    if (intentId && !intent) intent = testObject(await client.paymentIntents.retrieve(identifier(intentId, 'pi_')), intentId);
    if (intent && payment?.payment.type === 'payment_intent') requireIdentity(reference(payment.payment.payment_intent) === intent.id);
    const chargeId = reference(intent?.latest_charge);
    if (chargeId && !charge) charge = testObject(await client.charges.retrieve(identifier(chargeId, 'ch_')), chargeId);
    if (intent && charge) requireIdentity(reference(charge.payment_intent) === intent.id && reference(intent.latest_charge) === charge.id);
    if (refund && intent) requireIdentity(reference(refund.payment_intent) === intent.id);
    if (dispute && reference(dispute.payment_intent)) requireIdentity(reference(dispute.payment_intent) === intent?.id);
    const customers = [session, invoice, subscription, intent, charge, refund].flatMap((value) => {
      const id = reference(value?.customer);
      return id ? [identifier(id, 'cus_')] : [];
    });
    const customerId = customers[0];
    requireIdentity(customerId && customers.every((id) => id === customerId));
    for (const value of [session, invoice, subscription, intent, charge]) if (value) requireIdentity(reference(value.customer) === customerId);
    return {hint, customerId, session, invoice, subscription, intent, charge, refund, dispute};
  }

  function scope(state: Canonical): StripeTestEventDiscovery {
    const reason = state.invoice?.billing_reason;
    const sessionMetadata = state.session?.metadata;
    const attemptId = sessionMetadata?.attemptId ?? state.session?.client_reference_id ?? undefined;
    const checkout = state.session ? {attemptId, workspaceId: sessionMetadata?.workspaceId, customerId: sessionMetadata?.customerId,
      catalogHash: sessionMetadata?.catalogHash, amountMinor: money(state.session.amount_total ?? 0), currency: state.session.currency ?? undefined} : undefined;
    return Object.freeze({hint: state.hint, provider: 'stripe', customerId: state.customerId,
      ...(state.session ? {checkoutSessionId: state.session.id} : {}), ...(state.invoice ? {invoiceId: state.invoice.id} : {}),
      ...(state.intent ? {paymentIntentId: state.intent.id} : {}), ...(state.charge ? {chargeId: state.charge.id} : {}),
      ...(state.subscription ? {externalSubscriptionId: state.subscription.id} : {}),
      ...((reason || checkout) ? {stripe: {...(reason ? {billingReason: reason} : {}), ...(checkout ? {checkout} : {})}} : {})});
  }

  async function discoverIdentity(hint: StripeTestEventHint): Promise<StripeTestEventDiscovery> {return scope(await canonical(hint));}

  async function refresh(input: StripeTestEventHint | StripeTestEventDiscovery, binding: StripeTestEventBinding, fence: ReconciliationFence): Promise<Canonical> {
    requireIdentity(binding.workspaceId === fence.workspaceId, 'Stripe binding and reconciliation fence workspace do not match.');
    identifier(binding.customerId, 'cus_');
    let state = await canonical('hint' in input ? input.hint : input);
    if (state.refund || state.dispute || state.hint.eventType === 'charge.refunded') {
      // Persisted aliases are selectors only. Re-fetch and prove the original payment relationship.
      const alias = binding.invoiceId ? {objectType: 'invoice', objectId: binding.invoiceId, eventType: 'invoice.paid' as const}
        : binding.checkoutSessionId ? {objectType: 'checkout.session', objectId: binding.checkoutSessionId, eventType: 'checkout.session.completed' as const} : undefined;
      if (alias) {
        const payment = await canonical({...state.hint, ...alias});
        requireIdentity(payment.customerId === state.customerId && payment.intent?.id === state.intent?.id && payment.charge?.id === state.charge?.id);
        state = {...state, session: payment.session, invoice: payment.invoice, subscription: payment.subscription};
      }
    }
    requireIdentity(state.customerId === binding.customerId);
    if ('hint' in input) {
      const fresh = scope(state);
      for (const key of ['customerId', 'checkoutSessionId', 'invoiceId', 'paymentIntentId', 'chargeId', 'externalSubscriptionId'] as const) {
        if (input[key] && fresh[key]) requireIdentity(input[key] === fresh[key], 'Stripe identity changed after discovery.');
      }
    }
    requireIdentity(binding.catalogSnapshot.provider === 'stripe');
    parseBillingCatalogSnapshot(binding.catalogSnapshot);
    return state;
  }

  async function priceFor(id: string | undefined): Promise<Price | undefined> {
    if (!id) return undefined;
    identifier(id, 'price_');
    const price = await client.prices.retrieve(id);
    // A different returned price is holding evidence; live objects must always be rejected.
    requireIdentity(price.livemode === false);
    return price;
  }

  function base(state: Canonical, binding: StripeTestEventBinding, fence: ReconciliationFence, supported: boolean, priceReference: string): PaymentObservation {
    const amount = state.intent?.amount_received ?? state.charge?.amount ?? state.invoice?.amount_paid ?? state.session?.amount_total ?? 0;
    return {provider: 'stripe', eventId: state.hint.eventId, eventType: state.invoice ? 'invoice.paid' : 'checkout.completed',
      workspaceId: binding.workspaceId, customerId: state.customerId, checkoutSessionId: state.session?.id,
      invoiceId: state.invoice?.id, paymentIntentId: state.intent?.id, chargeId: state.charge?.id,
      externalSubscriptionId: state.subscription?.id, amountMinor: money(amount), currency: state.intent?.currency ?? state.charge?.currency ?? state.invoice?.currency ?? state.session?.currency ?? undefined,
      paidAt: timestamp(state.invoice?.status_transitions.paid_at) ?? timestamp(state.charge?.created), fence,
      stripe: {supported, priceReference, paymentAmountMinor: money(amount)}};
  }

  async function pack(state: Canonical, binding: StripeTestEventBinding, fence: ReconciliationFence): Promise<PaymentObservation[]> {
    const session = state.session;
    if (session && (session.status !== 'complete' || session.payment_status !== 'paid')) return [];
    const lines = session ? await client.checkout.sessions.listLineItems(session.id, {limit: 100}) : undefined;
    const line = lines?.data[0];
    const linePriceId = reference(line?.price);
    const price = await priceFor(linePriceId);
    const expected = Number(binding.catalogSnapshot.amountMinor);
    const supported = !!session && binding.checkoutSessionId === session.id && session.mode === 'payment' && !state.invoice && !state.subscription &&
      !lines!.has_more && lines!.data.length === 1 && line?.quantity === 1 &&
      session.amount_total === expected && session.amount_subtotal === expected && session.currency === binding.catalogSnapshot.currency &&
      session.automatic_tax.enabled === false && empty(session.discounts) && !!session.total_details &&
      session.total_details.amount_discount === 0 && session.total_details.amount_tax === 0 && (session.total_details.amount_shipping ?? 0) === 0 &&
      line.amount_total === expected && line.amount_subtotal === expected && line.currency === binding.catalogSnapshot.currency &&
      line.amount_discount === 0 && line.amount_tax === 0 && empty(line.discounts) && empty(line.taxes) &&
      binding.catalogSnapshot.kind === 'pack' && linePriceId === binding.catalogSnapshot.priceReference && price?.id === linePriceId &&
      priceSupported(price, binding.catalogSnapshot) && cashSupported(state, binding.catalogSnapshot);
    return [base(state, binding, fence, supported, linePriceId ?? '')];
  }

  async function recurring(state: Canonical, binding: StripeTestEventBinding, fence: ReconciliationFence, historicalRecovery = false): Promise<PaymentObservation[]> {
    const invoice = state.invoice!;
    const line = invoice.lines.data[0];
    const linePriceId = reference(line?.pricing?.price_details?.price);
    const price = await priceFor(linePriceId);
    const reason = invoice.billing_reason;
    const initial = reason === 'subscription_create';
    const subscription = state.subscription;
    let checkout = state.session;
    if (initial && !checkout && binding.checkoutSessionId) checkout = testObject(await client.checkout.sessions.retrieve(binding.checkoutSessionId), binding.checkoutSessionId);
    if (checkout) requireIdentity(reference(checkout.customer) === state.customerId && reference(checkout.subscription) === subscription?.id);
    const payment = invoice.payments?.data[0];
    const expected = Number(binding.catalogSnapshot.amountMinor);
    const periodStart = timestamp(line?.period.start);
    const periodEnd = timestamp(line?.period.end);
    const item = subscription?.items.data[0];
    const details = line?.parent?.subscription_item_details;
    const nestedSubscriptionId = reference(details?.subscription);
    const lineSubscriptionId = reference(line?.subscription) ?? nestedSubscriptionId;
    const originalSubscriptionId = binding.externalSubscriptionId ?? lineSubscriptionId;
    const lineSubscriptionSupported = lineSubscriptionId === originalSubscriptionId && nestedSubscriptionId === originalSubscriptionId;
    const currentSubscriptionSupported = !!subscription && (!binding.externalSubscriptionId || binding.externalSubscriptionId === subscription.id);
    const supported = (historicalRecovery ? lineSubscriptionSupported : currentSubscriptionSupported) && (initial || reason === 'subscription_cycle') &&
      (!initial || !!checkout && checkout.id === binding.checkoutSessionId && checkout.status === 'complete' && checkout.payment_status === 'paid' && checkout.mode === 'subscription' && reference(checkout.invoice) === invoice.id) &&
      invoice.status === 'paid' && invoice.amount_due === expected && invoice.amount_paid === expected && invoice.amount_remaining === 0 &&
      invoice.total === expected && invoice.subtotal === expected && invoice.currency === binding.catalogSnapshot.currency &&
      invoice.starting_balance === 0 && (invoice.ending_balance === null || invoice.ending_balance === 0) && (invoice.amount_paid_off_stripe ?? 0) === 0 &&
      invoice.pre_payment_credit_notes_amount === 0 && invoice.post_payment_credit_notes_amount === 0 && invoice.automatic_tax.enabled === false &&
      empty(invoice.default_tax_rates) && empty(invoice.discounts) && empty(invoice.total_discount_amounts) && empty(invoice.total_taxes) && empty(invoice.total_pretax_credit_amounts) &&
      !invoice.lines.has_more && invoice.lines.data.length === 1 && !!line && line.livemode === false && line.invoice === invoice.id &&
      line.parent?.type === 'subscription_item_details' && lineSubscriptionSupported &&
      (historicalRecovery || details?.subscription_item === item?.id) && details?.proration === false && line.quantity === 1 &&
      (line.quantity_decimal === null || /^1(?:\.0+)?$/.test(String(line.quantity_decimal))) && line.amount === expected && line.subtotal === expected &&
      line.currency === invoice.currency && empty(line.discounts) && empty(line.discount_amounts) && empty(line.pretax_credit_amounts) && empty(line.taxes) &&
      !!periodStart && !!periodEnd && monthly(line.period.start, line.period.end) &&
      !!invoice.payments && !invoice.payments.has_more && invoice.payments.data.length === 1 && payment?.status === 'paid' &&
      payment.amount_paid === expected && payment.currency === invoice.currency && payment.payment.type === 'payment_intent' &&
      reference(payment.payment.payment_intent) === state.intent?.id && linePriceId === binding.catalogSnapshot.priceReference && price?.id === linePriceId &&
      (historicalRecovery ? priceSupported(price, binding.catalogSnapshot) : subscriptionSupported(subscription, price, binding.catalogSnapshot)) && cashSupported(state, binding.catalogSnapshot);
    const observation = base(state, binding, fence, supported, linePriceId ?? '');
    return [{...observation, checkoutSessionId: initial ? checkout?.id : undefined, periodStart, periodEnd,
      stripe: {...observation.stripe!, ...(reason === 'subscription_create' || reason === 'subscription_cycle' ? {billingReason: reason} : {})}}];
  }

  async function refunds(state: Canonical, binding: StripeTestEventBinding, fence: ReconciliationFence, selection?: Readonly<{refundId?: string}>): Promise<PaymentObservation[]> {
    requireIdentity(state.charge && state.intent);
    const charge = state.charge;
    const page = state.refund ? {data: [state.refund], has_more: false} : await client.refunds.list({charge: charge.id, limit: 100});
    requireIdentity(!page.has_more, 'Stripe refund list is incomplete; reconcile individual refund events.');
    const chosen = selection?.refundId ? page.data.filter((refund) => refund.id === selection.refundId) : page.data;
    if (selection?.refundId) requireIdentity(chosen.length === 1, 'Selected Stripe refund is not associated with the charge.');
    requireIdentity(new Set(chosen.map((refund) => refund.id)).size === chosen.length, 'Duplicate Stripe refund identity.');
    const evidence = (state.invoice ? await recurring(state, binding, fence, true) : await pack(state, binding, fence))[0];
    const observations: PaymentObservation[] = [];
    for (const item of chosen) {
      const refund = await client.refunds.retrieve(identifier(item.id, 're_'));
      requireIdentity(refund.id === item.id && reference(refund.charge) === charge.id && reference(refund.payment_intent) === state.intent.id &&
        (!reference(refund.customer) || reference(refund.customer) === state.customerId));
      if (refund.status !== 'succeeded' && refund.status !== 'failed' && refund.status !== 'canceled') continue;
      const supported = refund.status === 'succeeded' && evidence?.stripe?.supported === true && positive(refund.amount) && refund.amount <= charge.amount && refund.currency === charge.currency;
      const observation = base(state, binding, fence, supported, binding.catalogSnapshot.priceReference);
      observations.push({...observation, eventType: 'charge.refunded', refundId: refund.id, amountMinor: money(refund.amount),
        checkoutSessionId: evidence?.checkoutSessionId, invoiceId: evidence?.invoiceId, externalSubscriptionId: evidence?.externalSubscriptionId,
        periodStart: evidence?.periodStart, periodEnd: evidence?.periodEnd,
        stripe: {...observation.stripe!, ...(evidence?.stripe?.billingReason ? {billingReason: evidence.stripe.billingReason} : {})}});
    }
    return observations;
  }

  async function disputes(state: Canonical, binding: StripeTestEventBinding, fence: ReconciliationFence): Promise<PaymentObservation[]> {
    const dispute = state.dispute!;
    const opened = ['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review'].includes(dispute.status);
    // Warning closure, prevention and unknown states prove neither a loss nor a reinstatement.
    if (!opened && dispute.status !== 'lost' && dispute.status !== 'won') return [];
    const evidence = (state.invoice ? await recurring(state, binding, fence, true) : await pack(state, binding, fence))[0];
    const observation = evidence ?? base(state, binding, fence, false, '');
    const supported = evidence?.stripe?.supported === true && !!state.charge && positive(dispute.amount) &&
      dispute.amount <= state.charge.amount && dispute.currency === state.charge.currency;
    return [{...observation, eventType: dispute.status === 'won' ? 'charge.dispute.reversed' : dispute.status === 'lost' ? 'charge.dispute.lost' : 'charge.dispute.created',
      disputeId: dispute.id, amountMinor: money(dispute.amount), currency: dispute.currency,
      // Match recovery.ts's default key across opened/lost/won facts and require its prior loss on reversal.
      economicLossId: `dispute:${dispute.id}`, relatedEventId: dispute.status === 'won' ? dispute.id : undefined,
      stripe: {...observation.stripe!, supported}}];
  }

  async function normalize(input: StripeTestEventHint | StripeTestEventDiscovery, binding: StripeTestEventBinding, fence: ReconciliationFence, selection?: Readonly<{refundId?: string}>): Promise<PaymentObservation[]> {
    const state = await refresh(input, binding, fence);
    if (state.hint.objectType === 'subscription') return [];
    if (state.dispute) return disputes(state, binding, fence);
    if (state.hint.objectType === 'refund' || state.hint.eventType === 'charge.refunded') return refunds(state, binding, fence, selection);
    if (state.invoice) return recurring(state, binding, fence);
    return pack(state, binding, fence);
  }

  async function normalizeSubscription(input: StripeTestEventHint | StripeTestEventDiscovery, binding: StripeTestEventBinding, fence: ReconciliationFence): Promise<SubscriptionObservation | null> {
    const state = await refresh(input, binding, fence);
    const subscription = state.subscription;
    if (!subscription) return null;
    const item = subscription.items.data[0];
    const price = await priceFor(reference(item?.price));
    const bound = binding.externalSubscriptionId ? binding.externalSubscriptionId === subscription.id
      : !!binding.checkoutSessionId && state.session?.id === binding.checkoutSessionId && reference(state.session.subscription) === subscription.id;
    requireIdentity(bound && subscriptionSupported(subscription, price, binding.catalogSnapshot), 'Unsupported Stripe subscription terms require a reconciliation hold.');
    const statuses = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];
    requireIdentity(statuses.includes(subscription.status) && item && monthly(item.current_period_start, item.current_period_end), 'Unsupported Stripe subscription lifecycle or period.');
    return {provider: 'stripe', workspaceId: binding.workspaceId, customerId: state.customerId, externalId: subscription.id,
      catalogSnapshot: binding.catalogSnapshot, status: subscription.status as SubscriptionObservation['status'],
      periodStart: new Date(item.current_period_start * 1000), periodEnd: new Date(item.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end, checkoutSessionId: binding.checkoutSessionId, fence};
  }

  return Object.freeze({discoverIdentity, discover: discoverIdentity, normalize, normalizeSubscription});
}
