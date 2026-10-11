import {and, eq} from 'drizzle-orm';
import {headers} from 'next/headers';
import {notFound} from 'next/navigation';

import {SiteShell} from '../../../../components/shell/site-shell';
import {billingCheckoutAttempts} from '../../../../db/schema/billing';
import {getAuthDatabase, auth} from '../../../../lib/auth';
import {parseBillingCatalogSnapshot} from '../../../../modules/billing/contracts';
import {FixtureCheckoutClient} from './fixture-checkout-client';
import {getRuntimeProfile} from '../../../../config/env';

export const dynamic = 'force-dynamic';

export default async function FixtureCheckoutPage({params}: {params: Promise<{sessionId: string}>}) {
  if (getRuntimeProfile() === 'production') notFound();
  const {sessionId} = await params;
  if (!/^[-_A-Za-z0-9]{16,128}$/.test(sessionId)) notFound();
  const session = await auth.api.getSession({headers: await headers()});
  if (!session?.user?.id) {
    return <SiteShell><main className="page"><p className="eyebrow">Local fixture checkout</p><h1>Sign in to continue</h1><p>This checkout belongs to the current workspace owner.</p><a className="button" href="/login">Open sign in</a></main></SiteShell>;
  }
  const db = getAuthDatabase();
  const attempt = (await db.select({id: billingCheckoutAttempts.id, workspaceId: billingCheckoutAttempts.workspaceId, customerId: billingCheckoutAttempts.customerId, kind: billingCheckoutAttempts.kind, status: billingCheckoutAttempts.status, catalogSnapshot: billingCheckoutAttempts.catalogSnapshot}).from(billingCheckoutAttempts).where(and(eq(billingCheckoutAttempts.provider, 'fixture'), eq(billingCheckoutAttempts.stripeSessionId, `fixture_session_${sessionId}`))).limit(1))[0];
  if (!attempt) notFound();
  const catalog = parseBillingCatalogSnapshot(attempt.catalogSnapshot);
  const amount = (Number(catalog.amountMinor) / 100).toFixed(2);
  return <SiteShell><main className="page"><p className="eyebrow">Local fixture checkout</p><h1>Complete your {catalog.kind === 'subscription' ? 'monthly plan' : 'credit pack'}</h1><p>This is a local Mock payment page. It never contacts Stripe or charges a real account.</p><section className="generation-panel fixture-checkout-card"><div className="section-heading"><h2>{catalog.productKey}</h2><span className={`state-pill state-${attempt.status}`}>{attempt.status}</span></div><dl className="fixture-summary"><div><dt>Amount</dt><dd>{catalog.currency.toUpperCase()} {amount}</dd></div><div><dt>Credits</dt><dd>{catalog.credits}</dd></div><div><dt>Workspace</dt><dd>{attempt.workspaceId}</dd></div></dl><FixtureCheckoutClient sessionId={sessionId} workspaceId={attempt.workspaceId} status={attempt.status} /></section></main></SiteShell>;
}
