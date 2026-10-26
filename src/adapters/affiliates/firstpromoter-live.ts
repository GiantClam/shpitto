import type {AffiliateActionRequest, AffiliateAuthority, AffiliateHistory} from '../../modules/affiliates/runtime.ts';
import type {ReferralTouch} from '../../modules/affiliates/contracts.ts';
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
  nativeStripeTrackingDisabledConfirmed?: boolean;
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

function campaignId(value: JsonObject): string | null {
  const nested = value.promoter_campaign && typeof value.promoter_campaign === 'object' && !Array.isArray(value.promoter_campaign) ? value.promoter_campaign as JsonObject : null;
  return numericString(nested?.campaign_id ?? value.campaign_id);
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
  const campaign = value.campaign && typeof value.campaign === 'object' && !Array.isArray(value.campaign) ? value.campaign as JsonObject : null;
  if (numericString(campaign?.id) !== programId) return false;
  const url = typeof value.url === 'string' ? value.url : typeof value.ref_link === 'string' ? value.ref_link : '';
  try { return new URL(url).searchParams.get('fpr') === input.touchReference; } catch { return false; }
}

function status(value: unknown): 'eligible' | 'approved' | 'denied' | 'pending' {
  if (value === 'approved' || value === 'denied' || value === 'pending') return value;
  return 'eligible';
}

function campaignFirstPaymentOnly(value: JsonObject, expectedId: string): boolean {
  if (numericString(value.id) !== expectedId) return false;
  const rewards = Array.isArray(value.rewards_for_promoters) ? value.rewards_for_promoters : [];
  return rewards.some((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const reward = (entry as JsonObject).reward;
    if (!reward || typeof reward !== 'object' || Array.isArray(reward)) return false;
    const name = (reward as JsonObject).name;
    return typeof name === 'string' && /first\s+charge/i.test(name);
  });
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
  const nativeStripeTrackingDisabledConfirmed = config.nativeStripeTrackingDisabledConfirmed === true;

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

  async function promoterReferralLinks(promoterId: string): Promise<readonly JsonObject[]> {
    if (!/^\d{1,20}$/.test(promoterId)) throw new Error('FirstPromoter promoter ID is invalid.');
    return array(await request(`/company/promoters/${encodeURIComponent(promoterId)}/referral_links`));
  }

  async function findPromoterByReference(touchReference: string, expectedProgramId: string): Promise<string | null> {
    const params = new URLSearchParams({q: touchReference});
    const result = object(await request(`/company/promoters?${params.toString()}`));
    const rows = array(result.data);
    if (rows.length !== 1) return null;
    const promoter = rows[0]!;
    const promoterId = numericString(promoter.id);
    const enrollments = array(promoter.promoter_campaigns).filter((enrollment) => enrollment.state === 'accepted' && numericString(enrollment.campaign_id) === expectedProgramId);
    const matchingEnrollment = enrollments.filter((enrollment) => {
      if (enrollment.ref_token === touchReference) return true;
      const link = typeof enrollment.ref_link === 'string' ? enrollment.ref_link : typeof enrollment.direct_url === 'string' ? enrollment.direct_url : '';
      try { return new URL(link).searchParams.get('fpr') === touchReference; } catch { return false; }
    });
    return promoterId && matchingEnrollment.length === 1 ? promoterId : null;
  }

  async function commissions(query: string): Promise<readonly JsonObject[]> {
    const params = new URLSearchParams({q: query});
    return array(await request(`/company/commissions?${params.toString()}`));
  }

  async function readAccount(): Promise<Awaited<ReturnType<AffiliateAuthority['readAccount']>>> {
    const campaign = object(await request(`/company/campaigns/${encodeURIComponent(programId)}`));
    await request('/company/payouts/group_by_promoters');
    const firstPaymentOnly = campaignFirstPaymentOnly(campaign, programId);
    return {
      accountId,
      programId,
      campaignRevision,
      automaticPayouts: !autoPayoutsDisabledConfirmed,
      firstPaymentOnly,
      complete: autoPayoutsDisabledConfirmed && nativeStripeTrackingDisabledConfirmed && firstPaymentOnly,
      checkedAt: new Date(),
    };
  }

  return Object.freeze({
    async resolveReferral(input: Readonly<{touchReference: string; programId: string; capturedAt: Date; expiresAt: Date}>) {
      if (input.programId !== programId || !input.touchReference || input.touchReference.length > 255) return null;
      const promoter = await findPromoterByReference(input.touchReference, input.programId);
      if (!promoter) return null;
      const links = await promoterReferralLinks(promoter);
      const matches = links.filter((value) => referralMatches(value, {affiliateId: promoter, touchReference: input.touchReference, programId: input.programId, capturedAt: input.capturedAt, expiresAt: input.expiresAt}, programId));
      if (matches.length !== 1) return null;
      return {affiliateId: promoter, touchReference: input.touchReference, programId, capturedAt: input.capturedAt, expiresAt: input.expiresAt};
    },
    async verifyReference(input: ReferralTouch): Promise<'verified' | 'invalid' | 'unavailable'> {
      try {
        if (input.programId !== programId) return 'invalid';
        const promoter = await findPromoterByReference(input.touchReference, input.programId);
        if (promoter !== input.affiliateId) return 'invalid';
        const matches = (await promoterReferralLinks(input.affiliateId)).filter((value) => referralMatches(value, input, programId));
        return matches.length === 1 ? 'verified' : matches.length === 0 ? 'invalid' : 'unavailable';
      } catch (error) {
        if (error instanceof FirstPromoterHttpError && error.status === 404) return 'invalid';
        return 'unavailable';
      }
    },
    async readHistory(input: Readonly<{workspaceId: string; customers: readonly {provider: string; customerId: string}[]}>): Promise<AffiliateHistory> {
      // FirstPromoter reports referred commissions only; Stripe is the canonical payment ledger.
      workspaceUid(input.workspaceId);
      return {complete: false, customers: input.customers, payments: []};
    },
    readAccount,
    async readCommission(input: Readonly<{workspaceId: string; paymentReference: string}>) {
      const rows = await commissions(input.paymentReference);
      const match = rows.find((value) => eventId(value) === input.paymentReference && campaignId(value) === programId);
      if (!match) return {accountId, programId, paymentReference: input.paymentReference, status: 'pending' as const, checkedAt: new Date()};
      return {accountId, programId, paymentReference: input.paymentReference, status: status(match.status), checkedAt: new Date()};
    },
    async deliver(input: Parameters<AffiliateAuthority['deliver']>[0]) {
      const account = await readAccount();
      if (!account.complete || account.accountId !== input.accountId || account.programId !== input.programId) throw new Error('FirstPromoter account and campaign safety checks are incomplete.');
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
      const account = await readAccount();
      if (!account.complete || account.accountId !== input.accountId || account.programId !== input.programId) throw new Error('FirstPromoter account and campaign safety checks are incomplete.');
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
