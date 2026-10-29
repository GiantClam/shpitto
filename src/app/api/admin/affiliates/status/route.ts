import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {readAffiliateAdminStatus} from '../../../../../modules/affiliates/queries.ts';
import {currentWorkspaceActor, workspaceErrorResponse} from '../../../workspaces/_shared.ts';

export async function GET(request: Request) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    return NextResponse.json(await readAffiliateAdminStatus(getAuthDatabase(), actor));
  } catch (error) {return workspaceErrorResponse(error);}
}
