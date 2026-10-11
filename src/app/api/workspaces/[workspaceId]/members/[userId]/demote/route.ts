import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../../../lib/auth.ts';
import {demoteWorkspaceMember} from '../../../../../../../modules/workspaces/commands.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, workspaceErrorResponse, workspaceIdFromParams} from '../../../../_shared.ts';

type RouteContext = {params: Promise<{workspaceId: string; userId: string}>};

async function handle(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    commandKey(request, {});
    const params = await context.params;
    const result = await demoteWorkspaceMember(getAuthDatabase(), workspaceIdFromParams(params), actor, params.userId);
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

export const POST = handle;
export const PATCH = handle;
