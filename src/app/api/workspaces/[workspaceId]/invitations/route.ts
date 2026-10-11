import {NextResponse} from 'next/server';

import {getServerEnv, getRuntimeProfile} from '../../../../../config/env.ts';
import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {createTeamInvitation} from '../../../../../modules/workspaces/invitations.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, workspaceErrorResponse, workspaceIdFromParams} from '../../_shared.ts';

type RouteContext = {params: Promise<{workspaceId: string}>};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid) return NextResponse.json({error: 'A valid JSON object is required.'}, {status: 400});
    commandKey(request, parsed.body);
    if (typeof parsed.body.email !== 'string') {
      return NextResponse.json({error: 'email is required.'}, {status: 400});
    }
    const params = await context.params;
    const result = await createTeamInvitation(
      getAuthDatabase(),
      workspaceIdFromParams(params),
      actor,
      parsed.body.email,
    );
    const {token, ...summary} = result;
    const acceptanceUrl = getRuntimeProfile() === 'local'
      ? new URL(`/invitations/accept?token=${encodeURIComponent(token)}`, getServerEnv().appUrl).toString()
      : undefined;
    return NextResponse.json(acceptanceUrl ? {...summary, acceptanceUrl} : summary, {status: 201});
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
