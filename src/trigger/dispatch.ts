import type {AppDatabase} from '../db/client.ts';
import {claimDispatch, type DispatchClaimResult} from '../modules/generation/lifecycle.ts';
import type {OutboxLease} from '../modules/generation/outbox.ts';

/** Dispatch claims are durable before any provider transport is called. */
export async function dispatchGeneration(db: AppDatabase, input: Readonly<{
  actor: {userId: string}; workspaceId: string; taskId: string; idempotencyKey: string; provider?: string; outboxLease?: OutboxLease; now?: Date;
}>): Promise<{value: DispatchClaimResult; replayed: boolean}> {
  return claimDispatch(db, input);
}
