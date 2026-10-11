import type {AffiliateConfig} from './contracts.ts';

export function assertCampaignRevision(config: AffiliateConfig, reviewedRevision: string | null): void {
  if (config.commissionPolicy === 'first_payment') return;
  if (!reviewedRevision || reviewedRevision !== config.providerCampaignRevision) throw new Error('Affiliate campaign revision requires matching review.');
}

export function isFirstPayment(config: AffiliateConfig, paymentReference: string, firstPaymentReference: string | null): boolean {
  return config.commissionPolicy === 'first_payment' && firstPaymentReference === paymentReference;
}

export function shouldDenyLaterPayment(config: AffiliateConfig, paymentReference: string, firstPaymentReference: string | null): boolean {
  return config.commissionPolicy === 'first_payment' && Boolean(firstPaymentReference) && paymentReference !== firstPaymentReference;
}
