import type {AffiliateActionRequest, AffiliateAuthority, AffiliateHistory} from '../../modules/affiliates/runtime.ts';
import type {AffiliatePayment, ReferralTouch} from '../../modules/affiliates/contracts.ts';
import {workspaceUid} from '../../modules/affiliates/contracts.ts';
import {readFirstPromoterBatch} from './firstpromoter-contract.ts';

type JsonObject = Record<string, unknown>;
type FetchLike = typeof fetch;

export type FirstPromoterLiveConfig = Readonly<{
  accountId: string;
  apiKey: string;
  programId: string;
  campaignRevision: string;
  baseUrl?: string;
  autoPayoutsDisabledConfirmed?: boolean;
  fetcher?: FetchLike;
}>;

class FirstPromoterHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super('FirstPromoter request failed.');
    this.status = status;
  }
}

function bounded(value: string, name: string): string {
  if (!value || value.trim() !== value || value.length > 255 || /[\x00-\x1f\x7f]/.test(value)) throw new TypeError(`${name} is invalid.`);
  return value;
}

function baseUrl(value: string | undefined): string {
  const raw = value ?? 'https://api.firstpromoter.com/api/v2';
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new TypeError('FirstPromoter API base URL must be HTTPS without credentials or query parameters.');
  return url.toString().replace(/\/$/, '');
}

function object(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('FirstPromoter response shape is invalid.');
  return value as JsonObject;
}

function array(value: unknown): readonly JsonObject[] {
  if (!Array.isArray(value)) throw new Error('FirstPromoter response list is invalid.');
  return value.filter((item): item is JsonObject => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
}

function numericString(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' && /^\d+$/.test(value) ? value : null;
}

function isoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function campaignId(value: JsonObject): string | null {
  const nested = value.promoter_campaign && typeof value.promoter_campaign === 'object' && !Array.isArray(value.promoter_campaign) ? value.promoter_campaign as JsonObject : null;
  return numericString(nested?.campaign_id ?? value.campaign_id);
}

function promoterId(value: JsonObject): string | null {
  const nested = value.promoter_campaign && typeof value.promoter_campaign === 'object' && !Array.isArray(value.promoter_campaign) ? value.promoter_campaign as JsonObject : null;
  return numericString(nested?.promoter_id ?? value.promoter_id);
}

function eventId(value: JsonObject): string | null {
  return typeof value.event_id === 'string' && value.event_id.trim() ? value.event_id : null;
}

function payloadObject(value: unknown): JsonObject {
  return object(value);
}

function amountMinor(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('Affiliate amount is invalid.');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Affiliate amount is invalid.');
  return amount;
}

function currency(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z]{3}$/.test(value)) throw new Error('Affiliate currency is invalid.');
  return value.toUpperCase();
}

function referralMatches(value: JsonObject, input: ReferralTouch, programId: string): boolean {
  if (campaignId(value) !== programId) return false;
  const uid = typeof value.uid === 'string' ? value.uid : '';
  const id = numericString(value.id);
  const promoter = promoterId(value);
  return uid === input.touchReference || id === input.touchReference || promoter === input.affiliateId;
}

function status(value: unknown): 'eligible' | 'approved' | 'denied' | 'pending' {
  if (value === 'approved' || value === 'denied' || value === 'pending') return value;
  return 'eligible';
}

/**
 * FirstPromoter V2 Admin/Tracking adapter. The caller owns authorization,
 * durable identity, retry fencing and the decision to enable the provider.
 */
export function createFirstPromoterAuthority(config: FirstPromoterLiveConfig): AffiliateAuthority {
  const accountId = bounded(config.accountId, 'FirstPromoter account ID');
  const apiKey = bounded(config.apiKey, 'FirstPromoter API key');
  const programId = bounded(config.programId, 'FirstPromoter campaign ID');
  const campaignRevision = bounded(config.campaignRevision, 'FirstPromoter campaign revision');
  const origin = baseUrl(config.baseUrl);
  const fetcher = config.fetcher ?? fetch;
  const autoPayoutsDisabledConfirmed = config.autoPayoutsDisabledConfirmed === true;

  async function request(path: string, init: Readonly<RequestInit> = {}): Promise<unknown> {
    const response = await fetcher(`${origin}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'ACCOUNT-ID': accountId,
        accept: 'application/json',
        ...(init.body === undefined ? {} : {'content-type': 'application/json'}),
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new FirstPromoterHttpError(response.status);
    if (response.status === 204) return null;
    return response.json();
  }

  async function referrals(query: string): Promise<readonly JsonObject[]> {
    const params = new URLSearchParams({q: query});
    return array(await request(`/company/referrals?${params.toString()}`));
  }

  async function commissions(query: string): Promise<readonly JsonObject[]> {
    const params = new URLSearchParams({q: query});
    return array(await request(`/company/commissions?${params.toString()}`));
  }

  async function readAccount(): Promise<Awaited<ReturnType<AffiliateAuthority['readAccount']>>> {
    await request('/company/promoter_campaigns');
    await request('/company/payouts/group_by_promoters');
    return {
      accountId,
      programId,
      campaignRevision,
      automaticPayouts: !autoPayoutsDisabledConfirmed,
      firstPaymentOnly: true,
      complete: autoPayoutsDisabledConfirmed,
      checkedAt: new Date(),
    };
  }

  return Object.freeze({
    async verifyReference(input: ReferralTouch): Promise<'verified' | 'invalid' | 'unavailable'> {
      try {
        const matches = (await referrals(input.touchReference)).filter((value) => referralMatches(value, input, programId));
        return matches.length === 1 ? 'verified' : matches.length === 0 ? 'invalid' : 'unavailable';
      } catch (error) {
        if (error instanceof FirstPromoterHttpError && error.status === 404) return 'invalid';
        return 'unavailable';
      }
    },
    async readHistory(input: Readonly<{workspaceId: string; customers: readonly {provider: string; customerId: string}[]}>): Promise<AffiliateHistory> {
      const uid = workspaceUid(input.workspaceId);
      const [referralRows, commissionRows] = await Promise.all([referrals(uid), commissions(uid)]);
      const customers = referralRows.filter((value) => typeof value.uid === 'string' && value.uid === uid).map((value) => ({provider: 'firstpromoter', customerId: `referral:${String(value.id)}`}));
      const payments = commissionRows.flatMap((value): AffiliatePayment[] => {
        const reference = eventId(value);
        const paidAt = isoDate(value.created_at);
        const amount = typeof value.sale_amount === 'number' ? value.sale_amount : typeof value.original_sale_amount === 'number' ? value.original_sale_amount : null;
        if (!reference || !paidAt || amount === null || amount <= 0) return [];
        return [{paymentReference: reference, kind: 'pack', paidAt, amountMinor: BigInt(Math.trunc(amount)), currency: typeof value.original_sale_currency === 'string' ? value.original_sale_currency.toLowerCase() : 'usd', historyComplete: true}];
      });
      return {complete: true, customers, payments};
    },
    readAccount,
    async readCommission(input: Readonly<{workspaceId: string; paymentReference: string}>) {
      const rows = await commissions(input.paymentReference);
      const match = rows.find((value) => eventId(value) === input.paymentReference && campaignId(value) === programId);
      if (!match) return {accountId, programId, paymentReference: input.paymentReference, status: 'pending' as const, checkedAt: new Date()};
      return {accountId, programId, paymentReference: input.paymentReference, status: status(match.status), checkedAt: new Date()};
    },
    async deliver(input: Parameters<AffiliateAuthority['deliver']>[0]) {
      const payload = payloadObject(input.payload);
      const uid = typeof payload.uid === 'string' ? payload.uid : null;
      if (!uid) throw new Error('Affiliate delivery payload is missing uid.');
      if (input.eventKind === 'signup') {
        await request('/track/signup', {method: 'POST', body: JSON.stringify({uid, ref_id: payload.touchReference, skip_email_notification: true})});
      } else if (input.eventKind === 'sale') {
        await request('/track/sale', {method: 'POST', body: JSON.stringify({uid, event_id: input.eventReference, amount: amountMinor(payload.amountMinor), currency: currency(payload.currency), skip_email_notification: true})});
      } else if (input.eventKind === 'refund') {
        await request('/track/refund', {method: 'POST', body: JSON.stringify({uid, event_id: input.eventReference, amount: String(amountMinor(payload.amountMinor)), currency: currency(payload.currency), sale_event_id: payload.paymentReference, skip_email_notification: true})});
      } else {
        return {status: 'pending' as const, eventReference: input.eventReference, payloadDigest: input.payloadDigest};
      }
      return {status: 'acknowledged' as const, eventReference: input.eventReference, payloadDigest: input.payloadDigest};
    },
    async sendReviewAction(input: AffiliateActionRequest) {
      const rows = await commissions(input.paymentReference);
      const match = rows.find((value) => eventId(value) === input.paymentReference && campaignId(value) === input.programId);
      const commissionId = numericString(match?.id);
      if (!commissionId) throw new Error('FirstPromoter commission was not found.');
      const actionPath = input.action === 'approve' ? 'approve' : 'deny';
      const result = readFirstPromoterBatch(await request(`/company/commissions/${actionPath}`, {method: 'POST', body: JSON.stringify({ids: [Number(commissionId)]})}), 1);
      if (!result.complete) throw new Error('FirstPromoter commission batch did not complete successfully.');
      return {actionReference: input.actionReference, payloadDigest: input.payloadDigest, batchReference: String(result.id)};
    },
    async readReviewAction(input: Parameters<NonNullable<AffiliateAuthority['readReviewAction']>>[0]) {
      const rows = await commissions(input.paymentReference);
      const match = rows.find((value) => eventId(value) === input.paymentReference && campaignId(value) === input.programId);
      const remoteStatus = match?.status;
      return {actionReference: input.actionReference, payloadDigest: input.payloadDigest, status: remoteStatus === 'approved' ? 'succeeded' as const : remoteStatus === 'denied' ? 'failed' as const : 'pending' as const, providerStatus: typeof remoteStatus === 'string' ? remoteStatus : 'pending'};
    },
  });
}
