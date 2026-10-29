import type {MockProviderScript} from '../../src/modules/generation/mock.ts';

/** Versioned local-only scripts used by restart/replay probes. */
export const providerScripts = Object.freeze({
  success: Object.freeze({outcome: 'success'} satisfies MockProviderScript),
  delayed: Object.freeze({outcome: 'delay', delayPolls: 3} satisfies MockProviderScript),
  failure: Object.freeze({outcome: 'failure', failureCode: 'mock.fixture_failed'} satisfies MockProviderScript),
  unknown: Object.freeze({outcome: 'delay', delayPolls: 24} satisfies MockProviderScript),
});
