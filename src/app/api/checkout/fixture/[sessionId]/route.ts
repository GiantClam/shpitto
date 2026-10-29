import {randomUUID} from 'node:crypto';

import {and, eq} from 'drizzle-orm';

import {getRuntimeProfile, getServerEnv} from '../../../../../config/env.ts';
import {signFixtureWebhook} from '../../../../../adapters/billing/stripe-webhooks.ts';
import {billingCheckoutAttempts} from '../../../../../db/schema/billing.ts';
import {DomainError} from '../../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {parseBillingCatalogSnapshot} from '../../../../../modules/billing/contracts.ts';
import {ingestStripeWebhook} from '../../../../../modules/billing/inbox.ts';
import {inTransaction} from '../../../../../modules/shared/transaction.ts';
import {requireCurrentOwner} from '../../../../../modules/workspaces/policy.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, safeError, safeSuccess} from '../../../workspaces/_shared.ts';

const ACTIONS = new Set(['success', 'failed', 'refund', 'dispute']);

export async function POST(request: Request, context: {params: Promise<{sessionId: string}>}) {
  try {
    assertSameOrigin(request);
    if (getRuntimeProfile() === 'production') throw new DomainError('FORBIDDEN', 'Fixture checkout is disabled in production.');
    const actor = await currentWorkspaceActor(request);
    if (!actor) throw new DomainError('FORBIDDEN', 'Authentication is required.');
    const {sessionId} = await context.params;
    if (!/^[-_A-Za-z0-9]{16,128}$/.test(sessionId)) throw new DomainError('VALIDATION', 'The checkout session is invalid.');
    const parsed = await readJson(request);
    if (!parsed.valid || typeof parsed.body.action !== 'string' || !ACTIONS.has(parsed.body.action)) throw new DomainError('VALIDATION', 'A supported fixture action is required.');
    const action = parsed.body.action as 'success' | 'failed' | 'refund' | 'dispute';
    const db = getAuthDatabase();
    const attempt = await inTransaction(db, async (tx) => {
      const row = (await tx.select().from(billingCheckoutAttempts).where(and(eq(billingCheckoutAttempts.provider, 'fixture'), eq(billingCheckoutAttempts.stripeSessionId, `fixture_session_${sessionId}`))).for('update').limit(1))[0];
      if (!row) throw new DomainError('NOT_FOUND', 'The checkout session was not found.');
      await requireCurrentOwner(tx, row.workspaceId, actor);
      return row;
    });
    const catalog = parseBillingCatalogSnapshot(attempt.catalogSnapshot);
    const now = new Date();
    const eventId = `fixture_${action}_${sessionId}`;
    const paymentIntentId = `fixture_payment_${sessionId}`;
    const chargeId = `fixture_charge_${sessionId}`;
    const periodStart = now.toISOString();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const eventType = action === 'success' ? 'checkout.completed' : action === 'failed' ? 'payment.failed' : action === 'refund' ? 'charge.refunded' : 'charge.dispute.created';
    const object: Record<string, string> = {checkoutSessionId: `fixture_session_${sessionId}`, workspaceId: attempt.workspaceId, customerId: attempt.customerId, productKey: catalog.productKey, amountMinor: catalog.amountMinor, currency: catalog.currency, paymentIntentId, chargeId, paidAt: now.toISOString()};
    if (catalog.kind === 'subscription') Object.assign(object, {periodStart, periodEnd, externalSubscriptionId: `fixture_subscription_${sessionId}`});
    if (action === 'refund') Object.assign(object, {refundId: `fixture_refund_${sessionId}`, relatedEventId: `fixture_success_${sessionId}`});
    if (action === 'dispute') Object.assign(object, {disputeId: `fixture_dispute_${sessionId}`, relatedEventId: `fixture_success_${sessionId}`});
    const rawBody = new TextEncoder().encode(JSON.stringify({id: eventId, type: eventType, data: {object}}));
    const result = await ingestStripeWebhook(db, {rawBody, signatureHeader: signFixtureWebhook(rawBody, getServerEnv().billingWebhookSecret), secret: getServerEnv().billingWebhookSecret, now});
    return safeSuccess({action, commandKey: commandKey(request, parsed.body), ...result});
  } catch (error) {
    return safeError(error);
  }
}
