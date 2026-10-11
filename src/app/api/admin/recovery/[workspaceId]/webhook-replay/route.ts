import {NextResponse} from 'next/server';

import {parseIdempotencyKey} from '../../../../../../contracts/http.ts';
import {getAuthDatabase} from '../../../../../../lib/auth.ts';
import {validateExpectedVersion} from '../../../../../../modules/operations/audit.ts';
import {replayAdminProviderWebhook} from '../../../../../../modules/operations/recovery.ts';
import {assertSameOrigin, currentWorkspaceActor, readJson, workspaceErrorResponse, workspaceIdFromParams} from '../../../../workspaces/_shared.ts';

export async function POST(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) return NextResponse.json({error: 'Authentication required.'}, {status: 401});
    const parsed = await readJson(request);
    if (!parsed.valid || typeof parsed.body.purpose !== 'string' || typeof parsed.body.inboxId !== 'string' || Object.keys(parsed.body).some((key) => !['purpose', 'inboxId', 'expectedVersion'].includes(key))) return NextResponse.json({error: 'Only purpose, inboxId and expectedVersion are accepted.'}, {status: 400});
    return NextResponse.json(await replayAdminProviderWebhook(getAuthDatabase(), {actor, workspaceId: workspaceIdFromParams(await context.params), inboxId: parsed.body.inboxId, purpose: parsed.body.purpose, expectedVersion: validateExpectedVersion(parsed.body.expectedVersion), idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key'))}));
  } catch (error) {return workspaceErrorResponse(error);}
}
