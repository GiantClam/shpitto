import {validateVideoInput, freezeSubmissionContext} from '../../adapters/providers/input.ts';
import type {AuthorizedOwnedImage, SubmissionContext, ProviderCatalogSnapshot} from '../../adapters/providers/port.ts';
import {getProviderModel} from '../../config/provider-models.ts';
import type {ServerQuote} from '../../config/models.ts';
import {semanticHash} from '../../contracts/http.ts';
import {DomainError} from '../../db/contracts.ts';
import type {generationTasks, submissionAttempts} from '../../db/schema/generation.ts';
import type {ReadyInputSnapshot} from './create.ts';

export function providerInputFromSnapshot(modelKey: string, input: ReadyInputSnapshot) {
  const model = getProviderModel(modelKey);
  const options = input.options ?? {};
  if (Object.keys(options).some((key) => !['aspectRatio', 'cropSha256', 'cropConfirmed'].includes(key))) throw new DomainError('VALIDATION', 'Unsupported provider input option.');
  return validateVideoInput({modelKey, mode: model.mode, prompt: input.prompt, aspectRatio: options.aspectRatio ?? '16:9',
    ...(input.assetId ? {image: {assetId: input.assetId, cropSha256: options.cropSha256, confirmed: options.cropConfirmed}} : {})});
}

/** Restore only the task's own immutable contract and authoritative quote. */
export function restoreWorkerSubmissionContext(task: typeof generationTasks.$inferSelect, attempt: typeof submissionAttempts.$inferSelect, authorizedImage?: AuthorizedOwnedImage): SubmissionContext {
  const snapshot = task.catalogSnapshot as ServerQuote & {providerContract?: ProviderCatalogSnapshot};
  const {modelId, catalogVersion, quantity, unitCost, totalCost, issuedAt, quoteHash} = snapshot;
  const quote = {modelId, catalogVersion, quantity, unitCost, totalCost, issuedAt, quoteHash};
  const input = providerInputFromSnapshot(task.modelKey, task.inputSnapshot as ReadyInputSnapshot);
  const catalog = snapshot.providerContract;
  if (!catalog || catalog.modelKey !== task.modelKey || catalog.provider !== attempt.provider || task.quotedCredits.toString() !== quote.totalCost) throw new DomainError('CONFLICT', 'The persisted provider contract/quote is not bound to this task.');
  const context = freezeSubmissionContext({input, quote, workspaceId: task.workspaceId, taskId: task.id, attemptId: attempt.id, attemptNonce: attempt.clientReference, createdAt: task.createdAt.toISOString(), authorizedImage});
  if (catalog.schemaSha256 !== context.catalog.schemaSha256 || catalog.endpoint !== context.catalog.endpoint || catalog.modelVersion !== context.catalog.modelVersion || semanticHash('provider.preset', catalog.preset) !== semanticHash('provider.preset', context.catalog.preset)) throw new DomainError('CONFLICT', 'The stored provider contract needs a compatibility review.');
  return Object.freeze({...context, catalog: Object.freeze({...catalog}), deadlines: Object.freeze({...context.deadlines, queueDeadlineAt: task.queueDeadlineAt.toISOString(), overallDeadlineAt: task.overallDeadlineAt?.toISOString() ?? context.deadlines.overallDeadlineAt})});
}
