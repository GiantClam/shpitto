import {execFile as execFileCallback} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

import {DomainError} from '../../db/contracts.ts';

const execFile = promisify(execFileCallback);
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const PROBE_TIMEOUT_MS = 15_000;
const MAX_PROBE_OUTPUT = 64 * 1024;
const IMAGE_FORMATS: Readonly<Record<string, Readonly<{extension: string; format: string}>>> = Object.freeze({
  'image/png': {extension: 'png', format: 'png_pipe'},
  'image/jpeg': {extension: 'jpg', format: 'jpeg_pipe'},
  'image/webp': {extension: 'webp', format: 'webp_pipe'},
});

/** Validate declared image type, decoded dimensions, and an actual first-frame decode. */
export async function validateInputImageBytes(bytes: Uint8Array, mime: string): Promise<void> {
  const imageType = IMAGE_FORMATS[mime];
  if (!imageType) throw new DomainError('VALIDATION', 'Input MIME type is not supported.');
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_INPUT_BYTES) {
    throw new DomainError('VALIDATION', 'Input image exceeds the 20 MiB size limit.');
  }

  const directory = await mkdtemp(join(tmpdir(), 'shpitto-input-image-'));
  const path = join(directory, `input.${imageType.extension}`);
  try {
    await writeFile(path, bytes, {flag: 'wx', mode: 0o600});
    const probe = await execFile('ffprobe', [
      '-v', 'error', '-protocol_whitelist', 'file,pipe', '-select_streams', 'v:0',
      '-show_entries', 'format=format_name:stream=width,height', '-of', 'json', path,
    ], {timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_PROBE_OUTPUT, windowsHide: true});
    const parsed = JSON.parse(probe.stdout) as {
      format?: {format_name?: unknown};
      streams?: Array<{width?: unknown; height?: unknown}>;
    };
    const stream = parsed.streams?.[0];
    const width = stream?.width;
    const height = stream?.height;
    if (parsed.format?.format_name !== imageType.format
      || typeof width !== 'number' || typeof height !== 'number'
      || !Number.isInteger(width) || !Number.isInteger(height)
      || width < 1 || height < 1 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      throw new Error('Image metadata does not match the bounded input image contract.');
    }

    await execFile('ffmpeg', [
      '-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist', 'file,pipe', '-threads', '1',
      '-i', path, '-frames:v', '1', '-f', 'null', '-',
    ], {timeout: PROBE_TIMEOUT_MS, maxBuffer: MAX_PROBE_OUTPUT, windowsHide: true});
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new DomainError('INFRASTRUCTURE', 'Input image validation requires ffprobe and ffmpeg on the application host PATH.', {cause: error});
    }
    throw new DomainError('VALIDATION', 'Input image could not be decoded safely.', {cause: error});
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}
