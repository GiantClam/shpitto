import type {PrivateObjectStore} from '../adapters/storage/port.ts';
import {getPrivateObjectStore} from '../adapters/storage/runtime.ts';
import {fetchPrivateProviderOutput, type HostResolver, type RemoteFetch} from '../adapters/storage/s3.ts';
import type {AppDatabase} from '../db/client.ts';
import type {OutputCandidate} from '../adapters/providers/port.ts';
import {materializeOutput, type MaterializeOutputResult} from '../modules/assets/ingest.ts';
import type {OutboxLease} from '../modules/generation/outbox.ts';

export async function materializeProviderOutput(db: AppDatabase, input: Readonly<{
  candidate: OutputCandidate;
  actorUserId: string;
  workspaceId: string;
  taskId: string;
  root?: string;
  store?: PrivateObjectStore;
  outboxLease?: OutboxLease;
  now?: Date;
  fetcher?: RemoteFetch;
  resolveHost?: HostResolver;
}>): Promise<MaterializeOutputResult> {
  const store = input.store ?? getPrivateObjectStore();
  const source = input.candidate.kind === 'remote'
    ? await fetchPrivateProviderOutput(input.candidate.url, input.fetcher, input.resolveHost)
    : Object.freeze({bytes: new Uint8Array(await store.get(input.candidate.objectKey)), mime: 'video/mp4', sha256: '', finalUrl: input.candidate.objectKey});
  return materializeOutput(db, {
    actorUserId: input.actorUserId, workspaceId: input.workspaceId, taskId: input.taskId, store,
    bytes: source.bytes, mime: source.mime, outboxLease: input.outboxLease, now: input.now,
  });
}
