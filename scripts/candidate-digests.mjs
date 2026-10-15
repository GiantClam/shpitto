import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, statSync, writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const digestInputs = {
  sourceTree: ['internal/contracts/providers', 'src', 'tests', 'content', 'skills', 'deploy', 'scripts', 'tooling', '.shpitto', '.github', 'package.json', 'pnpm-workspace.yaml', 'next.config.ts', 'tsconfig.json', '.env.example', '.dockerignore', '.gitignore'],
  schema: ['src/db'],
  configuration: ['package.json', 'pnpm-workspace.yaml', 'next.config.ts', 'tsconfig.json', '.env.example', '.dockerignore', 'src/config/env.ts', 'src/config/task-runtime.ts', 'src/config/provider-worker.ts', '.github/workflows/verify-root.yml', 'deploy/compose.local.yml', 'deploy/worker.Dockerfile', 'deploy/provider-worker.Dockerfile', 'deploy/railway.provider-worker.json', 'scripts/provider-worker-preflight.ts', 'scripts/provider-worker-runtime.mjs', 'tooling'],
  contract: ['internal/contracts/providers', '.shpitto/contracts', 'skills/registry.json', 'content/docs/v1/manifest.json', 'openspec/changes/restart-shpitto-video-saas/design.md', 'openspec/changes/restart-shpitto-video-saas/acceptance-gates.md', 'openspec/changes/restart-shpitto-video-saas/traceability.json', 'openspec/changes/restart-shpitto-video-saas/specs', 'internal/restart/contract-register.md', 'internal/restart/integration-matrix.md', 'internal/restart/external-inputs.json', 'internal/restart/root-dependency-evolution.md'],
  validator: ['scripts', 'tests', 'tooling', 'internal/restart/check-acceptance-record.py', 'openspec/changes/restart-shpitto-video-saas/traceability.json'],
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
function walk(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!statSync(absolute).isDirectory()) return [relativePath.replaceAll('\\', '/')];
  return readdirSync(absolute).flatMap((name) => walk(path.join(relativePath, name)));
}
const footprints = {};
const digests = {};
for (const [name, inputs] of Object.entries(digestInputs)) {
  const files = [...new Set(inputs.flatMap(walk))].sort();
  footprints[name] = files.map((file) => {
    const bytes = readFileSync(path.join(root, file));
    return {path: file, bytes: bytes.length, sha256: hash(bytes)};
  });
  digests[`${name}Sha256`] = hash(footprints[name].map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`).join('\n'));
}
const candidate = {
  capturedAt: new Date().toISOString(), sourceCommit: null, dirtyPatchSha256: null,
  ...digests, lockfileSha256: hash(readFileSync(path.join(root, 'pnpm-lock.yaml'))),
  digestAlgorithm: 'SHA-256 of sorted relative-path\\0byte-size\\0file-digest entries joined with LF; lockfile is raw byte SHA-256',
  digestInputs,
};
if (process.argv[2]) {
  const directory = path.resolve(process.argv[2]);
  mkdirSync(directory, {recursive: true});
  writeFileSync(path.join(directory, 'candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  writeFileSync(path.join(directory, 'digest-footprints.json'), `${JSON.stringify(footprints, null, 2)}\n`);
}
console.log(JSON.stringify(candidate, null, 2));
