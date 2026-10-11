import {DomainError} from '../../../../../db/contracts.ts';
import {getAuthDatabase} from '../../../../../lib/auth.ts';
import {getOwnerBillingView} from '../../../../../modules/billing/queries.ts';
import {serializeJsonValue} from '../../../../../contracts/http.ts';
import {currentWorkspaceActor, safeError, safeSuccess, workspaceIdFromParams} from '../../_shared.ts';

export async function GET(request: Request, context: {params: Promise<{workspaceId: string}>}) {
  try {
    const actor = await currentWorkspaceActor(request);
    if (!actor) throw new DomainError('FORBIDDEN', 'Authentication is required.');
    const workspaceId = workspaceIdFromParams(await context.params);
    return safeSuccess(serializeJsonValue(await getOwnerBillingView(getAuthDatabase(), {actor, workspaceId})));
  } catch (error) {
    return safeError(error);
  }
}
