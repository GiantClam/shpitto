import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {currentWorkspaceActor, workspaceErrorResponse} from '../../../workspaces/_shared.ts';
import {readAdminWorkspace} from '../../../../../modules/operations/queries.ts';

export async function GET(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const {workspaceId} = await context.params;
    const purpose = new URL(request.url).searchParams.get('purpose') ?? '';
    const result = await readAdminWorkspace(getAuthDatabase(), actor, workspaceId, purpose);
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
