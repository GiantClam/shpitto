import {workspaceUid} from '../../modules/affiliates/contracts.ts';

/** V2 mapping reviewed against the official documentation on 2026-10-04.
 * This codec makes no network requests and does not enable an account adapter.
 */
type TrackingInput = Readonly<{workspaceId: string}> & (
  | Readonly<{kind: 'signup'; verifiedTouchReference: string}>
  | Readonly<{kind: 'sale'; eventReference: string; amountMinor: bigint; currency: string}>
  | Readonly<{kind: 'refund'; eventReference: string; paymentReference: string; amountMinor: bigint; currency: string}>
);

function reference(value: string): string {
  if (!value || value !== value.trim() || value.length > 255 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Provider identity must be a bounded nonempty reference.');
  return value;
}

export function firstPromoterTrackingRequest(input: TrackingInput): Readonly<{path: string; body: Readonly<Record<string, string | number | boolean>>}> {
  const uid = workspaceUid(input.workspaceId);
  if (input.kind === 'signup') return {path: '/track/signup', body: {uid, ref_id: reference(input.verifiedTouchReference), skip_email_notification: true}};
  // Extend only after reviewing the currency exponent and provider conversion contract.
  if (!['usd', 'eur', 'gbp', 'jpy'].includes(input.currency) || input.amountMinor <= 0n || input.amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Provider cash basis or currency is not supported.');
  const body = {uid, event_id: reference(input.eventReference), amount: Number(input.amountMinor), currency: input.currency.toUpperCase(), skip_email_notification: true};
  return input.kind === 'sale' ? {path: '/track/sale', body} : {path: '/track/refund', body: {...body, sale_event_id: reference(input.paymentReference), amount: input.amountMinor.toString()}};
}

export type FirstPromoterBatchStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'stopped';

/** A 200/202 or completed label alone is insufficient: verify every selected item. */
export function readFirstPromoterBatch(value: unknown, expectedCount: number): Readonly<{id: number; status: FirstPromoterBatchStatus; complete: boolean}> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isSafeInteger(expectedCount) || expectedCount < 1) throw new Error('Invalid commission batch evidence.');
  const row = value as Record<string, unknown>;
  if (!Number.isSafeInteger(row.id) || (row.id as number) < 1 || !['pending', 'in_progress', 'completed', 'failed', 'stopped'].includes(String(row.status))) throw new Error('Invalid commission batch identity or status.');
  for (const key of ['selected_total', 'processed_count', 'failed_count']) if (!Number.isSafeInteger(row[key]) || (row[key] as number) < 0) throw new Error('Incomplete commission batch counts.');
  if (row.selected_total !== expectedCount || (row.processed_count as number) > expectedCount || (row.failed_count as number) > expectedCount) throw new Error('Commission batch scope does not match.');
  return {id: row.id as number, status: row.status as FirstPromoterBatchStatus, complete: row.status === 'completed' && row.processed_count === expectedCount && row.failed_count === 0};
}
