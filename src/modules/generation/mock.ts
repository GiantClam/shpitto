import {createHash} from 'node:crypto';

export type MockOutcome = 'success' | 'failure' | 'delay';

export type MockProviderScript = Readonly<{
  outcome: MockOutcome;
  delayPolls?: number;
  failureCode?: string;
}>;

export type MockSubmission = Readonly<{
  providerRequestId: string;
  clientReference: string;
  status: 'submitted';
}>;

export type MockObservation = Readonly<{
  status: 'running' | 'succeeded' | 'failed';
  providerRequestId: string;
  failureCode?: string;
  outputObjectKey?: string;
}>;

export function defaultMockScript(): MockProviderScript {
  return Object.freeze({outcome: 'success'});
}

export function submitMock(clientReference: string): MockSubmission {
  const identity = createHash('sha256').update(clientReference).digest('hex');
  return Object.freeze({providerRequestId: `mock-${identity}`, clientReference, status: 'submitted'});
}

export function observeMock(
  submission: MockSubmission,
  script: MockProviderScript,
  pollCount: number,
): MockObservation {
  const threshold = Math.max(0, script.delayPolls ?? 0);
  if (script.outcome === 'delay' && pollCount < threshold) {
    return Object.freeze({status: 'running', providerRequestId: submission.providerRequestId});
  }
  if (script.outcome === 'failure') {
    return Object.freeze({status: 'failed', providerRequestId: submission.providerRequestId, failureCode: script.failureCode ?? 'mock.provider_failed'});
  }
  const digest = createHash('sha256').update(submission.providerRequestId).digest('hex');
  return Object.freeze({status: 'succeeded', providerRequestId: submission.providerRequestId, outputObjectKey: `mock/${digest}.mp4`});
}
