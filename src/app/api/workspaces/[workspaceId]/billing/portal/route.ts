import {getRuntimeProfile, getServerEnv} from '../../../../../../config/env.ts';
import {DomainError} from '../../../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../../../lib/auth.ts';
import {openBillingPortal} from '../../../../../../modules/billing/checkout.ts';
import {getBillingRuntime} from '../../../../../../modules/billing/runtime.ts';
import {parsePortalRequest} from '../../../../../../modules/billing/contracts.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, safeError, safeSuccess, workspaceIdFromParams} from '../../../_shared.ts';

export async function POST(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) throw new DomainError('FORBIDDEN', 'Authentication is required.');
    const parsed = await readJson(request);
    if (!parsed.valid) throw new DomainError('VALIDATION', 'A valid JSON object is required.');
    const body = parsed.body;
    parsePortalRequest(body);
    const workspaceId = workspaceIdFromParams(await context.params);
    const result = await openBillingPortal(getAuthDatabase(), {
      actor,
      workspaceId,
      idempotencyKey: commandKey(request, body),
      profile: getRuntimeProfile() === 'acceptance' ? 'test' : (getRuntimeProfile() === 'production' ? 'production' : 'local'),
      appUrl: getServerEnv().appUrl,
      ...getBillingRuntime(),
    });
    return safeSuccess(result, result.replayed ? 200 : 201);
  } catch (error) {
    return safeError(error);
  }
}
