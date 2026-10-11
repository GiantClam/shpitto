import {getServerEnv} from '../../../../config/env.ts';
import {getAuthDatabase} from '../../../../lib/auth.ts';
import {handleAffiliateReferral} from '../../../../modules/affiliates/referral-http.ts';
import {createUnavailableAffiliateAuthority} from '../../../../modules/affiliates/runtime.ts';

export async function POST(request: Request) {
  const env = getServerEnv();
  return handleAffiliateReferral(request, {secret: env.affiliateReferralSecret, programId: env.affiliateProgramId, appUrl: env.appUrl, production: env.nodeEnv === 'production', getDatabase: getAuthDatabase, authority: createUnavailableAffiliateAuthority()});
}
