import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../../../../lib/auth.ts';
import {claimDispatch} from '../../../../../../../modules/generation/lifecycle.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, safeError, safeSuccess, workspaceIdFromParams} from '../../../../../../../app/api/workspaces/_shared.ts';
import {DomainError} from '../../../../../../../db/contracts.ts';

type RouteContext = {params: Promise<{workspaceId: string; taskId: string}>};

function taskIdFromParams(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new DomainError('VALIDATION', 'taskId must be a UUID.');
  }
  return value;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid) return safeError(new DomainError('VALIDATION', 'A valid JSON object is required.'));
    const provider = parsed.body.provider;
    if (provider !== undefined && typeof provider !== 'string') return safeError(new DomainError('VALIDATION', 'provider must be a string.'));
    const {workspaceId, taskId} = await context.params;
    const result = await claimDispatch(getAuthDatabase(), {
      actor,
      workspaceId: workspaceIdFromParams({workspaceId}),
      taskId: taskIdFromParams(taskId),
      idempotencyKey: commandKey(request, parsed.body),
      provider,
    });
    return safeSuccess(result);
  } catch (error) {
    return safeError(error);
  }
}
