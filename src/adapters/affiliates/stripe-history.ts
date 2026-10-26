import type Stripe from 'stripe';

import type {AffiliatePayment} from '../../modules/affiliates/contracts.ts';
import type {billingOrders, billingPaymentAliases} from '../../db/schema/billing.ts';

type Order = Pick<typeof billingOrders.$inferSelect, 'id' | 'workspaceId' | 'provider' | 'customerId' | 'kind' | 'status' | 'currency' | 'paidMinor' | 'paidAt'>;
type PaymentAlias = Pick<typeof billingPaymentAliases.$inferSelect, 'workspaceId' | 'provider' | 'objectKind' | 'externalId' | 'orderId'>;
type CustomerIdentity = Readonly<{provider: string; customerId: string}>;
type StripePage = Readonly<{data: readonly Stripe.PaymentIntent[]; has_more: boolean}>;

export type StripeAffiliateHistoryClient = Readonly<{
  paymentIntents: Readonly<{list(params: Stripe.PaymentIntentListParams): Promise<StripePage>}>;
}>;

export type StripeAffiliateHistoryInput = Readonly<{
  workspaceId: string;
  customers: readonly CustomerIdentity[];
  orders: readonly Order[];
  aliases: readonly PaymentAlias[];
}>;

export type StripeAffiliateHistory = Readonly<{
  complete: boolean;
  customers: readonly CustomerIdentity[];
  payments: readonly AffiliatePayment[];
}>;

const MAX_CUSTOMERS = 100;
const MAX_PAGES_PER_CUSTOMER = 20;
const PAGE_SIZE = 100;

function incomplete(customers: readonly CustomerIdentity[]): StripeAffiliateHistory {
  return {complete: false, customers, payments: []};
}

/** Reconcile every known Stripe customer against its complete test-mode PaymentIntent history. */
export async function readStripeAffiliateHistory(
  input: StripeAffiliateHistoryInput,
  client: StripeAffiliateHistoryClient,
): Promise<StripeAffiliateHistory> {
  if (!/^[0-9a-f-]{36}$/i.test(input.workspaceId) || input.customers.length > MAX_CUSTOMERS) return incomplete(input.customers);
  const customerIds = input.customers.map((customer) => customer.customerId);
  if (input.customers.some((customer) => customer.provider !== 'stripe' || !/^cus_[A-Za-z0-9_]+$/.test(customer.customerId)) || new Set(customerIds).size !== customerIds.length) return incomplete(input.customers);

  const orders = input.orders.filter((order) => order.provider === 'stripe' && order.workspaceId === input.workspaceId && ['paid', 'refunded', 'held'].includes(order.status) && order.paidMinor > 0n && order.paidAt !== null);
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const paymentIntentByOrder = new Map<string, string>();
  const orderByPaymentIntent = new Map<string, Order>();
  for (const alias of input.aliases) {
    if (alias.workspaceId !== input.workspaceId || alias.provider !== 'stripe' || alias.objectKind !== 'payment_intent') continue;
    const order = orderById.get(alias.orderId);
    if (!order || order.customerId.length === 0 || paymentIntentByOrder.has(order.id)) return incomplete(input.customers);
    paymentIntentByOrder.set(order.id, alias.externalId);
    orderByPaymentIntent.set(alias.externalId, order);
  }
  if (orders.some((order) => !paymentIntentByOrder.has(order.id))) return incomplete(input.customers);

  const matchedPaymentIntents = new Set<string>();
  for (const customerId of customerIds) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    let completeCustomerHistory = false;
    for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_CUSTOMER; pageIndex++) {
      let page: StripePage;
      try {
        page = await client.paymentIntents.list({customer: customerId, limit: PAGE_SIZE, ...(cursor ? {starting_after: cursor} : {})});
      } catch {
        return incomplete(input.customers);
      }
      for (const intent of page.data) {
        const observedCustomerId = typeof intent.customer === 'string' ? intent.customer : intent.customer?.id;
        if (seen.has(intent.id) || intent.livemode || observedCustomerId !== customerId) return incomplete(input.customers);
        seen.add(intent.id);
        if (intent.status !== 'succeeded' || intent.amount_received <= 0) continue;
        const order = orderByPaymentIntent.get(intent.id);
        if (!order || order.customerId !== customerId || order.paidMinor !== BigInt(intent.amount_received) || order.currency !== intent.currency) return incomplete(input.customers);
        matchedPaymentIntents.add(intent.id);
      }
      if (!page.has_more) { completeCustomerHistory = true; break; }
      cursor = page.data.at(-1)?.id;
      if (!cursor) return incomplete(input.customers);
    }
    if (!completeCustomerHistory) return incomplete(input.customers);
  }

  if (matchedPaymentIntents.size !== orders.length) return incomplete(input.customers);
  const payments = orders.map((order) => ({
    paymentReference: order.id,
    kind: order.kind as AffiliatePayment['kind'],
    paidAt: order.paidAt!,
    amountMinor: order.paidMinor,
    currency: order.currency,
    historyComplete: order.status !== 'held',
  }));
  return {complete: payments.every((payment) => payment.historyComplete), customers: input.customers, payments};
}
