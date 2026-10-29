import {assertInspectedProviderContract} from '../../config/provider-models.ts';
import type {AcceptanceSubmissionScope, SubmissionContext} from './port.ts';

export function permitsAcceptanceSubmission(context: SubmissionContext, scope?: AcceptanceSubmissionScope): boolean {
  if (!scope || context.workspaceId !== scope.workspaceId || !scope.modelKeys.includes(context.catalog.modelKey)) return false;
  assertInspectedProviderContract(context.catalog.modelKey, context.catalog);
  return true;
}
