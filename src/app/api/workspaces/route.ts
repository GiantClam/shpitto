import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../lib/auth.ts';
import {createTeamWorkspace} from '../../../modules/workspaces/commands.ts';
import {referralTouchFromRequest} from '../../../modules/affiliates/request.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, workspaceErrorResponse} from './_shared.ts';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid) return NextResponse.json({error: 'A valid JSON object is required.'}, {status: 400});
    const body = parsed.body;
    const workspaceName = body.workspaceName === undefined ? 'Team workspace' : body.workspaceName;
    if (typeof workspaceName !== 'string') return NextResponse.json({error: 'workspaceName must be a string.'}, {status: 400});
    const result = await createTeamWorkspace(getAuthDatabase(), actor, workspaceName, {
      actorUserId: actor.userId,
      commandName: 'workspace.create-team',
      idempotencyKey: commandKey(request, body),
      payload: {workspaceName},
    }, referralTouchFromRequest(request));
    return NextResponse.json(result, {status: 201});
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
