import {NextResponse} from 'next/server';

import {auth, getAuthDatabase} from '../../../../lib/auth.ts';
import {getServerEnv} from '../../../../config/env.ts';
import {requireOperatorIdentity} from '../../../../modules/operations/authorize.ts';
import {assertSameOrigin, currentWorkspaceActor, readJson, workspaceErrorResponse} from '../../workspaces/_shared.ts';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    await requireOperatorIdentity(getAuthDatabase(), actor, 'support');
    const parsed = await readJson(request);
    if (!parsed.valid || typeof parsed.body.code !== 'string' || !/^\d{6}$/.test(parsed.body.code)) return NextResponse.json({error: 'A six-digit authenticator code is required.'}, {status: 400});
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    return auth.handler(new Request(new URL('/api/auth/two-factor/verify-totp', getServerEnv().appUrl), {method: 'POST', headers, body: JSON.stringify({code: parsed.body.code, trustDevice: false})}));
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
