import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../lib/auth.ts';
import {currentWorkspaceActor, workspaceErrorResponse} from '../../workspaces/_shared.ts';
import {listAdminUsers} from '../../../../modules/operations/queries.ts';

export async function GET(request: Request) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const url = new URL(request.url);
    const result = await listAdminUsers(getAuthDatabase(), actor, {page: Number(url.searchParams.get('page') ?? 1), pageSize: Number(url.searchParams.get('pageSize') ?? 50), filter: url.searchParams.get('filter') ?? undefined, status: url.searchParams.get('status') ?? undefined, sort: url.searchParams.get('sort') ?? undefined, direction: url.searchParams.get('direction') === 'asc' ? 'asc' : 'desc'});
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
