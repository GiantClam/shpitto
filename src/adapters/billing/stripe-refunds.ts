import {and, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {billingOrders, billingPaymentAliases, billingRefundRequests} from '../../db/schema/billing.ts';
import type {BillingRefundInput, BillingRefundProvider, BillingRefundProviderResult, BillingRefundReference} from './refunds.ts';
import type {StripeTestAdapter, StripeTestRefundInput, StripeTestRefundResult} from './stripe-test.ts';

export type StripeRefundAdapter = Pick<StripeTestAdapter, 'createRefund' | 'retrieveRefund' | 'lookupRefund'>;

/** Database-bound bridge. Payment targets, customer, money and metadata always come from durable facts.
 * The injected adapter is the sole authority for remote observations; no configuration/env is read.
 */
export function createStripeRefundProvider(db: AppDatabase, adapter: StripeRefundAdapter): BillingRefundProvider {
  async function binding(input: BillingRefundReference, money?: BillingRefundInput) {
    const rows = await db.select({request: billingRefundRequests, order: billingOrders, alias: billingPaymentAliases})
      .from(billingRefundRequests)
      .innerJoin(billingOrders, and(eq(billingOrders.id, billingRefundRequests.orderId), eq(billingOrders.workspaceId, billingRefundRequests.workspaceId), eq(billingOrders.provider, billingRefundRequests.provider)))
      .innerJoin(billingPaymentAliases, and(eq(billingPaymentAliases.orderId, billingOrders.id), eq(billingPaymentAliases.workspaceId, billingOrders.workspaceId), eq(billingPaymentAliases.provider, billingOrders.provider), eq(billingPaymentAliases.objectKind, 'payment_intent')))
      .where(eq(billingRefundRequests.id, input.requestId)).limit(2);
    if (rows.length !== 1) return null;
    const {request, order, alias} = rows[0];
    if (request.provider !== 'stripe' || request.orderId !== input.orderId || request.idempotencyKey !== input.idempotencyKey || request.currency !== order.currency || request.amountMinor <= 0n || request.amountMinor > order.paidMinor || !/^pi_[A-Za-z0-9_]+$/.test(alias.externalId) || !order.customerId || (money && (money.amountMinor !== request.amountMinor || money.currency !== request.currency))) return null;
    const bound: StripeTestRefundInput = {workspaceId: request.workspaceId, customerId: order.customerId, requestId: request.id, orderId: order.id, paymentIntentId: alias.externalId, amountMinor: request.amountMinor.toString(), currency: request.currency, idempotencyKey: request.idempotencyKey};
    return {bound, request};
  }

  function result(observation: StripeTestRefundResult, input: StripeTestRefundInput, expectedId?: string): BillingRefundProviderResult {
    // Adapter problems (including failed validation/HTTP rejection) are not proof of remote failure.
    if (!('refundId' in observation) || !/^re_[A-Za-z0-9_-]+$/.test(observation.refundId) || (expectedId && observation.refundId !== expectedId) || observation.paymentIntentId !== input.paymentIntentId || observation.customerId !== input.customerId || observation.amountMinor !== input.amountMinor || observation.currency !== input.currency) return {unknown: true};
    const validStatus = observation.status === 'succeeded' ? observation.providerStatus === 'succeeded' : observation.status === 'pending' ? ['pending', 'requires_action'].includes(observation.providerStatus) : observation.status === 'failed' && ['failed', 'canceled'].includes(observation.providerStatus);
    return validStatus ? {status: observation.status, externalId: observation.refundId, amountMinor: BigInt(input.amountMinor)} : {unknown: true};
  }

  async function observe(mode: 'create' | 'lookup' | 'retrieve', input: BillingRefundReference, money?: BillingRefundInput, externalId?: string): Promise<BillingRefundProviderResult> {
    try {
      const context = await binding(input, money);
      if (!context || (externalId !== undefined && (!/^re_[A-Za-z0-9_-]+$/.test(externalId) || (context.request.externalId && context.request.externalId !== externalId)))) return {unknown: true};
      const {bound, request} = context;
      const refundId = externalId ?? request.externalId;
      const observation = refundId ? await adapter.retrieveRefund({...bound, refundId})
        : mode === 'create' && request.status === 'pending' ? await adapter.createRefund(bound)
        : mode === 'retrieve' ? null : await adapter.lookupRefund(bound);
      return observation ? result(observation, bound, refundId ?? undefined) : {unknown: true};
    } catch { return {unknown: true}; }
  }

  return Object.freeze({
    provider: 'stripe' as const,
    createRefund: (input: BillingRefundInput) => observe('create', input, input),
    lookupRefund: (input: BillingRefundReference) => observe('lookup', input),
    retrieveRefund: (input: BillingRefundInput & Readonly<{externalId: string}>) => observe('retrieve', input, input, input.externalId),
  });
}
