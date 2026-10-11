import type {AffiliateConfig} from '../../modules/affiliates/contracts.ts';

export type AffiliateReadback = Readonly<{accountId: string; programId: string; campaignRevision: string; checkedAt: Date}>;

export interface FirstPromoterAdapter {
  verifyReference(input: Readonly<{affiliateId: string; touchReference: string; programId: string}>): Promise<boolean>;
  readAccount(): Promise<AffiliateReadback>;
  deliver(input: Readonly<{eventKind: string; eventReference: string; workspaceUid: string; payloadDigest: string}>): Promise<'acknowledged' | 'pending'>;
}

/** Configuration alone cannot authorize a provider reference or acknowledge delivery. */
export function createDisabledFirstPromoterAdapter(_config: AffiliateConfig): FirstPromoterAdapter {
  return Object.freeze({
    async verifyReference(): Promise<boolean> {
      return false;
    },
    async readAccount(): Promise<AffiliateReadback> {
      throw new Error('Affiliate provider verification is unavailable.');
    },
    async deliver(): Promise<'acknowledged' | 'pending'> {
      throw new Error('Affiliate provider delivery is unavailable.');
    },
  });
}
