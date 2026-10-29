import {providerCapabilities} from '../../config/provider-models.ts';
import {DomainError} from '../../db/contracts.ts';
import {observeMock, submitMock, type MockProviderScript, type MockSubmission} from '../../modules/generation/mock.ts';
import {validateVideoInput} from './input.ts';
import {freezeProviderRef} from './normalize.ts';
import type {ProviderPort, ProviderRequestRef} from './port.ts';

export type PersistedMockState = Readonly<{submission: MockSubmission; script: MockProviderScript; pollCount: number}>;

/** A protocol bridge over the existing persistent Mock. The caller owns durable state and poll advancement. */
export function createMockProvider(storage: Readonly<{readState(ref: ProviderRequestRef): Promise<PersistedMockState>}>): ProviderPort {
  async function observation(ref: ProviderRequestRef) {
    if (ref.provider !== 'mock' || ref.modelKey !== 'mock-video') throw new DomainError('VALIDATION', 'The request does not belong to the local Mock.');
    const state = await storage.readState(ref);
    if (state.submission.providerRequestId !== ref.requestId) throw new DomainError('CONFLICT', 'The persisted Mock request identity does not match.');
    return observeMock(state.submission, state.script, state.pollCount);
  }
  return Object.freeze({
    capabilities(modelKey) {
      if (modelKey !== 'mock-video') throw new DomainError('VALIDATION', 'The local Mock model is unavailable.');
      return providerCapabilities(modelKey);
    },
    validate(input) {
      if (input.modelKey !== 'mock-video') throw new DomainError('VALIDATION', 'The local Mock model is unavailable.');
      return validateVideoInput(input);
    },
    async submit(attempt) {
      if (attempt.catalog.provider !== 'mock' || attempt.catalog.modelKey !== 'mock-video') throw new DomainError('VALIDATION', 'The local Mock cannot submit a live provider attempt.');
      return Object.freeze({kind: 'accepted', requestId: submitMock(attempt.attemptNonce).providerRequestId});
    },
    async getStatus(ref) {
      const result = await observation(ref);
      const status = result.status === 'succeeded' ? 'completed' : result.status;
      return Object.freeze({ref: freezeProviderRef(ref), status, observedAt: new Date().toISOString(), evidence: Object.freeze({code: `mock.${status}`})});
    },
    async readResult(ref) {
      const result = await observation(ref);
      if (result.status === 'failed') return Object.freeze({kind: 'failed', code: 'mock.provider_failed'});
      if (result.status === 'succeeded' && result.outputObjectKey) return Object.freeze({kind: 'outputCandidates', candidates: Object.freeze([Object.freeze({kind: 'mock', objectKey: result.outputObjectKey} as const)])});
      return Object.freeze({kind: 'unavailable', evidence: Object.freeze({code: 'mock.result_pending'})});
    },
    async verifyWebhook() {
      throw new DomainError('FORBIDDEN', 'Public Mock webhooks are unsupported.');
    },
  } satisfies ProviderPort);
}
