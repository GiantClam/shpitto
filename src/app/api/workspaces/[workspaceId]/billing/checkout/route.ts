import {getRuntimeProfile} from '../../../../../../config/env.ts';
import {DomainError} from '../../../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../../../lib/auth.ts';
import {openCheckout} from '../../../../../../modules/billing/checkout.ts';
import {getBillingRuntime} from '../../../../../../modules/billing/runtime.ts';
import {parseCheckoutRequest} from '../../../../../../modules/billing/contracts.ts';
import {assertSameOrigin, commandKey, currentWorkspaceActor, readJson, safeError, safeSuccess, workspaceIdFromParams} from '../../../_shared.ts';

export async function POST(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    assertSameOrigin(request);
    const actor = await currentWorkspaceActor(request);
    if (!actor) throw new DomainError('FORBIDDEN', 'Authentication is required.');
    const parsed = await readJson(request);
    if (!parsed.valid) throw new DomainError('VALIDATION', 'A valid JSON object is required.');
    const body = parsed.body;
    const checkoutRequest = parseCheckoutRequest(body);
    const workspaceId = workspaceIdFromParams(await context.params);
    const result = await openCheckout(getAuthDatabase(), {
      actor,
      workspaceId,
      idempotencyKey: commandKey(request, body),
      catalogProductKey: checkoutRequest.catalogProductKey,
      profile: getRuntimeProfile() === 'acceptance' ? 'test' : (getRuntimeProfile() === 'production' ? 'production' : 'local'),
      ...getBillingRuntime(),
    });
    return safeSuccess(result, result.replayed ? 200 : 201);
  } catch (error) {
    return safeError(error);
  }
}
