import {NextResponse} from 'next/server';

import {getAuthDatabase} from '../../../../lib/auth.ts';
import {acceptTeamInvitation} from '../../../../modules/workspaces/invitations.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, workspaceErrorResponse} from '../../workspaces/_shared.ts';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid || typeof parsed.body.token !== 'string') {
      return NextResponse.json({error: 'A valid invitation token is required.'}, {status: 400});
    }
    commandKey(request, parsed.body);
    const result = await acceptTeamInvitation(getAuthDatabase(), actor, parsed.body.token);
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
