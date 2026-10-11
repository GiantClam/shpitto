import {and, asc, desc, eq} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {billingAccounts, billingOrders, billingReconciliationCases, billingRefundRequests, billingSubscriptions} from '../../db/schema/billing.ts';
import {creditGrants} from '../../db/schema/workspace.ts';
import {inTransaction} from '../shared/transaction.ts';
import {requireCurrentOwner, type WorkspaceActor} from '../workspaces/policy.ts';

export async function getOwnerBillingView(db: AppDatabase, input: Readonly<{actor: WorkspaceActor; workspaceId: string}>) {
  return inTransaction(db, async (tx) => {
    await requireCurrentOwner(tx, input.workspaceId, input.actor);
    const account = (await tx.select().from(billingAccounts).where(eq(billingAccounts.workspaceId, input.workspaceId)).limit(1))[0] ?? null;
    const orders = await tx.select().from(billingOrders).where(eq(billingOrders.workspaceId, input.workspaceId)).orderBy(desc(billingOrders.createdAt), asc(billingOrders.id)).limit(50);
    const subscriptions = await tx.select().from(billingSubscriptions).where(eq(billingSubscriptions.workspaceId, input.workspaceId)).orderBy(desc(billingSubscriptions.updatedAt), asc(billingSubscriptions.id)).limit(20);
    const grants = await tx.select().from(creditGrants).where(eq(creditGrants.workspaceId, input.workspaceId)).orderBy(desc(creditGrants.createdAt), asc(creditGrants.id)).limit(100);
    const cases = await tx.select().from(billingReconciliationCases).where(and(eq(billingReconciliationCases.workspaceId, input.workspaceId), eq(billingReconciliationCases.status, 'open'))).orderBy(desc(billingReconciliationCases.createdAt), asc(billingReconciliationCases.id)).limit(50);
    const refundRequests = await tx.select().from(billingRefundRequests).where(eq(billingRefundRequests.workspaceId, input.workspaceId)).orderBy(desc(billingRefundRequests.createdAt), asc(billingRefundRequests.id)).limit(50);
    return {account, orders, subscriptions, grants, cases, refundRequests};
  });
}
