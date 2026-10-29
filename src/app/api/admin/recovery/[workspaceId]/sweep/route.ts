import {NextResponse} from 'next/server';

import {parseIdempotencyKey} from '../../../../../../contracts/http.ts';
import {getAuthDatabase} from '../../../../../../lib/auth.ts';
import {validateExpectedVersion} from '../../../../../../modules/operations/audit.ts';
import {runAdminRecoverySweep} from '../../../../../../modules/operations/recovery.ts';
import {assertSameOrigin, currentWorkspaceActor, readJson, workspaceErrorResponse} from '../../../../workspaces/_shared.ts';

export async function POST(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid || typeof parsed.body.purpose !== 'string') return NextResponse.json({error: 'purpose is required.'}, {status: 400});
    const {workspaceId} = await context.params;
    const expectedVersion = validateExpectedVersion(parsed.body.expectedVersion);
    const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'));
    const result = await runAdminRecoverySweep(getAuthDatabase(), {actor, workspaceId, purpose: parsed.body.purpose, expectedVersion, idempotencyKey});
    return NextResponse.json(result);
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
