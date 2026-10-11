import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const standaloneServer = resolve(root, '.next/standalone/internal/spikes/selected-stack/server.js');
const standalonePackage = resolve(root, '.next/standalone/internal/spikes/selected-stack/package.json');
const workerEvidencePath = resolve(root, 'packaging/worker-evidence.json');
const ffmpegVersion = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split(/\r?\n/, 1)[0];
const ffprobeVersion = execFileSync('ffprobe', ['-version'], { encoding: 'utf8' }).split(/\r?\n/, 1)[0];

if (!existsSync(standaloneServer) || !existsSync(standalonePackage)) throw new Error('Next standalone output missing');

const digest = createHash('sha256').update(readFileSync(standaloneServer)).digest('hex');
const workerEvidence = existsSync(workerEvidencePath) ? JSON.parse(readFileSync(workerEvidencePath, 'utf8')) : null;
console.log(JSON.stringify({
  standaloneOutput: true,
  serverSha256: digest,
  ffmpegVersion,
  ffprobeVersion,
  containerProbe: workerEvidence?.status ?? 'BLOCKED_WORKER_EVIDENCE_MISSING',
  workerEvidenceRef: workerEvidence ? 'packaging/worker-evidence.json' : null,
  hostBinaryIsNotContainerEvidence: true,
}));
