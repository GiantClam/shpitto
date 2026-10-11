import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const root = process.cwd();
const candidateId = process.env.SHPITTO_CANDIDATE_ID?.trim() || 'local-candidate-20261007-completion';
const manifestPath = path.join(root, 'internal', 'evidence', 'm8', 'artifact-manifest', candidateId, 'manifest.json');
const outputDir = path.join(root, 'internal', 'evidence', 'm8', 'artifact-manifest', candidateId, 'clean-repo');

function run(args, cwd) {
  const result = spawnSync('git', args, {cwd, encoding: 'utf8', windowsHide: true});
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
}

function main() {
  if (!existsSync(manifestPath)) throw new Error(`Candidate manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const archivePath = path.join(root, manifest.zip.path);
  if (!existsSync(archivePath)) throw new Error(`Candidate archive is missing: ${archivePath}`);
  const archiveBytes = readFileSync(archivePath);
  if (archiveBytes.length !== manifest.zip.bytes || createHash('sha256').update(archiveBytes).digest('hex') !== manifest.zip.sha256) throw new Error('Candidate archive integrity failed.');
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'shpitto-candidate-repo-'));
  try {
    const extracted = path.join(temporaryRoot, 'extracted');
    mkdirSync(extracted, {recursive: true});
    const archive = spawnSync('tar', ['-xf', archivePath, '-C', extracted], {encoding: 'utf8', windowsHide: true});
    if (archive.status !== 0) throw new Error(`Candidate extraction failed: ${archive.stderr || archive.stdout}`);
    for (const file of manifest.files) {
      const bytes = readFileSync(path.join(extracted, file.archivePath));
      if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Candidate file integrity failed: ${file.archivePath}`);
    }
    rmSync(outputDir, {recursive: true, force: true});
    mkdirSync(path.dirname(outputDir), {recursive: true});
    cpSync(path.join(extracted, 'customerRuntime'), outputDir, {recursive: true});
    run(['init', '--initial-branch=main'], outputDir);
    run(['config', 'user.email', 'candidate@shpitto.local'], outputDir);
    run(['config', 'user.name', 'Shpitto local candidate'], outputDir);
    run(['add', '--all'], outputDir);
    const commit = run(['commit', '--no-verify', '--message', 'chore: preserve reviewed candidate bytes in clean buyer history', '--message', `Archive: ${manifest.zip.sha256}\nConstraint: Disposable local export; no publication or inherited history\nTested: Archive and every exported file SHA-256 verified\nNot-tested: Production accounts and deployment\nConfidence: high\nScope-risk: narrow`], outputDir);
    const status = run(['status', '--short'], outputDir);
    const commitSha = run(['rev-parse', 'HEAD'], outputDir);
    const result = {
      status: 'PASS',
      profile: 'local-disposable-clean-history',
      candidateId,
      sourceArchive: manifest.zip,
      repository: 'new-history-only',
      commitSha,
      cleanWorkingTree: status === '',
      commitSummary: commit,
      productionDeployment: 'NOT_RUN',
      realAccounts: 'NOT_PROVIDED',
      note: 'Disposable clean-history repository created from unchanged local candidate bytes. It is not a publication or release approval.',
    };
    writeFileSync(path.join(path.dirname(outputDir), 'clean-repo.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    rmSync(temporaryRoot, {recursive: true, force: true});
  }
}

main();
