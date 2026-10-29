import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../../lib/auth.ts';
import {parseWorkspaceDetailQuery, readAdminWorkspaceDetails} from '../../../../../../modules/operations/workspace-details.ts';
import {currentWorkspaceActor, workspaceErrorResponse, workspaceIdFromParams} from '../../../../workspaces/_shared.ts';

export async function GET(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const workspaceId = workspaceIdFromParams(await context.params);
    const query = parseWorkspaceDetailQuery(new URL(request.url).searchParams);
    return NextResponse.json(await readAdminWorkspaceDetails(getAuthDatabase(), {actor, workspaceId, ...query}));
  } catch (error) {return workspaceErrorResponse(error);}
}
