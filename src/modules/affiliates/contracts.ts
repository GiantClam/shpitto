export type AffiliateProvider = 'firstpromoter';
export type AffiliateStatus = 'disabled' | 'enabled';
export type AttributionStatus = 'unattributed' | 'pending' | 'verified' | 'invalid' | 'held';
export type AffiliatePaymentKind = 'subscription' | 'pack';
export type AffiliateSaleStatus = 'pending' | 'acknowledged' | 'held' | 'denied' | 'failed';

export type AffiliateConfig = Readonly<{
  enabled: AffiliateStatus;
  provider: AffiliateProvider;
  accountId: string | null;
  programId: string | null;
  providerCampaignRevision: string;
  commissionPolicy: 'first_payment' | 'provider_campaign';
  autoPayoutEnabled: 'disabled';
  dashboardUrl: string | null;
  policyVersion: number;
}>;

export type ReferralTouch = Readonly<{
  affiliateId: string;
  touchReference: string;
  programId: string;
  capturedAt: Date;
  expiresAt: Date;
}>;

export type AffiliatePayment = Readonly<{
  paymentReference: string;
  kind: AffiliatePaymentKind;
  paidAt: Date;
  amountMinor: bigint;
  currency: string;
  historyComplete: boolean;
}>;

export type AffiliateEligibility = Readonly<{
  firstPaymentReference: string | null;
  status: 'eligible' | 'held' | 'unattributed';
  reason: 'first_payment' | 'history_incomplete' | 'no_payment' | 'already_exported' | 'older_payment_conflict';
}>;

export function workspaceUid(workspaceId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) throw new Error('workspaceId must be a UUID.');
  return 'workspace:' + workspaceId.toLowerCase();
}

export function defaultAffiliateConfig(overrides: Partial<AffiliateConfig> = {}): AffiliateConfig {
  return Object.freeze({
    enabled: overrides.enabled ?? 'disabled',
    provider: 'firstpromoter',
    accountId: overrides.accountId ?? null,
    programId: overrides.programId ?? null,
    providerCampaignRevision: overrides.providerCampaignRevision ?? 'first-payment-v1',
    commissionPolicy: overrides.commissionPolicy ?? 'first_payment',
    autoPayoutEnabled: 'disabled',
    dashboardUrl: overrides.dashboardUrl ?? null,
    policyVersion: overrides.policyVersion ?? 1,
  });
}
