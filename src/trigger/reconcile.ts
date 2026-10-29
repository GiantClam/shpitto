import type {ProviderObservation, ProviderPort, ProviderRequestRef} from '../adapters/providers/port.ts';

/** Reconciliation reads the exact persisted request only; it never submits a second paid create. */
export async function reconcileProviderRequest(provider: ProviderPort, ref: ProviderRequestRef): Promise<ProviderObservation> {
  return provider.getStatus(ref);
}
