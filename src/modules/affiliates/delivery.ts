import {createHash} from 'node:crypto';

import type {AffiliatePayment} from './contracts.ts';

export type DeliveryIntent = Readonly<{eventKind: 'signup' | 'sale' | 'refund' | 'dispute'; eventReference: string; workspaceUid: string; payloadDigest: string}>;

export function deliveryIntent(eventKind: DeliveryIntent['eventKind'], eventReference: string, workspaceUid: string, payload: unknown): DeliveryIntent {
  const payloadDigest = createHash('sha256').update(JSON.stringify(payload, (_key, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');
  return {eventKind, eventReference, workspaceUid, payloadDigest};
}

export function saleIntent(payment: AffiliatePayment, workspaceUid: string): DeliveryIntent {
  return deliveryIntent('sale', payment.paymentReference, workspaceUid, {workspaceUid, paymentReference: payment.paymentReference, kind: payment.kind, paidAt: payment.paidAt.toISOString(), amountMinor: payment.amountMinor.toString(), currency: payment.currency});
}

export function refundIntent(paymentReference: string, refundReference: string, amountMinor: bigint, workspaceUid: string): DeliveryIntent {
  if (!refundReference.trim() || !paymentReference.trim() || amountMinor <= 0n) throw new Error('A confirmed refund identity and positive amount are required.');
  return deliveryIntent('refund', refundReference, workspaceUid, {workspaceUid, paymentReference, refundReference, amountMinor: amountMinor.toString()});
}

export function isDuplicateDelivery(existing: readonly DeliveryIntent[], intent: DeliveryIntent): boolean {
  const sameIdentity = existing.filter((entry) => entry.eventKind === intent.eventKind && entry.eventReference === intent.eventReference);
  if (sameIdentity.some((entry) => entry.payloadDigest !== intent.payloadDigest || entry.workspaceUid !== intent.workspaceUid)) throw new Error('Affiliate delivery identity conflicts with recorded semantics.');
  return sameIdentity.length > 0;
}
