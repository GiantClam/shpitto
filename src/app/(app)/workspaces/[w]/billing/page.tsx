import {headers} from 'next/headers';
import {and, eq} from 'drizzle-orm';

import {FixtureBillingPanel} from '../../../../../components/billing/fixture-billing-panel';
import {SiteShell} from '../../../../../components/shell/site-shell';
import {getStripeTestConfiguration, getRuntimeProfile} from '../../../../../config/env';
import {getBillingCatalog} from '../../../../../config/plans';
import {DomainError} from '../../../../../db/contracts';
import {workspaceMembers, workspaces} from '../../../../../db/schema/workspace';
import {auth, getAuthDatabase} from '../../../../../lib/auth';
import {getOwnerBillingView} from '../../../../../modules/billing/queries';
import {formatMinorCurrency} from '../../../../../modules/billing/presentation';
import {authorizeWorkspaceAccess} from '../../../../../modules/workspaces/authorize';

export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-US', {dateStyle: 'medium', timeZone: 'UTC'});

const grantSourceLabels: Record<string, string> = {
  subscription: 'Monthly subscription',
  purchase: 'Permanent credit pack',
  compensation: 'Service compensation',
  manual: 'Manual adjustment',
  demo: 'Demo credits',
};

function formatDate(value: Date | null): string {
  return value ? dateFormatter.format(value) : 'No expiry';
}

export default async function BillingPage({params}: {params: Promise<{w: string}>}) {
  const session = await auth.api.getSession({headers: await headers()});
  const userId = session?.user?.id;
  if (!userId) {
    return <SiteShell variant="workspace"><main className="page"><p className="eyebrow">Billing</p><h1>Sign in to view billing</h1><a className="button" href="/login">Open sign in</a></main></SiteShell>;
  }

  const workspaceId = (await params).w;
  const db = getAuthDatabase();
  try {
    await authorizeWorkspaceAccess(db, workspaceId, {userId});
    const membership = (await db.select({workspace: workspaces, role: workspaceMembers.role})
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1))[0];
    if (!membership || membership.role !== 'owner') throw new DomainError('FORBIDDEN', 'Only the workspace owner can view billing.');

    const view = await getOwnerBillingView(db, {actor: {userId}, workspaceId});
    const account = view.account;
    const stripeTest = getStripeTestConfiguration();
    return <SiteShell variant="workspace" workspaceId={workspaceId}>
      <main className="page">
        <p className="eyebrow">Workspace billing</p>
        <div className="workspace-heading">
          <div>
            <h1>{membership.workspace.name}</h1>
            <p>Owner-only payment history, cash refunds, credit grants and expiry.</p>
          </div>
          <span className={`state-pill state-${account?.status ?? 'hold'}`}>{account?.status ?? 'unavailable'}</span>
        </div>

        <section className="metric-grid" aria-label="Billing summary">
          <div className="metric"><span>Orders</span><strong>{view.orders.length}</strong></div>
          <div className="metric"><span>Subscriptions</span><strong>{view.subscriptions.length}</strong></div>
          <div className="metric"><span>Credit grants</span><strong>{view.grants.length}</strong></div>
          <div className={`metric ${(view.cases.length > 0 || account?.status === 'hold') ? 'metric-alert' : ''}`}>
            <span>Recovery</span>
            <strong>{view.cases.length > 0 ? `${view.cases.length} open` : account?.status === 'hold' ? 'Hold' : 'Clear'}</strong>
          </div>
        </section>

        <p className="status-card" role="note">
          Cash payments and cash refunds are shown separately from video credits. Credits measure service usage; a credit grant or reversal does not change the cash amount charged or refunded.
        </p>

        {stripeTest ? <FixtureBillingPanel workspaceId={workspaceId} products={stripeTest.catalog} mode="stripe_test" /> : getRuntimeProfile() === 'local' ? <FixtureBillingPanel workspaceId={workspaceId} products={getBillingCatalog('local')} /> : null}

        <section className="task-section">
          <div className="section-heading"><h2>Subscriptions</h2><span>{view.subscriptions.length}</span></div>
          {view.subscriptions.length === 0 ? <div className="status-card">No subscriptions.</div> : <div className="task-list">
            {view.subscriptions.map((subscription) => <article className="task-row" key={subscription.id}>
              <div>
                <strong>{subscription.status}</strong>
                <small>{subscription.cancelAtPeriodEnd ? 'Cancellation at period end' : 'No scheduled cancellation'}</small>
              </div>
              <div className="task-meta"><small>Current period ends {formatDate(subscription.periodEnd)}</small></div>
            </article>)}
          </div>}
        </section>

        <section className="credit-section">
          <div className="section-heading"><h2>Payment history</h2><span>{view.orders.length}</span></div>
          {view.orders.length === 0 ? <div className="status-card">No payment orders.</div> : <div className="credit-list">
            {view.orders.map((order) => <article className="credit-row" key={order.id}>
              <div>
                <strong>{order.kind === 'subscription' ? 'Monthly subscription' : 'Credit pack'} · {order.status}</strong>
                <small>Cash paid: {formatMinorCurrency(order.paidMinor, order.currency)}</small>
                <small>Cash refunded: {formatMinorCurrency(order.refundedMinor, order.currency)}</small>
              </div>
              <div><small>Provider: {order.provider === 'stripe' ? 'Stripe' : 'Local fixture'}</small></div>
            </article>)}
          </div>}
        </section>

        <section className="credit-section">
          <div className="section-heading"><h2>Credit grants</h2><span>{view.grants.length}</span></div>
          {view.grants.length === 0 ? <div className="status-card">No credit grants.</div> : <div className="credit-list">
            {view.grants.map((grant) => <article className="credit-row" key={grant.id}>
              <div>
                <strong>{grantSourceLabels[grant.source] ?? 'Credit grant'} · {grant.issued.toString()} credits</strong>
                <small>Available {grant.available.toString()} · reserved {grant.reserved.toString()} · used {grant.consumed.toString()}</small>
              </div>
              <div>
                <small>Expired {grant.expired.toString()} · reversed {grant.voided.toString()}</small>
                <small>{grant.expiresAt ? `Expires ${formatDate(grant.expiresAt)}` : 'Never expires'}</small>
              </div>
            </article>)}
          </div>}
        </section>

        {view.cases.length > 0 ? <section className="status-card" aria-label="Open recovery cases">
          <strong>Recovery hold</strong>
          <p>{account?.holdReason ?? 'Open billing recovery cases require review.'}</p>
          {view.cases.map((item) => <small key={item.id}>{item.reason}</small>)}
        </section> : null}
      </main>
    </SiteShell>;
  } catch (error) {
    if (error instanceof DomainError && (error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND')) {
      return <SiteShell variant="workspace" workspaceId={workspaceId}><main className="page"><p className="eyebrow">Billing</p><h1>Billing unavailable</h1><p>This billing view is restricted to the current workspace owner.</p></main></SiteShell>;
    }
    throw error;
  }
}
