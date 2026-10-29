import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {transferWorkspaceOwnership} from '../../../../../modules/workspaces/commands.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, workspaceErrorResponse, workspaceIdFromParams} from '../../_shared.ts';

type RouteContext = {params: Promise<{workspaceId: string}>};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid) return NextResponse.json({error: 'A valid JSON object is required.'}, {status: 400});
    const body = parsed.body;
    commandKey(request, body);
    if (typeof body.targetUserId !== 'string') return NextResponse.json({error: 'targetUserId is required.'}, {status: 400});
    const {workspaceId} = await context.params;
    const result = await transferWorkspaceOwnership(getAuthDatabase(), workspaceIdFromParams({workspaceId}), actor, body.targetUserId);
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
