import {getAuthDatabase} from '../../../../lib/auth.ts';
import {ingestStripeWebhook} from '../../../../modules/billing/inbox.ts';
import {DomainError} from '../../../../db/contracts.ts';
import {getServerEnv} from '../../../../config/env.ts';
import {safeError, safeSuccess} from '../../workspaces/_shared.ts';

export const runtime = 'nodejs';

/** Local fixture-only Stripe-compatible ingress. Production requires a separately reviewed adapter. */
export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    if (env.nodeEnv === 'production') throw new DomainError('FORBIDDEN', 'The local billing webhook is disabled in production.');
    const secret = env.billingWebhookSecret;
    if (!secret) throw new DomainError('INFRASTRUCTURE', 'Billing webhook verification is not configured.');
    const rawBody = new Uint8Array(await request.arrayBuffer());
    const result = await ingestStripeWebhook(getAuthDatabase(), {rawBody, signatureHeader: request.headers.get('stripe-signature'), secret});
    return safeSuccess(result, result.duplicate ? 200 : 202);
  } catch (error) {
    return safeError(error);
  }
}
