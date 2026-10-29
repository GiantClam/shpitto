import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../lib/auth.ts';
import {readAdminMe} from '../../../../modules/operations/queries.ts';
import {currentWorkspaceActor, workspaceErrorResponse} from '../../workspaces/_shared.ts';

export async function GET(request: Request) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const result = await readAdminMe(getAuthDatabase(), actor);
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
