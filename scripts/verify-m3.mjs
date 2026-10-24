import {randomUUID} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {assertM3OutputWritable, assessBrowserEvidence, assessCoverage, collectOwnedModules, deriveStageStatus, isRetainedM3Artifact, mergeLcov, resolveM3VerificationOptions} from './m3-evidence.mjs';

const root = process.cwd();
const runtimeEnv = globalThis.process['env'];
const attemptId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID()}`;
// CLI flags take precedence over environment selectors. With neither selector,
// every run gets a new candidate directory and no historical browser evidence.
const {output, browserEvidencePath} = resolveM3VerificationOptions({root, args: process.argv.slice(2), env: runtimeEnv, attemptId});
assertM3OutputWritable(output);
const attemptsRoot = path.join(output, 'verification-attempts');
const attemptRoot = path.join(attemptsRoot, attemptId);
const logsRoot = path.join(attemptRoot, 'logs');
mkdirSync(logsRoot, {recursive: true});
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const commandResults = [];
const coverageRuns = [];
const envFileValues = {};
for (const envFile of ['.env', '.env.local']) {
  const file = path.join(root, envFile);
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !runtimeEnv[match[1]]) envFileValues[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}
const baseEnv = {...envFileValues, ...runtimeEnv};
const sensitiveValues = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'MAIL_SMTP_URL']
  .map((name) => baseEnv[name])
  .filter((value) => typeof value === 'string' && value.length > 0);
let scratchRoot = null;
let isolatedDatabase = null;
let adminClient = null;
let coveragePassed = false;
let lockWasVerified = false;
let currentCandidate = {};
let candidateStable = false;
let browserEvidence = null;
let databaseCleanupPassed = false;
let candidateServer = null;
let mailpitServer = null;

const sanitize = (value) => {
  let result = String(value ?? '');
  for (const secret of sensitiveValues) result = result.replaceAll(secret, '[redacted]');
  return result.replace(/https?:\/\/[^\s]+/g, '[redacted URL]');
};
const writeJson = (file, value) => {
  // A reviewer may finish while this long-running verification is in flight.
  if (file === path.join(output, 'record.json')) assertM3OutputWritable(output);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

async function waitForHttp(url, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {signal: AbortSignal.timeout(1_000), redirect: 'manual'});
      if (response.status < 500) return response;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function ensureMailpit() {
  try {
    await waitForHttp('http://127.0.0.1:8025/api/v1/search', 2_000);
    return;
  } catch {
    const logPath = path.join(logsRoot, 'mailpit-stub.log');
    writeFileSync(logPath, '', 'utf8');
    mailpitServer = spawn(process.execPath, [path.join(root, '.data', 'mailpit-stub.mjs')], {
      cwd: root, env: {...baseEnv}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [mailpitServer.stdout, mailpitServer.stderr]) {
      stream?.on('data', (chunk) => appendFileSync(logPath, chunk));
    }
    await waitForHttp('http://127.0.0.1:8025/api/v1/search', 10_000);
  }
}

async function startCandidateServer(candidateRoot, env, attemptRootPath) {
  await ensureMailpit();
  const logPath = path.join(attemptRootPath, 'logs', 'candidate-server.log');
  writeFileSync(logPath, '', 'utf8');
  const nextBin = path.join(candidateRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  candidateServer = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', '3199'], {
    cwd: candidateRoot,
    env: {...baseEnv, ...env, PORT: '3199', HOSTNAME: '127.0.0.1'},
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [candidateServer.stdout, candidateServer.stderr]) {
    stream?.on('data', (chunk) => appendFileSync(logPath, chunk));
  }
  candidateServer.on('error', (error) => appendFileSync(logPath, `${error.stack ?? error}\n`));
  await waitForHttp('http://127.0.0.1:3199/login', 60_000);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(undefined); } };
    child.once('exit', finish);
    child.kill();
    setTimeout(() => { child.kill('SIGKILL'); finish(); }, 5_000).unref();
  });
}

async function stopCandidateServices() {
  await stopChild(candidateServer);
  candidateServer = null;
  if (mailpitServer) {
    await stopChild(mailpitServer);
    mailpitServer = null;
  }
}

function run(commandId, executable, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: options.timeout ?? 20 * 60 * 1000,
    shell: options.shell ?? false,
    windowsHide: true,
    env: {...baseEnv, ...(options.env ?? {})},
  });
  const endedAt = new Date().toISOString();
  const logPath = path.join(logsRoot, `${commandId}.log`);
  const log = sanitize(`${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error}` : ''}`);
  writeFileSync(logPath, log, 'utf8');
  const exitCode = result.status;
  const status = exitCode === 0 ? 'PASS' : exitCode === null ? options.blockedStatus ?? 'FAIL' : 'FAIL';
  const entry = {
    commandId,
    invocation: sanitize([executable, ...args].join(' ')),
    environmentId: 'local-m3-isolated-postgres',
    startAt: startedAt,
    endAt: endedAt,
    exitCode,
    signal: result.signal,
    status,
    outputRef: relative(logPath),
  };
  commandResults.push(entry);
  writeJson(path.join(attemptRoot, 'commands.json'), commandResults);
  console.log(`${commandId}: ${status}`);
  return entry;
}

function recordBlocked(commandId, reason) {
  const now = new Date().toISOString();
  const logPath = path.join(logsRoot, `${commandId}.log`);
  writeFileSync(logPath, `${reason}\n`, 'utf8');
  const entry = {
    commandId,
    invocation: 'Not run; prerequisite evidence unavailable.',
    environmentId: 'local-m3-isolated-postgres',
    startAt: now,
    endAt: now,
    exitCode: null,
    signal: null,
    status: 'BLOCKED',
    outputRef: relative(logPath),
  };
  commandResults.push(entry);
  writeJson(path.join(attemptRoot, 'commands.json'), commandResults);
  console.log(`${commandId}: BLOCKED`);
  return entry;
}

function parseCandidate(file) {
  if (!existsSync(file)) return {};
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function captureCandidate(label) {
  const result = run(`candidate-digests-${label}`, process.execPath, ['scripts/candidate-digests.mjs', path.join(attemptRoot, `candidate-${label}`)], {timeout: 2 * 60 * 1000});
  return {result, candidate: parseCandidate(path.join(attemptRoot, `candidate-${label}`, 'candidate.json'))};
}

function databaseAdminUrl(databaseUrl) {
  const value = new URL(databaseUrl);
  value.pathname = '/postgres';
  return value.toString();
}

async function createIsolatedDatabase() {
  const sourceUrl = baseEnv.DATABASE_URL;
  if (!sourceUrl) throw new Error('DATABASE_URL is missing; cannot make an isolated verification database.');
  isolatedDatabase = `shpitto_m3_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const candidates = [
    databaseAdminUrl(sourceUrl),
    'postgres://postgres@127.0.0.1:55432/postgres',
  ].filter((value, index, all) => all.indexOf(value) === index);
  let lastError = null;
  for (const adminUrl of candidates) {
    const client = new Client({connectionString: adminUrl});
    try {
      await client.connect();
      await client.query(`CREATE DATABASE "${isolatedDatabase}"`);
      adminClient = client;
      const verificationUrl = new URL(adminUrl);
      verificationUrl.pathname = `/${isolatedDatabase}`;
      return verificationUrl.toString();
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
    }
  }
  throw lastError ?? new Error('No local PostgreSQL admin endpoint could create a disposable database.');
}

function coverageArgs(sourcePath, lcovPath) {
  const owned = collectOwnedModules(root);
  const include = [...new Set(owned.map((file) => file.replaceAll('\\', '/')))].flatMap((file) => ['--test-coverage-include', file]);
  return {
    owned,
    args: [
      '--experimental-strip-types', '--test', '--test-concurrency=1', '--experimental-test-coverage', '--test-coverage-branches=0',
      ...include, '--test-reporter=spec', '--test-reporter=lcov', '--test-reporter-destination=stdout',
      `--test-reporter-destination=${lcovPath}`, sourcePath,
    ],
  };
}

function currentBrowserEvidence() {
  const file = browserEvidencePath;
  if (!file || !isRetainedM3Artifact(root, file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const completeness = assessBrowserEvidence(parsed, (reference) => isRetainedM3Artifact(root, reference));
    const application = typeof parsed.application === 'string' ? new URL(parsed.application) : null;
    const declaredApplication = typeof baseEnv.APP_URL === 'string' && baseEnv.APP_URL.length > 0
      ? new URL(baseEnv.APP_URL)
      : null;
    const localApplication = application !== null
      && application.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(application.hostname)
      && application.port.length > 0
      && declaredApplication !== null
      && application.origin === declaredApplication.origin;
    const provenance = localApplication
      && typeof parsed.profile === 'string' && parsed.profile.length > 0
      && typeof parsed.capturedAt === 'string' && !Number.isNaN(Date.parse(parsed.capturedAt))
      && typeof parsed.credentialsRef === 'string' && parsed.credentialsRef.length > 0;
    const ownerControls = Array.isArray(parsed.journeys)
      ? parsed.journeys.find((journey) => journey?.id === 'owner-controls')
      : null;
    // Destructive UI proof is intentionally structured evidence, not a copy claim:
    // each submittedActions row must identify action, POST route, 200 response,
    // target member and an ISO timestamp.
    const submittedActions = Array.isArray(ownerControls?.submittedActions) ? ownerControls.submittedActions : [];
    const requiredActions = ['remove-member', 'transfer-owner'];
    const ownerControlActionsSubmitted = requiredActions.every((action) => submittedActions.some((entry) =>
      entry?.action === action
      && entry?.result === 'PASS'
      && entry?.requestMethod === 'POST'
      && Number(entry?.responseStatus) === 200
      && typeof entry?.path === 'string' && entry.path.startsWith('/api/')
      && typeof entry?.targetUserId === 'string' && entry.targetUserId.length > 0
      && typeof entry?.submittedAt === 'string' && !Number.isNaN(Date.parse(entry.submittedAt))));
    return {
      ...parsed,
      evidenceRef: relative(file),
      tiedToCandidate: parsed.candidateSha256 === currentCandidate.sourceTreeSha256,
      provenanceValid: Boolean(provenance),
      completeness,
      ownerControlActionsSubmitted,
    };
  } catch { return null; }
}

function commandStatus(commandId) {
  return commandResults.find((command) => command.commandId === commandId)?.status ?? 'NOT_RUN';
}

function evidenceFor(commandIds) {
  return commandIds.flatMap((commandId) => {
    const command = commandResults.find((item) => item.commandId === commandId);
    return command && command.status === 'PASS' ? [command.outputRef] : [];
  });
}

function scenarioResult(commandIds, browserRequired = false) {
  const statuses = commandIds.map(commandStatus);
  if (statuses.length === 0) return 'NOT_RUN';
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.some((status) => status !== 'PASS')) return 'NOT_RUN';
  if (browserRequired && !browserReviewPasses()) return 'NOT_RUN';
  return 'PASS';
}

function browserReviewPasses(requireOwnerControlActions = false) {
  return Boolean(
    browserEvidence?.tiedToCandidate
    && browserEvidence?.provenanceValid
    && browserEvidence?.completeness?.passed
    && browserEvidence?.uiReview?.result === 'PASS'
    && browserEvidence?.journeys?.every((journey) => journey.result === 'PASS')
    && (!requireOwnerControlActions || browserEvidence?.ownerControlActionsSubmitted),
  );
}

function buildScenarios(traceability) {
  const m3Requirements = traceability.filter((entry) => entry.milestones?.includes('M3'));
  const directEvidence = {
    'SC-CRD-03': ['probe-credit-reservation'],
    'SC-CRD-04': ['probe-credit-reservation'],
    'SC-CRD-07': ['probe-credit-ledger', 'probe-command-contract'],
    'SC-CRD-08': ['probe-credit-ledger', 'probe-command-contract'],
    'SC-CRD-09': ['probe-credit-refund'],
    'SC-CRD-10': ['probe-generation-lifecycle', 'probe-generation-replay'],
    'SC-CRD-11': ['probe-credit-refund'],
    'SC-CRD-12': ['probe-credit-refund'],
    'SC-CRD-13': ['probe-credit-refund'],
    'SC-CRD-14': ['probe-credit-refund'],
    'SC-CRD-15': ['probe-credit-refund'],
    'SC-CRD-16': ['probe-credit-refund'],
    'SC-GEN-01': ['probe-generation-lifecycle', 'probe-auth-http', 'probe-team-http'],
    'SC-GEN-02': ['probe-generation-lifecycle', 'probe-m3-crash-restart'],
    'SC-GEN-03': ['probe-generation-races'],
    'SC-GEN-04': ['probe-generation-lifecycle', 'probe-generation-races'],
    'SC-GEN-05': ['probe-generation-lifecycle', 'probe-generation-create'],
    'SC-GEN-06': ['probe-generation-lifecycle'],
    'SC-GEN-07': ['probe-generation-lifecycle', 'probe-m3-recovery', 'probe-m3-crash-restart'],
    'SC-GEN-13': ['probe-m3-recovery'],
    'SC-GEN-08': ['probe-m3-recovery', 'probe-generation-lifecycle'],
    'SC-GEN-15': ['probe-assets', 'probe-generation-create'],
    'SC-GEN-09': ['probe-m3-recovery', 'probe-m3-crash-restart'],
    'SC-GEN-10': ['probe-generation-races'],
    'SC-GEN-11': ['probe-m3-crash-restart', 'probe-outbox-lease'],
    'SC-GEN-12': ['probe-outbox-lease', 'probe-asset-security'],
    'SC-GEN-14': ['probe-generation-races', 'probe-generation-replay'],
    'SC-GEN-16': ['probe-assets', 'probe-generation-lifecycle', 'probe-m3-crash-restart', 'probe-asset-cleanup'],
    'SC-GEN-17': ['probe-assets'],
    'SC-GEN-18': ['probe-assets', 'probe-asset-security', 'probe-asset-cleanup'],
    'SC-GEN-19': ['probe-generation-lifecycle', 'probe-m3-recovery'],
    'SC-GEN-20': ['probe-m3-recovery', 'probe-m3-crash-restart'],
    'SC-IAM-03': ['probe-workspaces', 'probe-tenant-authorization'],
    'SC-IAM-04': ['probe-workspaces', 'probe-tenant-authorization'],
    'SC-IAM-05': ['probe-invitations', 'probe-team-http'],
    'SC-IAM-06': ['probe-invitations', 'probe-team-http'],
    'SC-IAM-07': ['probe-api-isolation'],
    'SC-IAM-08': ['probe-api-isolation'],
    'SC-REL-14': ['probe-generation-lifecycle', 'probe-auth-http', 'probe-team-http', 'probe-api-isolation', 'probe-m3-recovery'],
    'SC-REL-15': ['typecheck', 'lint', 'format-check', 'openspec', 'frozen-lock-install', 'production-build'],
  };
  // Traceability is shared across milestones. The M3 record must contain the
  // local Mock profile only; later affiliate, Skills, Docs, deployment and
  // commercial tests belong to their own gates even when a shared requirement
  // also names M3 as an evidence checkpoint.
  const scenarioIds = [...new Set(m3Requirements.flatMap((entry) => entry.scenarioIds ?? []))]
    .filter((id) => Object.hasOwn(directEvidence, id))
    .sort();
  const m3TestIds = new Set([
    'T01', 'T02', 'T03', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20',
    'T49', 'T53', 'T60', 'T61',
  ]);
  const scenarioObserved = {
    'SC-GEN-10': 'The race probe settles success-before-deadline and deadline-before-success fixtures; each opposite terminal observation is quarantined and the active task winner remains unchanged.',
    'SC-GEN-13': 'The recovery probe settles a queued task with refund, then delivers a late success; it asserts quarantine, unchanged failed state, released reservation and no additional ledger effect.',
    'SC-GEN-18': 'The asset probe proves active-input deletion is denied, keeps recent taskless pending orphans during the twenty-four-hour recovery window, and removes eligible older rows and private objects afterward.',
    'SC-GEN-20': 'The recovery probe records workspace/task/attempt/event/command/release correlations and rejects secret-like fields; the crash probe separately verifies fresh-process recovery at implemented local boundaries.',
    'SC-REL-14': 'The isolated local Mock profile completes the seeded sign-in, workspace, generation, invitation, recovery and private-download journey with the browser and HTTP evidence bound to this candidate.',
    'SC-REL-15': 'The record identifies the local Mock/no-cloud profile, keeps paid providers and production delivery out of scope, and preserves current candidate, command and evidence references without relabeling deferred proof.',
  };
  const browserScenarioIds = new Set(['SC-GEN-01', 'SC-GEN-17', 'SC-IAM-03', 'SC-IAM-04', 'SC-IAM-05', 'SC-IAM-06', 'SC-IAM-07', 'SC-IAM-08', 'SC-REL-14']);
  const records = scenarioIds.map((id) => {
    const requirement = m3Requirements.find((entry) => entry.scenarioIds?.includes(id));
    const commandIds = directEvidence[id] ?? [];
    const result = scenarioResult(commandIds, browserScenarioIds.has(id));
    return {
      ids: [id], taskIds: requirement?.taskIds?.filter((taskId) => taskId.startsWith('4.')) ?? [],
      mandatory: true, result, scope: requirement?.title ?? 'M3 traceability scenario.',
      expected: requirement?.title ?? 'Exercise the traceability scenario.',
      observed: result === 'PASS' ? scenarioObserved[id] ?? `Verified by ${commandIds.join(', ')}.` : 'Complete current-candidate evidence was not recorded.',
      environmentId: 'local-m3-isolated-postgres', profile: 'local-mock', iteration: null, seed: null,
      commandRef: commandIds.length ? commandIds.map((id) => `${relative(attemptRoot)}/commands.json#${id}`) : [],
      evidenceRefs: evidenceFor(commandIds).concat(result === 'PASS' && browserScenarioIds.has(id) ? [browserEvidence.evidenceRef] : []),
    };
  });
  const testIds = [...new Set(m3Requirements.flatMap((entry) => entry.T ?? []))]
    .filter((id) => m3TestIds.has(id))
    .sort();
  for (const id of testIds) {
    const requiredTasks = [...new Set(m3Requirements.filter((entry) => entry.T?.includes(id)).flatMap((entry) => entry.taskIds ?? []).filter((taskId) => taskId.startsWith('4.')))];
    const commandIds = {
      T01: ['probe-generation-lifecycle', 'probe-auth-http', 'probe-team-http'],
      T02: ['probe-api-isolation', 'probe-assets'],
      T03: ['probe-api-isolation', 'probe-assets'],
      T05: ['probe-workspaces', 'probe-invitations', 'probe-team-http'],
      T06: ['probe-credit-reservation', 'probe-generation-create'],
      T07: ['probe-credit-ledger', 'probe-credit-refund', 'probe-credit-migration-backfill'],
      T08: ['probe-credit-ledger', 'probe-credit-refund', 'probe-credit-migration-backfill'],
      T09: ['probe-credit-reservation', 'probe-generation-create', 'probe-generation-lifecycle', 'probe-generation-replay'],
      T10: ['probe-generation-races', 'probe-command-contract'],
      T11: ['probe-generation-lifecycle', 'probe-m3-recovery', 'probe-m3-crash-restart'],
      T12: ['probe-generation-lifecycle', 'probe-m3-recovery', 'probe-m3-crash-restart'],
      T13: ['probe-generation-lifecycle', 'probe-assets'],
      T14: ['probe-generation-create', 'probe-generation-lifecycle', 'probe-generation-races', 'probe-generation-replay', 'probe-m3-recovery', 'probe-m3-crash-restart', 'probe-assets', 'probe-credit-refund'],
      T15: ['probe-credit-refund', 'probe-m3-recovery'],
      T16: ['probe-credit-refund'],
      T17: ['probe-credit-refund'],
      T18: ['probe-credit-refund', 'probe-m3-recovery'],
      T19: ['probe-credit-refund', 'probe-generation-replay'],
      T20: ['probe-generation-lifecycle', 'probe-m3-recovery'],
      T49: ['probe-m3-recovery', 'probe-m3-crash-restart'],
      T53: ['probe-m3-recovery', 'probe-m3-crash-restart'],
      T60: ['probe-credit-ledger', 'probe-credit-refund', 'probe-command-contract'],
      T61: ['probe-credit-ledger', 'probe-credit-refund', 'probe-credit-migration-backfill'],
    }[id] ?? [];
    const result = scenarioResult(commandIds, ['T01', 'T02', 'T03', 'T05', 'T05.a'].includes(id));
    records.push({
      ids: [id], taskIds: requiredTasks, mandatory: true, result, scope: `M3 test case ${id}.`, expected: `Complete ${id} under the M3 local profile.`,
      observed: result === 'PASS' ? `Verified by ${commandIds.join(', ')}.` : 'Complete current-candidate evidence was not recorded.',
      environmentId: 'local-m3-isolated-postgres', profile: 'local-mock', iteration: null, seed: null,
      commandRef: commandIds.map((commandId) => `${relative(attemptRoot)}/commands.json#${commandId}`), evidenceRefs: evidenceFor(commandIds).concat(result === 'PASS' && ['T01', 'T02', 'T03', 'T05', 'T05.a'].includes(id) ? [browserEvidence.evidenceRef] : []),
    });
  }
  return records;
}

const criteria = [
  {criterionId: 'M3-C01', commandIds: ['probe-generation-lifecycle', 'probe-auth-http', 'probe-team-http'], requiresBrowser: true,
    expected: 'New-user local sign-in, workspace, server quote, playable Mock output, history/credit lineage, private download, and restart persistence.',
    observed: 'The browser walkthrough file is accepted only if it records this exact candidate digest and all required journeys.'},
  {criterionId: 'M3-C02', commandIds: ['probe-team-http', 'probe-api-isolation'], requiresBrowser: true, requiresOwnerControlActions: true,
    expected: 'Team creation, invitation/acceptance, removal, ownership transfer, workspace switching and personal-space restrictions work in UI and API.',
    observed: 'HTTP probes are run only against an isolated app/DB pair; the current-candidate browser record must also include submitted remove-member and transfer-owner actions with POST route, 200 response, target user and timestamp evidence.'},
  {criterionId: 'M3-C03', commandIds: ['probe-generation-races', 'probe-generation-replay'], repeatCount: 3, repeatCommandIds: ['probe-generation-races'],
    expected: 'Cancel/dispatch and terminal races have one outcome; replay and settlement have one effect; invalid output cannot succeed.',
    observed: 'The runner repeats the race probe three times and separately records twenty normalized callback/domain deliveries, conflicting-payload rejection and reordered late-outcome quarantine.'},
  {criterionId: 'M3-C04', commandIds: ['probe-m3-recovery', 'probe-generation-lifecycle', 'probe-outbox-lease', 'probe-m3-crash-restart', 'probe-asset-security', 'probe-asset-cleanup'],
    expected: 'Crash recovery at each local boundary, sweep/lease fencing, queue starvation and deadline races preserve invariants.',
    observed: 'The crash probe stops a real child process at each implemented local boundary, restarts through a fresh worker invocation and compares task, reservation, attempt, asset and balance invariants. The remote authenticated webhook inbox boundary is explicitly deferred to M4.'},
  {criterionId: 'M3-C05', commandIds: ['probe-assets', 'probe-generation-create', 'probe-asset-security', 'probe-asset-cleanup'],
    expected: 'Unsafe MIME/size/path/media and cross-tenant/private downloads are denied deterministically.',
    observed: 'Asset path/media and workspace-scope assertions come from the local asset probe; generation-create rejects caller-supplied browser/provider URLs. Remote provider-output SSRF/redirect/DNS fixtures are deferred to task 5.7 because this no-cloud candidate has no remote-fetch path.'},
];

function makeRecord({coverage, scenarios, criteriaResults, commonStandards, candidateStatus, environmentStatus}) {
  const requiredChecks = [...criteriaResults, ...commonStandards, ...scenarios];
  const status = deriveStageStatus({candidateStable: candidateStable && candidateStatus === 'PASS', criteria: criteriaResults, standards: commonStandards, scenarios, submissionReady: true});
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0', recordKind: 'DEVELOPMENT_VERIFICATION', changeId: 'restart-shpitto-video-saas', stageId: 'M3', checkpointId: null, gateTaskId: '4.12',
    status, candidateId: path.basename(output), verificationAttemptId: attemptId, createdAt: now, updatedAt: now,
    policy: {path: 'openspec/changes/restart-shpitto-video-saas/acceptance-gates.md'},
    prerequisites: [
      {stageId: 'M2', observedStatus: 'PASS', candidateId: 'working-tree-20260929-m2-repair', evidenceRefs: ['internal/evidence/acceptance/M2/working-tree-20260929-m2-repair/record.json']},
      ...['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '4.9', '4.10', '4.11', '4.13'].map((taskId) => ({taskId, observedStatus: taskId === '4.13' && !browserReviewPasses(true) ? 'IN_PROGRESS' : 'PASS', evidenceRefs: ['openspec/changes/restart-shpitto-video-saas/tasks.md']})),
    ],
    candidate: {
      capturedAt: currentCandidate.capturedAt ?? now, sourceCommit: currentCandidate.sourceCommit ?? null, dirtyPatchSha256: currentCandidate.dirtyPatchSha256 ?? null,
      sourceTreeSha256: currentCandidate.sourceTreeSha256 ?? null, schemaSha256: currentCandidate.schemaSha256 ?? null,
      lockfileSha256: currentCandidate.lockfileSha256 ?? null, configurationSha256: currentCandidate.configurationSha256 ?? null,
      contractSha256: currentCandidate.contractSha256 ?? null, validatorSha256: currentCandidate.validatorSha256 ?? null,
      digestAlgorithm: currentCandidate.digestAlgorithm ?? null, digestInputs: currentCandidate.digestInputs ?? {},
      startDigestsRef: `${relative(attemptRoot)}/candidate-before/candidate.json`, endDigestsRef: `${relative(attemptRoot)}/candidate-after/candidate.json`,
      stableAcrossVerification: candidateStable,
    },
    environments: [{
      environmentId: 'local-m3-isolated-postgres', profile: 'Local no-cloud Mock profile; every database probe targets a disposable database created for this attempt.',
      clockMode: 'Probe-controlled clocks for deadline cases; wall clock for local HTTP/browser checks.',
      fixtureOrSeed: 'Disposable probe fixtures, per-probe cleanup and a per-attempt PostgreSQL database; no production/provider/payment requests.',
      sanitationNotes: 'Command output is secret-redacted; test users, invitation tokens and signed URLs are omitted from evidence.',
      toolVersions: {node: process.version, postgres: 'local server version captured by migration log', pnpm: '12.6.0'},
      effectiveLimits: 'Local PostgreSQL and Mock profile only; production email, real providers, Stripe and historical-balance recovery are deferred.',
      setupStatus: environmentStatus,
    }],
    criterionResults: criteriaResults,
    commonStandardResults: commonStandards,
    scenarioResults: scenarios,
    commands: commandResults,
    coverage: {
      status: coverage.status, ownedModuleManifestRef: `${relative(attemptRoot)}/owned-modules.json`, denominator: coverage.branchesFound,
      coveredBranches: coverage.branchesHit, totalBranches: coverage.branchesFound, percent: Number(coverage.percent.toFixed(2)),
      exclusions: [
        {path: 'src/db/schema/**', reason: 'Declarative database schema; PostgreSQL constraints are exercised by isolated integration probes.'},
        {path: 'src/app/**', reason: 'HTTP/UI layers use required request and manual viewport evidence; they are not core-domain modules.'},
        {path: 'scripts/**', reason: 'Verification drivers are not delivered business-domain behavior.'},
        {path: 'node_modules/**', reason: 'Third-party implementation.'},
      ], evidenceRef: `${relative(attemptRoot)}/coverage-summary.json`,
    },
    defects: [],
    externalInputs: [
      {input: 'Production email delivery', owner: 'later M4/M8 integration', affectedTasks: ['M4', 'M8'], availability: 'OUT_OF_SCOPE', nextAction: 'Use the authorized production provider in its later stage.', authorityRef: 'internal/restart/external-inputs.json'},
      {input: 'Real provider credentials and bounded spend', owner: 'later M4 integration', affectedTasks: ['5.1-5.10'], availability: 'OUT_OF_SCOPE', nextAction: 'Run the provider matrix only under approved accounts and budget.', authorityRef: 'internal/restart/external-inputs.json'},
      {input: 'Historical anomalous balance recovery authority', owner: 'later billing/operations phase', affectedTasks: ['M5', 'M6'], availability: 'OUT_OF_SCOPE', nextAction: 'Perform the separately authorized audited recovery.', authorityRef: 'internal/restart/external-inputs.json'},
      {input: 'Current-candidate UI viewport, keyboard and destructive owner-control review', owner: 'M3 product acceptance', affectedTasks: ['4.12'], availability: browserReviewPasses(true) ? 'AVAILABLE' : browserEvidence?.tiedToCandidate && browserEvidence?.provenanceValid ? 'PARTIAL' : 'UNAVAILABLE', nextAction: browserReviewPasses(true) ? 'Submit the retained current-candidate browser evidence for independent review.' : 'Capture desktop/mobile viewport and keyboard evidence against the exact candidate, including submitted remove-member and transfer-owner actions.', authorityRef: 'openspec/changes/restart-shpitto-video-saas/acceptance-gates.md'},
    ],
    commercialAuthorizationRefs: [],
    recovery: {rollbackPoint: 'candidate source snapshot before this verification attempt', restoreEvidenceRefs: [], compatibleSchemaVersions: ['migrations present in candidate'], unrelatedWorkProtection: 'Probe data uses a disposable PostgreSQL database; test asset roots are outside the live demo asset directory.'},
    observation: {planRef: null, windowStart: null, windowEnd: null, windowRationale: null, behavioralBaselineDigest: currentCandidate.sourceTreeSha256 ?? null, monitoringEvidenceRefs: [], journeyEvidenceRefs: browserEvidence?.tiedToCandidate && browserEvidence?.provenanceValid ? [browserEvidence.evidenceRef] : [], recoveryUpgradeEvidenceRefs: evidenceFor(['probe-m3-recovery']), recurringWorkerAlertEvidenceRefs: [], findingRefs: []},
    submission: {implementerId: 'codex-m3-evidence', submittedAt: now, reportRef: `${relative(attemptRoot)}/report.md`},
    independentReview: {reviewerId: null, reviewedAt: null, independentFromImplementer: null, decision: 'NOT_RUN', reason: 'Deferred to the final manual-acceptance queue; this runner never supplies a reviewer verdict.', evidenceRefs: []},
    integrationDecision: {integratorId: null, decidedAt: null, decision: 'NOT_RUN', reason: 'Deferred to the final manual-acceptance queue; this record does not block downstream automated verification.', nextEligibleTaskIds: ['5.1', '6.1'], blockedTaskIds: []},
    invalidation: {supersedesRecordRef: existsSync(path.join(output, 'record.json')) ? relative(path.join(output, 'record.json')) : null, changedDigestRefs: candidateStable ? [] : ['candidate.sourceTreeSha256'], affectedStages: candidateStable ? [] : ['M3'], requiredReruns: candidateStable ? [] : ['repeat verification on one stable exact candidate'], carriedEvidence: []},
    evidenceSummary: {mandatoryChecks: requiredChecks.filter((entry) => entry.blocking !== false).length, passed: requiredChecks.filter((entry) => entry.result === 'PASS').length, unresolved: requiredChecks.filter((entry) => entry.blocking !== false && entry.result !== 'PASS').map((entry) => ({id: entry.criterionId ?? entry.standard ?? entry.ids?.join(','), result: entry.result})), deferredManualReview: ['independent-review', 'integration-decision'], missingBrowserChecks: browserEvidence?.completeness?.missing ?? ['browser evidence unavailable']},
  };
}

async function runVerification() {
  mkdirSync(attemptRoot, {recursive: true});
  const currentRecordPath = path.join(output, 'record.json');
  if (existsSync(currentRecordPath)) copyFileSync(currentRecordPath, path.join(attemptRoot, 'superseded-record.json'));

  const before = captureCandidate('before');
  const setupLog = path.join(logsRoot, 'isolated-database-setup.log');
  let databaseUrl = null;
  try {
    databaseUrl = await createIsolatedDatabase();
    writeFileSync(setupLog, `Disposable database created: ${isolatedDatabase}\n`, 'utf8');
  } catch (error) {
    writeFileSync(setupLog, `${sanitize(error instanceof Error ? error.message : error)}\n`, 'utf8');
  }

  let migrationPassed = false;
  if (databaseUrl) {
    const migrate = run('isolated-db-migrate', process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts'], {env: {DATABASE_URL: databaseUrl, NODE_ENV: 'test'}});
    migrationPassed = migrate.status === 'PASS';
  } else {
    recordBlocked('isolated-db-migrate', 'Disposable database creation failed; no probe was run against the live demo database.');
  }

  const pnpm = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
  const checkEnv = databaseUrl ? {DATABASE_URL: databaseUrl, NODE_ENV: 'test'} : {NODE_ENV: 'test'};
  for (const [id, args] of [
    ['typecheck', ['pnpm', 'typecheck']],
    ['lint', ['pnpm', 'lint']],
    ['format-check', ['pnpm', 'format:check']],
    ['openspec', ['pnpm', 'verify:openspec']],
  ]) run(id, pnpm, args, {shell: true, env: checkEnv});

  if (!databaseUrl) {
    recordBlocked('frozen-lock-install', 'Disposable database creation failed; the isolated candidate clone was not built because no database-backed verification can run safely.');
    recordBlocked('production-build', 'Disposable database creation failed; production build evidence was not captured in this attempt.');
  }
  scratchRoot = databaseUrl ? mkdtempSync(path.join(os.tmpdir(), 'shpitto-m3-verification-')) : null;
  const candidateRoot = scratchRoot ? path.join(scratchRoot, 'candidate') : null;
  // M3 owns the complete delivered domain surface. Keep the new M3 probes
  // together with the M2 persistence/auth probes so every owned module is
  // exercised in this candidate's isolated database and contributes LCOV.
  const probeNames = [
    'generation-create', 'generation-lifecycle', 'generation-races', 'assets', 'asset-cleanup', 'asset-security', 'outbox-lease', 'm3-recovery',
    'm2-foundation', 'onboarding', 'workspaces', 'invitations', 'tenant-authorization', 'operator',
    'access-states', 'command-contract', 'credit-ledger', 'credit-reservation', 'credit-refund',
    'credit-migration-backfill', 'auth-lifecycle',
  ];
  const protocolProbeNames = ['generation-replay', 'm3-crash-restart'];
  if (!candidateRoot) {
    const ownedModules = collectOwnedModules(root);
    writeJson(path.join(attemptRoot, 'owned-modules.json'), {schemaVersion: '1.0', stageId: 'M3', verificationAttemptId: attemptId, generatedAt: new Date().toISOString(), inclusion: ownedModules, minimumBranchPercent: 80, note: 'No isolated database was available; owned-module coverage was not run.'});
    for (const probe of probeNames) recordBlocked(`probe-${probe}`, 'Disposable database migration did not pass; the probe was not sent to the live application database.');
    for (const probe of protocolProbeNames) recordBlocked(`probe-${probe}`, 'Disposable database migration did not pass; the protocol probe was not run against a live local database.');
    recordBlocked('probe-api-isolation', 'This runner does not attach to the live app. Run it only after the isolated HTTP app harness supplies APP_URL and DATABASE_URL.');
    recordBlocked('probe-team-http', 'This runner does not attach to the live app. Team HTTP proof requires a separately hosted isolated candidate app.');
    recordBlocked('probe-auth-http', 'This runner does not attach to the live app. Authentication HTTP proof requires a separately hosted isolated candidate app.');
    const freshnessEnd = captureCandidate('after');
    currentCandidate = freshnessEnd.candidate;
    candidateStable = before.result.status === 'PASS' && freshnessEnd.result.status === 'PASS' && ['sourceTreeSha256', 'schemaSha256', 'lockfileSha256', 'configurationSha256', 'contractSha256', 'validatorSha256'].every((key) => before.candidate[key] && before.candidate[key] === freshnessEnd.candidate[key]);
    writeJson(path.join(attemptRoot, 'digest-freshness.json'), {status: candidateStable ? 'PASS' : 'FAIL', before: before.candidate, after: freshnessEnd.candidate, changedDigests: []});
    browserEvidence = currentBrowserEvidence();
    const traceabilityPath = path.join(root, 'openspec/changes/restart-shpitto-video-saas/traceability.json');
    const traceabilityData = JSON.parse(readFileSync(traceabilityPath, 'utf8'));
    const traceability = Array.isArray(traceabilityData) ? traceabilityData : traceabilityData.requirements ?? [];
    const scenarios = buildScenarios(traceability);
    const criteriaResults = criteria.map((item) => ({criterionId: item.criterionId, mandatory: true, result: 'NOT_RUN', environmentId: 'local-m3-isolated-postgres', expected: item.expected, observed: 'Isolated database prerequisite was unavailable; current-candidate evidence was not run against the live database.', evidenceRefs: []}));
    const standards = [
      {standard: 'build-and-checks', applicable: true, result: 'NOT_RUN', assertions: 'Frozen-lock install, production build, typecheck, lint, format and strict OpenSpec validation.', evidenceRefs: evidenceFor(['typecheck', 'lint', 'format-check', 'openspec', 'frozen-lock-install', 'production-build'])},
      {standard: 'current-digests', applicable: true, result: candidateStable ? 'PASS' : 'FAIL', assertions: 'Declared source/schema/config/contract/validator/lock digests are unchanged across the verification attempt.', evidenceRefs: [`${relative(attemptRoot)}/digest-freshness.json`, ...evidenceFor(['candidate-digests-before', 'candidate-digests-after'])]},
      {standard: 'owned-domain-branch-coverage', applicable: true, result: 'NOT_RUN', assertions: 'At least 80% aggregate branch coverage across owned modules.', evidenceRefs: []},
      {standard: 'no-cloud-isolated-profile', applicable: true, result: 'BLOCKED', assertions: 'Disposable local PostgreSQL probes pass; no disposable database could be created on this host.', evidenceRefs: [`${relative(attemptRoot)}/commands.json`, relative(setupLog)]},
      {standard: 'ui-viewport-and-keyboard', applicable: true, result: browserReviewPasses() ? 'PASS' : 'NOT_RUN', assertions: 'Current-candidate UI review at 1440x900 and 390x844 plus keyboard traversal.', evidenceRefs: browserEvidence?.tiedToCandidate && browserEvidence?.provenanceValid ? [browserEvidence.evidenceRef] : []},
      {standard: 'repeatability-protocol', applicable: true, result: 'NOT_RUN', assertions: 'Critical repeat and callback/restart evidence.', evidenceRefs: []},
      {standard: 'independent-review', applicable: true, blocking: false, result: 'DEFERRED_FINAL_REVIEW', assertions: 'Independent review and integration decision are accumulated in the final manual-acceptance queue and do not block downstream automated verification.', evidenceRefs: []},
    ];
    const record = makeRecord({coverage: {status: 'NOT_RUN', branchesFound: 0, branchesHit: 0, percent: 0}, scenarios, criteriaResults, commonStandards: standards, candidateStatus: candidateStable ? 'PASS' : 'FAIL', environmentStatus: 'BLOCKED'});
    writeJson(path.join(attemptRoot, 'record.json'), record);
    writeFileSync(path.join(attemptRoot, 'report.md'), `# M3 verification attempt ${attemptId}\n\nStatus: ${record.status}. Disposable PostgreSQL creation was blocked by the local role; no live database was used. Current-candidate UI review is recorded separately; independent review and integrator decision are deferred to final manual acceptance.\n`, 'utf8');
    writeJson(path.join(output, 'record.json'), record);
    writeFileSync(path.join(output, 'report.md'), readFileSync(path.join(attemptRoot, 'report.md'), 'utf8'), 'utf8');
    const checker = run('record-integrity', process.platform === 'win32' ? 'python' : 'python3', ['internal/restart/check-acceptance-record.py', path.join(output, 'record.json'), '--current'], {timeout: 2 * 60 * 1000});
    if (checker.status !== 'PASS') record.status = 'FAIL';
    writeJson(path.join(attemptRoot, 'record.json'), record);
    writeJson(path.join(output, 'record.json'), record);
    writeFileSync(path.join(output, 'report.md'), readFileSync(path.join(attemptRoot, 'report.md'), 'utf8'), 'utf8');
    if (!isolatedDatabase) databaseCleanupPassed = true;
    writeFileSync(path.join(logsRoot, 'isolated-database-cleanup.log'), 'No temporary database had been created.\n', 'utf8');
    console.log(`M3 candidate status: ${record.status}`);
    console.log(`Verification evidence: ${relative(attemptRoot)}`);
    process.exitCode = 1;
    return;
  }
  // Candidate copies must contain source and evidence inputs only. Build caches,
  // browser traces and local tool state are regenerated and can be enormous;
  // copying them makes verification non-deterministic and can exhaust the
  // temporary volume before the frozen-lock install starts.
  const excludedNames = new Set([
    '.git', '.next', '.data', '.omx', '.codex', '.agents', '.turbo', '.cache', '.playwright-cli',
    '.gstack', '.opencode', '.tmp', '.tmp-ai-image-template-security-check-019f',
    'node_modules', 'coverage', 'output', 'test-results', 'playwright-report', 'legacy',
  ]);
  cpSync(root, candidateRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = path.relative(root, source);
      if (!relativePath) return true;
      const pieces = relativePath.split(path.sep);
      if (pieces.some((piece) => excludedNames.has(piece)) || pieces.includes('verification-attempts')) return false;
      if (pieces[0] === 'internal' && pieces[1] === 'evidence') return false;
      if (/^\.env(?:\.|$)/.test(path.basename(source))) return false;
      return true;
    },
  });
  const dependencyEnv = {NODE_ENV: 'development'};
  const install = run('frozen-lock-install', pnpm, ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline', '--ignore-scripts'], {cwd: candidateRoot, shell: true, env: dependencyEnv, timeout: 20 * 60 * 1000});
  lockWasVerified = install.status === 'PASS';
  if (lockWasVerified) {
    run('production-build', pnpm, ['pnpm', 'build'], {
      cwd: candidateRoot, shell: true, timeout: 20 * 60 * 1000,
      env: {
        NODE_ENV: 'production', DATABASE_URL: databaseUrl ?? 'postgres://build:build@127.0.0.1:5432/build',
        APP_URL: 'http://127.0.0.1:3199', BETTER_AUTH_SECRET: `isolated-build-${randomUUID()}-secret-value`,
        STORAGE_DRIVER: 's3-compatible', GENERATION_DRIVER: 'provider', MAIL_DRIVER: 'smtp',
        ASSET_ROOT: path.join(candidateRoot, '.data', 'assets'), MAIL_SMTP_URL: 'smtp://127.0.0.1:1025', MAIL_HTTP_URL: 'http://127.0.0.1:8025',
      },
    });
  } else recordBlocked('production-build', 'Production build was not attempted because frozen-lock install failed.');

  const ownedModules = collectOwnedModules(root);
  const manifest = {
    schemaVersion: '1.0', stageId: 'M3', verificationAttemptId: attemptId, generatedAt: new Date().toISOString(),
    inclusion: ownedModules, minimumBranchPercent: 80,
    policy: 'Include all delivered workspace, credit, generation, asset, adapter and shared HTTP/auth domain modules. Every included source must appear in merged LCOV; missing files fail coverage.',
    exclusions: [
      {path: 'src/adapters/mail/contracts.ts', reason: 'Type-only declarations have no executable branches.'},
      {path: 'src/db/schema/**', reason: 'Declarative database schema, verified by isolated PostgreSQL assertions.'},
      {path: 'src/app/**', reason: 'HTTP/UI layers require request and manual viewport evidence.'},
      {path: 'scripts/**', reason: 'Verification drivers are not delivered domain behavior.'},
      {path: 'node_modules/**', reason: 'Third-party implementation.'},
    ],
  };
  writeJson(path.join(attemptRoot, 'owned-modules.json'), manifest);

  const unitFiles = existsSync(path.join(root, 'tests/unit'))
    ? readdirSync(path.join(root, 'tests/unit')).filter((file) => file.endsWith('.test.ts')).map((file) => `tests/unit/${file}`).sort()
    : [];
  const lcovSources = [];
  const probePassed = new Map();
  if (migrationPassed) {
    for (const probe of probeNames) {
      const lcovPath = path.join(attemptRoot, `${probe}.lcov`);
      const args = coverageArgs(`scripts/probe-${probe}.ts`, lcovPath);
      const result = run(`probe-${probe}`, process.execPath, args.args, {timeout: 10 * 60 * 1000, env: checkEnv});
      probePassed.set(probe, result.status === 'PASS');
      const sample = existsSync(lcovPath) ? readFileSync(lcovPath, 'utf8') : '';
      if (sample) lcovSources.push(sample);
      coverageRuns.push({commandId: `probe-${probe}`, lcovRef: relative(lcovPath)});
    }
    for (const file of unitFiles) {
      const id = `unit-${path.basename(file, '.test.ts')}`;
      const lcovPath = path.join(attemptRoot, `${id}.lcov`);
      const args = coverageArgs(file, lcovPath);
      const result = run(id, process.execPath, args.args, {timeout: 10 * 60 * 1000, env: checkEnv});
      if (existsSync(lcovPath)) lcovSources.push(readFileSync(lcovPath, 'utf8'));
      coverageRuns.push({commandId: id, lcovRef: relative(lcovPath), status: result.status});
    }
    for (let iteration = 1; iteration <= 3; iteration += 1) {
      for (const probe of ['generation-create', 'generation-races']) {
        const result = run(`repeat-${iteration}-${probe}`, process.execPath, ['--experimental-strip-types', `scripts/probe-${probe}.ts`], {timeout: 5 * 60 * 1000, env: checkEnv});
        if (result.status !== 'PASS') probePassed.set(probe, false);
      }
    }
    const protocolEnv = {DATABASE_URL: databaseUrl, NODE_ENV: 'test'};
    for (const probe of protocolProbeNames) {
      run(`probe-${probe}`, process.execPath, ['--experimental-strip-types', `scripts/probe-${probe}.ts`], {
        cwd: candidateRoot,
        timeout: 10 * 60 * 1000,
        env: protocolEnv,
      });
    }
  } else {
    for (const probe of probeNames) recordBlocked(`probe-${probe}`, 'Isolated database migration did not pass; the probe was not sent to the live application database.');
    for (const probe of protocolProbeNames) recordBlocked(`probe-${probe}`, 'Isolated database migration did not pass; the protocol probe was not run against a live local database.');
  }

  const merged = mergeLcov(lcovSources, root);
  const suitePassed = probeNames.every((name) => probePassed.get(name) === true)
    && unitFiles.every((file) => commandStatus(`unit-${path.basename(file, '.test.ts')}`) === 'PASS');
  const coverage = assessCoverage({ownedModules, reports: merged.reports, malformed: merged.malformed, suitePassed});
  writeJson(path.join(attemptRoot, 'coverage-summary.json'), {...coverage, reports: merged.reports, missingLcovFiles: merged.malformed, runs: coverageRuns});
  console.log(`Owned branches: ${coverage.branchesHit}/${coverage.branchesFound} (${coverage.percent.toFixed(2)}%); missing source files: ${coverage.missingSources.length}`);
  coveragePassed = coverage.status === 'PASS';

  const httpProbeEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    APP_URL: 'http://127.0.0.1:3199',
    BETTER_AUTH_SECRET: `isolated-http-${randomUUID()}-secret-value`,
    MAIL_DRIVER: 'local',
    MAIL_HTTP_URL: 'http://127.0.0.1:8025',
    STORAGE_DRIVER: 'local',
    GENERATION_DRIVER: 'mock',
    ASSET_ROOT: path.join(candidateRoot, '.data', 'assets'),
  };
  const httpProbeNames = ['api-isolation', 'team-http', 'auth-http'];
  if (migrationPassed && commandStatus('production-build') === 'PASS') {
    try {
      await startCandidateServer(candidateRoot, httpProbeEnv, attemptRoot);
      for (const probe of httpProbeNames) {
        run(`probe-${probe}`, process.execPath, ['--experimental-strip-types', `scripts/probe-${probe}.ts`], {
          cwd: candidateRoot,
          timeout: 5 * 60 * 1000,
          env: httpProbeEnv,
        });
      }
    } catch (error) {
      const reason = `Isolated HTTP candidate could not be started: ${sanitize(error instanceof Error ? error.message : error)}`;
      for (const probe of httpProbeNames) recordBlocked(`probe-${probe}`, reason);
    } finally {
      await stopCandidateServices();
    }
  } else {
    const reason = migrationPassed
      ? 'Production build did not pass; the isolated HTTP candidate was not started.'
      : 'Isolated database migration did not pass; the HTTP probes were not sent to an application.';
    for (const probe of httpProbeNames) recordBlocked(`probe-${probe}`, reason);
  }

  const freshnessEnd = captureCandidate('after');
  currentCandidate = freshnessEnd.candidate;
  const digestKeys = ['sourceTreeSha256', 'schemaSha256', 'lockfileSha256', 'configurationSha256', 'contractSha256', 'validatorSha256'];
  candidateStable = before.result.status === 'PASS' && freshnessEnd.result.status === 'PASS'
    && digestKeys.every((key) => before.candidate[key] && before.candidate[key] === freshnessEnd.candidate[key]);
  writeJson(path.join(attemptRoot, 'digest-freshness.json'), {
    status: candidateStable ? 'PASS' : 'FAIL', before: before.candidate, after: freshnessEnd.candidate,
    changedDigests: digestKeys.filter((key) => before.candidate[key] !== freshnessEnd.candidate[key]),
  });

  browserEvidence = currentBrowserEvidence();
  const criteriaResults = criteria.map((item) => {
    const mapped = item.commandIds.map((id) => commandResults.find((command) => command.commandId === id));
    let result = 'NOT_RUN';
    const baseFailed = mapped.some((command) => command?.status === 'FAIL');
    const baseComplete = mapped.length === item.commandIds.length
      && mapped.length > 0
      && mapped.every((command) => command?.status === 'PASS');
    if (baseFailed) result = 'FAIL';
    else if (baseComplete
      && (!item.requiresBrowser || browserReviewPasses(item.requiresOwnerControlActions === true))) result = 'PASS';
    const repeatIds = item.repeatCount ? [1, 2, 3].flatMap((iteration) => (item.repeatCommandIds ?? item.commandIds).map((id) => `repeat-${iteration}-${id.replace('probe-', '')}`)) : [];
    const repeatCommands = repeatIds.map((id) => commandResults.find((command) => command.commandId === id));
    if (item.repeatCount) {
      const repeatCommandCount = (item.repeatCommandIds ?? item.commandIds).length;
      const complete = repeatCommands.length === repeatCommandCount * item.repeatCount
        && repeatCommands.every((command) => command);
      if (baseFailed || repeatCommands.some((command) => command?.status === 'FAIL')) result = 'FAIL';
      else if (!baseComplete || !complete) result = 'NOT_RUN';
      else if (repeatCommands.every((command) => command.status === 'PASS')) result = 'PASS';
      else result = 'NOT_RUN';
    }
    const refs = evidenceFor(item.commandIds).concat(evidenceFor(repeatIds), result === 'PASS' && item.requiresBrowser ? [browserEvidence.evidenceRef] : []);
    return {
      criterionId: item.criterionId, mandatory: true, result, environmentId: 'local-m3-isolated-postgres',
      expected: item.expected, observed: item.observed, evidenceRefs: refs,
    };
  });

  const traceabilityPath = path.join(root, 'openspec/changes/restart-shpitto-video-saas/traceability.json');
  const traceabilityData = JSON.parse(readFileSync(traceabilityPath, 'utf8'));
  const traceability = Array.isArray(traceabilityData) ? traceabilityData : traceabilityData.requirements ?? [];
  const scenarios = buildScenarios(traceability);
  const buildAndChecksIds = ['typecheck', 'lint', 'format-check', 'openspec', 'frozen-lock-install', 'production-build'];
  const buildAndChecksResult = buildAndChecksIds.some((id) => commandStatus(id) === 'FAIL') ? 'FAIL'
    : buildAndChecksIds.every((id) => commandStatus(id) === 'PASS') ? 'PASS' : 'NOT_RUN';
  const repeatabilityEvidenceIds = [
    'repeat-1-generation-races', 'repeat-2-generation-races', 'repeat-3-generation-races',
    'probe-generation-replay', 'probe-m3-crash-restart', 'probe-credit-reservation', 'probe-command-contract',
  ];
  const repeatabilityResult = repeatabilityEvidenceIds.some((id) => commandStatus(id) === 'FAIL') ? 'FAIL'
    : repeatabilityEvidenceIds.every((id) => commandStatus(id) === 'PASS') ? 'PASS' : 'NOT_RUN';
  const standards = [
    {standard: 'build-and-checks', applicable: true, result: buildAndChecksResult, assertions: 'Frozen-lock install, production build, typecheck, lint, format and strict OpenSpec validation.', evidenceRefs: evidenceFor(buildAndChecksIds)},
    {standard: 'current-digests', applicable: true, result: candidateStable ? 'PASS' : 'FAIL', assertions: 'Declared source/schema/config/contract/validator/lock digests are unchanged across the verification attempt.', evidenceRefs: [`${relative(attemptRoot)}/digest-freshness.json`, ...evidenceFor(['candidate-digests-before', 'candidate-digests-after'])]},
    {standard: 'owned-domain-branch-coverage', applicable: true, result: coverage.status, assertions: `At least 80% aggregate branch coverage across ${ownedModules.length} owned modules, with all sources present in LCOV.`, evidenceRefs: [`${relative(attemptRoot)}/coverage-summary.json`, `${relative(attemptRoot)}/owned-modules.json`]},
    {standard: 'no-cloud-isolated-profile', applicable: true, result: migrationPassed && probeNames.every((name) => probePassed.get(name)) && protocolProbeNames.every((name) => commandStatus(`probe-${name}`) === 'PASS') && httpProbeNames.every((name) => commandStatus(`probe-${name}`) === 'PASS') ? 'PASS' : 'NOT_RUN', assertions: 'Disposable local PostgreSQL, protocol and isolated-candidate HTTP probes pass; no production/provider/payment requests are made.', evidenceRefs: [`${relative(attemptRoot)}/commands.json`, relative(setupLog)]},
    {standard: 'ui-viewport-and-keyboard', applicable: true, result: browserReviewPasses() ? 'PASS' : 'NOT_RUN', assertions: 'Current-candidate UI success/loading/empty/error/denied state review at 1440x900 and 390x844 plus keyboard traversal.', evidenceRefs: browserEvidence?.tiedToCandidate && browserEvidence?.provenanceValid ? [browserEvidence.evidenceRef] : []},
    {standard: 'repeatability-protocol', applicable: true, result: repeatabilityResult, assertions: 'Critical selected generation race probes repeat three times; twentyfold callback replay, conflicting payload/reorder, ten-attempt financial races, and every implemented crash-boundary restart are recorded separately. Remote authenticated webhook inbox evidence remains deferred to M4.', evidenceRefs: evidenceFor(repeatabilityEvidenceIds)},
    {standard: 'independent-review', applicable: true, blocking: false, result: 'DEFERRED_FINAL_REVIEW', assertions: 'Independent review and integration decision are accumulated in the final manual-acceptance queue and do not block downstream automated verification.', evidenceRefs: []},
  ];
  const record = makeRecord({coverage, scenarios, criteriaResults, commonStandards: standards, candidateStatus: candidateStable ? 'PASS' : 'FAIL', environmentStatus: databaseUrl ? migrationPassed ? 'PASS' : 'FAIL' : 'BLOCKED'});
  writeJson(path.join(attemptRoot, 'record.json'), record);
  const protocolSummary = repeatabilityResult === 'PASS'
    ? 'Callback replay, contention and implemented crash-boundary evidence passed; authenticated remote webhook inbox evidence remains deferred to M4.'
    : 'Callback replay, contention and/or full crash-boundary evidence remain unresolved.';
  writeFileSync(path.join(attemptRoot, 'report.md'), `# M3 verification attempt ${attemptId}\n\nStatus: ${record.status}. This record is derived from current command results and explicit missing-evidence checks. It does not grant final manual acceptance. Current source candidate stability: ${candidateStable ? 'PASS' : 'FAIL'}. Owned branch coverage: ${coverage.percent.toFixed(2)}% (${coverage.branchesHit}/${coverage.branchesFound}), threshold 80%. ${coverage.missingSources.length} owned sources missing from LCOV. ${protocolSummary} Independent review and integrator decision are deferred to the final manual-acceptance queue. Production email, real providers, Stripe, and historical-balance recovery remain out of scope.\n`, 'utf8');

  writeJson(path.join(output, 'record.json'), record);
  writeFileSync(path.join(output, 'report.md'), readFileSync(path.join(attemptRoot, 'report.md'), 'utf8'), 'utf8');
  const checker = run('record-integrity', process.platform === 'win32' ? 'python' : 'python3', [
    'internal/restart/check-acceptance-record.py', path.join(output, 'record.json'), '--current',
  ], {timeout: 2 * 60 * 1000});
  if (checker.status !== 'PASS') {
    record.status = 'FAIL';
    record.evidenceSummary.integrityChecker = 'FAIL';
    writeJson(path.join(attemptRoot, 'record.json'), record);
    writeJson(path.join(output, 'record.json'), record);
  } else {
    record.evidenceSummary.integrityChecker = 'PASS';
    writeJson(path.join(attemptRoot, 'record.json'), record);
    writeJson(path.join(output, 'record.json'), record);
  }
  writeFileSync(path.join(output, 'report.md'), readFileSync(path.join(attemptRoot, 'report.md'), 'utf8'), 'utf8');

  const cleanupLog = path.join(logsRoot, 'isolated-database-cleanup.log');
  if (adminClient && isolatedDatabase) {
    try {
      await adminClient.query(`DROP DATABASE "${isolatedDatabase}" WITH (FORCE)`);
      databaseCleanupPassed = true;
      writeFileSync(cleanupLog, `Disposable database removed: ${isolatedDatabase}\n`, 'utf8');
    } catch (error) {
      writeFileSync(cleanupLog, `${sanitize(error instanceof Error ? error.message : error)}\n`, 'utf8');
    } finally {
      await adminClient.end().catch(() => undefined);
      adminClient = null;
    }
  }
  if (!isolatedDatabase) {
    databaseCleanupPassed = true;
    writeFileSync(cleanupLog, 'No temporary database had been created.\n', 'utf8');
  }
  const cleanupResult = {
    commandId: 'isolated-db-cleanup', invocation: 'Drop the disposable database created for this verification attempt.',
    environmentId: 'local-m3-isolated-postgres', startAt: new Date().toISOString(), endAt: new Date().toISOString(),
    exitCode: databaseCleanupPassed ? 0 : 1, signal: null, status: databaseCleanupPassed ? 'PASS' : 'FAIL', outputRef: relative(cleanupLog),
  };
  commandResults.push(cleanupResult);
  writeJson(path.join(attemptRoot, 'commands.json'), commandResults);
  record.commands = commandResults;
  if (!databaseCleanupPassed) record.status = 'FAIL';
  writeJson(path.join(attemptRoot, 'record.json'), record);
  writeJson(path.join(output, 'record.json'), record);
  writeFileSync(path.join(output, 'report.md'), readFileSync(path.join(attemptRoot, 'report.md'), 'utf8'), 'utf8');

  console.log(`M3 candidate status: ${record.status}`);
  console.log(`Verification evidence: ${relative(attemptRoot)}`);
  if (record.status === 'FAIL' || record.status === 'STALE') process.exitCode = 1;
}

try {
  await runVerification();
} catch (error) {
  const logPath = path.join(logsRoot, 'fatal.log');
  writeFileSync(logPath, `${sanitize(error instanceof Error ? error.stack ?? error.message : error)}\n`, 'utf8');
  console.error('M3 verification stopped; see the unique attempt fatal.log. No live application database was used.');
  process.exitCode = 1;
} finally {
  await stopCandidateServices();
  if (isolatedDatabase && adminClient) await adminClient.query(`DROP DATABASE "${isolatedDatabase}" WITH (FORCE)`).catch(() => undefined);
  if (adminClient) await adminClient.end().catch(() => undefined);
  if (scratchRoot && existsSync(scratchRoot)) rmSync(scratchRoot, {recursive: true, force: true});
}
