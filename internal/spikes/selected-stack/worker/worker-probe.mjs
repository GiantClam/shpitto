import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const workerRoot = resolve(import.meta.dirname);
const image = 'shpitto-m0-worker:20260927';
const evidencePath = resolve(workerRoot, '..', 'packaging', 'worker-evidence.json');

function run(args, options = {}) {
  return execFileSync('docker', args, { cwd: workerRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
}

run(['build', '--pull', '--tag', image, '.']);
const imageInspect = JSON.parse(run(['image', 'inspect', image]))[0];
const baseInspect = JSON.parse(run(['image', 'inspect', 'debian:bookworm-slim']))[0];
const runOutput = run(['run', '--rm', image]);
const digest = createHash('sha256').update(runOutput).digest('hex');
const imageId = imageInspect.Id;
const baseDigest = baseInspect.RepoDigests?.[0] ?? null;

const lines = runOutput.split(/\r?\n/).filter(Boolean);
const metadata = Object.fromEntries(lines.filter((line) => line.includes('=')).map((line) => {
  const separator = line.indexOf('=');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const hashes = Object.fromEntries(lines.filter((line) => /^[0-9a-f]{64}\s+/.test(line)).map((line) => {
  const [sha256, path] = line.split(/\s+/);
  return [path.split('/').at(-1), sha256];
}));

mkdirSync(resolve(workerRoot, '..', 'packaging'), { recursive: true });
writeFileSync(evidencePath, JSON.stringify({
  schemaVersion: '1.0',
  status: 'PASS_CONTAINER_MEDIA_FIXTURE',
  command: 'node worker/worker-probe.mjs',
  environment: {
    dockerServer: run(['version', '--format', '{{.Server.Version}}']),
    dockerPlatform: run(['info', '--format', '{{.OSType}}/{{.Architecture}}']),
    image,
    imageId,
    baseImage: 'debian:bookworm-slim',
    baseImageDigest: baseDigest,
  },
  observed: {
    ffmpegVersion: metadata.FFMPEG,
    ffprobeVersion: metadata.FFPROBE,
    inputProbe: JSON.parse(metadata.INPUT_PROBE),
    outputProbe: JSON.parse(metadata.OUTPUT_PROBE),
    inputSha256: hashes['input.mp4'],
    outputSha256: hashes['output.mp4'],
    runOutputSha256: digest,
  },
  proves: [
    'The Linux worker image contains FFmpeg and ffprobe.',
    'The container generates a local media fixture and transcodes it without host binaries.',
    'The output fixture is inspected and hashed inside the container run.',
  ],
  doesNotProve: [
    'Provider-backed generation or paid account behavior.',
    'Production deployment capacity or SLA.',
  ],
  redistribution: {
    baseImageLicense: 'Debian GNU/Linux base image; retain Debian notices for shipped image.',
    ffmpegLicense: 'Debian ffmpeg package; retain Debian package copyright and license notices for shipped image.',
    policy: 'Evidence supports prototype feasibility; final image notice inventory remains a release packaging task.',
  },
}, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({ evidencePath, image, imageId, baseDigest, outputSha256: hashes['output.mp4'] }));
