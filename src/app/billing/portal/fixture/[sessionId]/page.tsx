import {notFound} from 'next/navigation';

import {SiteShell} from '../../../../../components/shell/site-shell';
import {getRuntimeProfile} from '../../../../../config/env';

export const dynamic = 'force-dynamic';

export default async function FixtureBillingPortalPage({params}: {params: Promise<{sessionId: string}>}) {
  if (getRuntimeProfile() === 'production') notFound();
  const {sessionId} = await params;
  if (!/^[-_A-Za-z0-9]{16,128}$/.test(sessionId)) notFound();
  return <SiteShell><main className="page"><p className="eyebrow">Local fixture portal</p><h1>Billing portal preview</h1><p>This local portal confirms that the owner handoff works without contacting a real payment provider.</p><div className="status-card"><strong>Fixture customer portal</strong><p>Subscription changes and payment methods are deferred until a real provider account is connected.</p><a className="button" href="/dashboard">Return to workspace</a></div></main></SiteShell>;
}
