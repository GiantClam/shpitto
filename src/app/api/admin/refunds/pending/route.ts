import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {readPendingOperatorRefunds} from '../../../../../modules/billing/refund-retry.ts';
import {currentWorkspaceActor, workspaceErrorResponse, workspaceIdFromParams} from '../../../workspaces/_shared.ts';

export async function GET(request: Request) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const query = new URL(request.url).searchParams;
    const workspaceId = workspaceIdFromParams({workspaceId: query.get('workspaceId') ?? undefined});
    return NextResponse.json(await readPendingOperatorRefunds(getAuthDatabase(), {actor, workspaceId, purpose: query.get('purpose') ?? '', page: Number(query.get('page') ?? 1), pageSize: Number(query.get('pageSize') ?? 25)}));
  } catch (error) {return workspaceErrorResponse(error);}
}
