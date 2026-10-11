import type {AppDatabase} from '../db/client.ts';
import {acknowledgeOutbox, claimOutbox, failOutbox, releaseOutbox, startOutboxHeartbeat, type OutboxLease} from '../modules/generation/outbox.ts';

export type OutboxPumpResult = Readonly<{claimed: boolean; outcome?: 'published' | 'released' | 'failed'}>;

/** One bounded Trigger invocation. The callback owns domain work; this helper owns the lease fence. */
export async function runOutboxPumpOnce(db: AppDatabase, input: Readonly<{
  owner: string;
  now?: Date;
  eventType?: string;
  workspaceId?: string;
  handle: (lease: OutboxLease) => Promise<'ack' | 'release' | 'fail'>;
}>): Promise<OutboxPumpResult> {
  const now = input.now ?? new Date();
  const lease = await claimOutbox(db, input.owner, now, {eventType: input.eventType, workspaceId: input.workspaceId});
  if (!lease) return {claimed: false};
  const heartbeat = startOutboxHeartbeat(db, lease, {now: () => input.now ?? new Date()});
  try {
    await heartbeat.renew();
    const outcome = await input.handle(lease);
    if (outcome === 'ack') {
      if (!await acknowledgeOutbox(db, lease, input.now ?? new Date())) throw new Error('Outbox lease was lost before acknowledgement.');
      return {claimed: true, outcome: 'published'};
    }
    if (outcome === 'release') {
      const availableAt = new Date((input.now ?? new Date()).getTime() + 1_000);
      if (!await releaseOutbox(db, lease, availableAt, input.now ?? new Date())) throw new Error('Outbox lease was lost before release.');
      return {claimed: true, outcome: 'released'};
    }
    if (!await failOutbox(db, lease, input.now ?? new Date())) throw new Error('Outbox lease was lost before failure acknowledgement.');
    return {claimed: true, outcome: 'failed'};
  } catch (error) {
    if (!heartbeat.hasLostLease()) await releaseOutbox(db, lease, new Date((input.now ?? new Date()).getTime() + 1_000), input.now ?? new Date()).catch(() => undefined);
    throw error;
  } finally {
    await heartbeat.stop();
  }
}
