import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {DomainError} from '../../../../../db/contracts.ts';
import {readAdminRecovery} from '../../../../../modules/operations/recovery.ts';
import {currentWorkspaceActor, workspaceErrorResponse, workspaceIdFromParams} from '../../../workspaces/_shared.ts';

export async function GET(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const workspaceId = workspaceIdFromParams(await context.params);
    const url = new URL(request.url);
    const taskIds = url.searchParams.getAll('taskId');
    if ([...url.searchParams.keys()].some((key) => !['purpose', 'taskId'].includes(key)) || taskIds.length > 100 || taskIds.some((id) => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) throw new DomainError('VALIDATION', 'Only purpose and up to 100 task UUIDs are accepted.');
    const result = await readAdminRecovery(getAuthDatabase(), {actor, workspaceId, purpose: url.searchParams.get('purpose') ?? '', taskIds});
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
