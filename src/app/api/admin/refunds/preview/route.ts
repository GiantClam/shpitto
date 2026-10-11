import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {previewBillingRefundForOperator} from '../../../../../modules/billing/refund-preview.ts';
import {currentWorkspaceActor, workspaceErrorResponse} from '../../../workspaces/_shared.ts';

export async function GET(request: Request) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const orderId = url.searchParams.get('orderId');
    const purpose = url.searchParams.get('purpose');
    const amountMinor = url.searchParams.get('amountMinor');
    if (!workspaceId || !orderId || !purpose || (amountMinor !== null && !/^[0-9]+$/.test(amountMinor))) return NextResponse.json({error: 'workspaceId, orderId and purpose are required.'}, {status: 400});
    const result = await previewBillingRefundForOperator(getAuthDatabase(), {actor, workspaceId, orderId, purpose, amountMinor: amountMinor === null ? undefined : BigInt(amountMinor)});
    return NextResponse.json({...result, amountMinor: result.amountMinor.toString(), creditIssued: result.creditIssued.toString(), creditAvailable: result.creditAvailable.toString(), creditReserved: result.creditReserved.toString(), creditConsumed: result.creditConsumed.toString()});
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
