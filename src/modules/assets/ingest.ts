import {createHash, randomUUID} from 'node:crypto';

import {and, eq, gt, lt} from 'drizzle-orm';

import type {AppDatabase} from '../../db/client.ts';
import {DomainError} from '../../db/contracts.ts';
import {assets} from '../../db/schema/asset.ts';
import {generationTasks} from '../../db/schema/generation.ts';
import {resolvePrivateObjectStore, type PrivateObjectStore} from '../../adapters/storage/port.ts';
import {assertOutboxLeaseInTransaction, type OutboxLease} from '../generation/outbox.ts';
import {probePrivateMedia} from './media-probe.ts';

const MAX_OUTPUT_BYTES = 250 * 1024 * 1024;
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function assertContainerHeader(bytes: Uint8Array, mime: string): void {
  if (mime === 'video/mp4' || mime === 'video/quicktime') {
    const marker = new TextDecoder().decode(bytes.slice(4, 12));
    if (marker.slice(0, 4) !== 'ftyp') throw new DomainError('VALIDATION', 'Output is not a valid MP4 container.');
  } else if (mime === 'video/webm') {
    if (bytes.length < 4 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
      throw new DomainError('VALIDATION', 'Output is not a valid WebM container.');
    }
  }
}

export type MaterializeOutputInput = Readonly<{
  actorUserId: string;
  workspaceId: string;
  taskId: string;
  root?: string;
  store?: PrivateObjectStore;
  bytes: Uint8Array;
  mime: string;
  outboxLease?: OutboxLease;
  now?: Date;
}>;

export type MaterializeOutputResult = Readonly<{assetId: string; objectKey: string; bytes: string; sha256: string}>;

/** Write first, then publish the ready asset row; remove the object if the DB transaction fails. */
export async function materializeOutput(db: AppDatabase, input: MaterializeOutputInput): Promise<MaterializeOutputResult> {
  const store = resolvePrivateObjectStore(input.store, input.root);
  if (!VIDEO_MIMES.has(input.mime)) throw new DomainError('VALIDATION', 'Mock output MIME type is not supported.');
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_OUTPUT_BYTES) throw new DomainError('VALIDATION', 'Output media exceeds the bounded size.');
  assertContainerHeader(input.bytes, input.mime);
  const attempt = await db.transaction(async (tx) => {
    // Match lifecycle commands' task-before-lease lock order. Stale owners must
    // be rejected before spending the current worker's bounded attempt budget.
    const current = (await tx.select().from(generationTasks).where(and(eq(generationTasks.id, input.taskId), eq(generationTasks.workspaceId, input.workspaceId))).for('update').limit(1))[0];
    if (!current) throw new DomainError('NOT_FOUND', 'Generation task was not found.');
    if (current.status !== 'materializing') throw new DomainError('CONFLICT', 'Output materialization requires the materializing state.');
    await assertOutboxLeaseInTransaction(tx, input.outboxLease, input.now ?? new Date());
    const claimAt = input.now ?? new Date();
    // A contended lease row may become expired while the first check waits.
    if (input.outboxLease && !input.now) await assertOutboxLeaseInTransaction(tx, input.outboxLease, claimAt);
    const claimed = await tx.update(generationTasks).set({materializationAttempts: current.materializationAttempts + 1, updatedAt: claimAt}).where(and(
      eq(generationTasks.id, input.taskId), eq(generationTasks.workspaceId, input.workspaceId),
      eq(generationTasks.status, 'materializing'), gt(generationTasks.deadlineAt, claimAt),
      eq(generationTasks.materializationAttempts, current.materializationAttempts), lt(generationTasks.materializationAttempts, 8),
    )).returning({materializationAttempts: generationTasks.materializationAttempts});
    if (!claimed[0]) throw new DomainError('CONFLICT', 'The materialization attempt budget is exhausted or was claimed concurrently.');
    return claimed[0];
  });
  const assetId = randomUUID();
  const objectKey = `tasks/${input.taskId}/outputs/${assetId}.mp4`;
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  await store.put(objectKey, input.bytes, input.mime);
  try {
    const media = await probePrivateMedia(store, objectKey);
    if (!['mov,mp4,m4a,3gp,3g2,mj2', 'matroska,webm'].includes(media.format) || !media.hasVideo || media.durationMs === null || media.durationMs <= 0) {
      throw new DomainError('VALIDATION', 'Output media format is not supported.');
    }
    await db.transaction(async (tx) => {
      const current = (await tx.select().from(generationTasks).where(and(eq(generationTasks.id, input.taskId), eq(generationTasks.workspaceId, input.workspaceId))).for('update').limit(1))[0];
      await assertOutboxLeaseInTransaction(tx, input.outboxLease, input.now ?? new Date());
      const publishAt = input.now ?? new Date();
      if (input.outboxLease && !input.now) await assertOutboxLeaseInTransaction(tx, input.outboxLease, publishAt);
      if (!current || current.status !== 'materializing' || current.deadlineAt <= publishAt || current.materializationAttempts !== attempt.materializationAttempts) {
        throw new DomainError('CONFLICT', 'Output materialization lost its active task or deadline.');
      }
      await tx.insert(assets).values({
        id: assetId, workspaceId: input.workspaceId, taskId: input.taskId, purpose: 'output', state: 'ready', objectKey,
        createdBy: input.actorUserId, mime: input.mime, bytes: BigInt(input.bytes.byteLength), sha256, durationMs: media.durationMs,
        uploadExpiresAt: null, createdAt: publishAt, updatedAt: publishAt,
      });
      // Foreign-key checks may wait on workspace/user locks during the insert.
      // Roll publication back if that wait outlives the task or worker lease.
      const finalizedAt = input.now ?? new Date();
      if (current.deadlineAt <= finalizedAt) throw new DomainError('CONFLICT', 'Output materialization exceeded its deadline before publication.');
      await assertOutboxLeaseInTransaction(tx, input.outboxLease, finalizedAt);
    });
  } catch (error) {
    await store.delete(objectKey).catch(() => undefined);
    throw error;
  }
  return {assetId, objectKey, bytes: input.bytes.byteLength.toString(10), sha256};
}
