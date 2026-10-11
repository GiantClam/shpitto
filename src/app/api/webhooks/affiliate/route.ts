import {getServerEnv} from '../../../../config/env.ts';
import {getAuthDatabase} from '../../../../lib/auth.ts';
import {handleAffiliateNotification} from '../../../../modules/affiliates/notification-http.ts';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const env = getServerEnv();
  return handleAffiliateNotification(request, {secret: env.affiliateWebhookSecret, production: env.nodeEnv === 'production', getDatabase: getAuthDatabase});
}
