import {randomUUID} from 'node:crypto';

import type {AppDatabase} from '../../db/client.ts';
import {runOutboxPumpOnce, type OutboxPumpResult} from '../../trigger/outbox.ts';

/** Thin platform adapter; all business effects remain in shared generation commands. */
export async function runGenerationTrigger(db: AppDatabase, input: Readonly<{
  owner?: string;
  now?: Date;
  workspaceId?: string;
  handle: Parameters<typeof runOutboxPumpOnce>[1]['handle'];
}>): Promise<OutboxPumpResult> {
  return runOutboxPumpOnce(db, {owner: input.owner ?? `trigger-${randomUUID()}`, now: input.now, eventType: 'generation.dispatch', workspaceId: input.workspaceId, handle: input.handle});
}
