import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../lib/auth.ts';
import {currentWorkspaceActor, workspaceErrorResponse} from '../../workspaces/_shared.ts';
import {listAdminWorkspaces} from '../../../../modules/operations/queries.ts';

export async function GET(request: Request) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const url = new URL(request.url);
    const result = await listAdminWorkspaces(getAuthDatabase(), actor, {page: Number(url.searchParams.get('page') ?? 1), pageSize: Number(url.searchParams.get('pageSize') ?? 50), filter: url.searchParams.get('filter') ?? undefined, status: url.searchParams.get('status') ?? undefined});
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
