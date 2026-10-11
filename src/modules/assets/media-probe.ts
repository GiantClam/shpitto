import {execFile as execFileCallback} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

import {DomainError} from '../../db/contracts.ts';
import {resolveLocalObjectPath} from '../../adapters/storage/local.ts';
import type {PrivateObjectStore} from '../../adapters/storage/port.ts';

const execFile = promisify(execFileCallback);
const MAX_PROBE_OUTPUT = 64 * 1024;
const PROBE_TIMEOUT_MS = 15_000;

export type MediaProbe = Readonly<{format: string; durationMs: number | null; hasVideo: boolean}>;

async function probePath(path: string): Promise<MediaProbe> {
  try {
    const result = await execFile('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe',
      '-show_entries', 'format=format_name,duration:stream=codec_type', '-of', 'json', path,
    ], {timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_PROBE_OUTPUT, windowsHide: true});
    const parsed = JSON.parse(result.stdout) as {format?: {format_name?: unknown; duration?: unknown}; streams?: Array<{codec_type?: unknown}>};
    const format = typeof parsed.format?.format_name === 'string' ? parsed.format.format_name : '';
    if (!format) throw new Error('missing format');
    const duration = typeof parsed.format?.duration === 'string' ? Number(parsed.format.duration) : null;
    const hasVideo = Array.isArray(parsed.streams) && parsed.streams.some((stream) => stream.codec_type === 'video');
    return {format, durationMs: duration !== null && Number.isFinite(duration) ? Math.round(duration * 1000) : null, hasVideo};
  } catch (error) {
    throw new DomainError('VALIDATION', 'Media validation failed.', {cause: error});
  }
}

export async function probePrivateMedia(storageOrRoot: string | PrivateObjectStore, objectKey: string): Promise<MediaProbe> {
  if (typeof storageOrRoot === 'string') return probePath(resolveLocalObjectPath(storageOrRoot, objectKey));
  const tempRoot = await mkdtemp(join(tmpdir(), 'shpitto-media-probe-'));
  const tempPath = join(tempRoot, 'media.bin');
  try { await writeFile(tempPath, await storageOrRoot.get(objectKey)); return await probePath(tempPath); }
  finally { await rm(tempRoot, {recursive: true, force: true}); }
}
