import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {leaveWorkspace} from '../../../../../modules/workspaces/commands.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, workspaceErrorResponse, workspaceIdFromParams} from '../../_shared.ts';

type RouteContext = {params: Promise<{workspaceId: string}>};

async function handle(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    commandKey(request, {});
    const {workspaceId} = await context.params;
    const result = await leaveWorkspace(getAuthDatabase(), workspaceIdFromParams({workspaceId}), actor);
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

export const POST = handle;
export const DELETE = handle;
