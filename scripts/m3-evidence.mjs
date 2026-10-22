import {existsSync, readFileSync, readdirSync, realpathSync, statSync} from 'node:fs';
import path from 'node:path';

function containedBy(root, file) {
  const relativePath = path.relative(root, file);
  return relativePath !== '..' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

export function isRetainedM3Artifact(root, reference) {
  try {
    const absolute = path.resolve(root, reference);
    return containedBy(root, absolute)
      && containedBy(realpathSync(root), realpathSync(absolute))
      && statSync(absolute).isFile();
  } catch {
    return false;
  }
}

export function resolveM3VerificationOptions({root, args, env, attemptId}) {
  let outputArgument;
  let browserArgument;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const option = argument.split('=', 1)[0];
    if (['--output', '--browser-evidence'].includes(option)) {
      const value = argument.includes('=') ? argument.slice(option.length + 1) : args[++index];
      if (!value?.trim() || value.startsWith('--')) throw new Error(`${option} requires a path.`);
      if (option === '--output') {
        if (outputArgument !== undefined) throw new Error('Specify the M3 output directory only once.');
        outputArgument = value;
      } else {
        if (browserArgument !== undefined) throw new Error('Specify the M3 browser evidence only once.');
        browserArgument = value;
      }
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown M3 verification option: ${argument}`);
    } else {
      if (outputArgument !== undefined) throw new Error('Specify the M3 output directory only once.');
      if (!argument.trim()) throw new Error('The M3 output directory requires a path.');
      outputArgument = argument;
    }
  }
  const output = path.resolve(root, outputArgument ?? (env.SHPITTO_M3_OUTPUT?.trim() || `internal/evidence/acceptance/M3/working-tree-${attemptId}`));
  const browserSelection = browserArgument ?? env.SHPITTO_M3_BROWSER_EVIDENCE?.trim();
  const browserEvidencePath = browserSelection ? path.resolve(root, browserSelection) : null;
  if (browserEvidencePath) {
    if (!containedBy(root, browserEvidencePath) || (existsSync(browserEvidencePath) && !isRetainedM3Artifact(root, browserEvidencePath))) {
      throw new Error('M3 browser evidence must be retained inside the repository.');
    }
  }
  return {output, browserEvidencePath};
}

export function assertM3OutputWritable(output) {
  const recordPath = path.join(output, 'record.json');
  if (!existsSync(recordPath)) return;
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, 'utf8'));
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid record.');
  } catch {
    throw new Error(`M3 verification cannot read the existing record at ${recordPath}; select a fresh output directory.`);
  }
  const reviewed = (decision, actorField, dateField) => decision != null && (
    typeof decision !== 'object' || Array.isArray(decision)
    || (decision.decision != null && decision.decision !== 'NOT_RUN')
    || decision[actorField] != null
    || decision[dateField] != null
  );
  if (record.status === 'PASS'
    || reviewed(record.independentReview, 'reviewerId', 'reviewedAt')
    || reviewed(record.integrationDecision, 'integratorId', 'decidedAt')) {
    throw new Error(`M3 verification will not replace a reviewed or approved record at ${recordPath}; select a fresh output directory.`);
  }
}

// M3 owns the local workspace/generation vertical slice. Later milestone
// adapters and billing/affiliate/operator modules are verified by their own
// gates and must not become accidental M3 coverage obligations.
export const M3_OWNED_SOURCE_ROOTS = [
  'src/adapters/mail',
  'src/adapters/storage/local.ts',
  'src/config/models.ts',
  'src/contracts/http.ts',
  'src/lib/auth.ts',
  'src/modules/assets',
  'src/modules/billing/hold-policy.ts',
  'src/modules/credits/allocate.ts',
  'src/modules/credits/expiry.ts',
  'src/modules/credits/issue-demo.ts',
  'src/modules/credits/ledger.ts',
  'src/modules/credits/queries.ts',
  'src/modules/credits/reserve.ts',
  'src/modules/credits/settle.ts',
  'src/modules/generation/create.ts',
  'src/modules/generation/lifecycle.ts',
  'src/modules/generation/mock.ts',
  'src/modules/generation/outbox.ts',
  'src/modules/generation/state.ts',
  'src/modules/generation/sweep-recovery.ts',
  'src/modules/operations/authorize.ts',
  'src/modules/operations/status-commands.ts',
  'src/modules/shared/commands.ts',
  'src/modules/shared/transaction.ts',
  'src/modules/workspaces/access-state.ts',
  'src/modules/workspaces/authorize.ts',
  'src/modules/workspaces/commands.ts',
  'src/modules/workspaces/invitations.ts',
  'src/modules/workspaces/onboard.ts',
  'src/modules/workspaces/policy.ts',
];

export function assessBrowserEvidence(evidence, artifactExists) {
  const requiredJourneys = ['fresh-user-generation', 'team-creation', 'invitation-creation', 'member-invitation', 'invitation-replay-expiry', 'owner-controls', 'workspace-switching', 'personal-space-denial', 'revoked-open-tab', 'private-download', 'application-worker-restart'];
  const requiredUi = ['success', 'loading', 'empty', 'error', 'denied', 'desktop', 'mobile', 'keyboard'];
  const complete = (entry) => entry?.result === 'PASS'
    && Array.isArray(entry.observed) && entry.observed.length > 0
    && entry.observed.every((text) => typeof text === 'string' && text.trim().length > 0)
    && Array.isArray(entry.evidenceRefs) && entry.evidenceRefs.length > 0
    && entry.evidenceRefs.every((ref) => typeof ref === 'string' && artifactExists(ref));
  const journeys = Array.isArray(evidence?.journeys) ? evidence.journeys : [];
  const ui = Array.isArray(evidence?.uiReview?.checks) ? evidence.uiReview.checks : [];
  const uniquelyComplete = (entries, id) => {
    const matches = entries.filter((entry) => entry?.id === id);
    return matches.length === 1 && complete(matches[0]);
  };
  const missing = [
    ...requiredJourneys.filter((id) => !uniquelyComplete(journeys, id)),
    ...requiredUi.filter((id) => !uniquelyComplete(ui, id)).map((id) => `ui:${id}`),
  ];
  if (!journeys.every(complete)) missing.push('journeys:checks');
  if (!ui.every(complete)) missing.push('ui:checks');
  if (evidence?.uiReview?.desktopViewport !== '1440x900' || evidence?.uiReview?.mobileViewport !== '390x844') missing.push('ui:viewports');
  if (evidence?.uiReview?.result !== 'PASS') missing.push('ui:review');
  return {passed: missing.length === 0, missing};
}

export function collectOwnedModules(root, sourceRoots = M3_OWNED_SOURCE_ROOTS) {
  const visit = (relativePath) => {
    const absolute = path.join(root, relativePath);
    if (!existsSync(absolute)) return [];
    if (statSync(absolute).isDirectory()) {
      return readdirSync(absolute, {withFileTypes: true}).flatMap((entry) =>
        entry.isDirectory() ? visit(path.join(relativePath, entry.name)) : entry.name.endsWith('.ts') ? [path.join(relativePath, entry.name).replaceAll('\\', '/')] : [],
      );
    }
    return relativePath.endsWith('.ts') ? [relativePath.replaceAll('\\', '/')] : [];
  };
  return [...new Set(sourceRoots.flatMap(visit))].filter((file) => !file.endsWith('/contracts.ts')).sort();
}

export function summarizeLcov(source, root) {
  const files = [];
  let current = null;
  let branchOrdinals = new Map();
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      const sourcePath = line.slice(3);
      const absolute = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(root, sourcePath);
      current = {path: path.relative(root, absolute).replaceAll('\\', '/'), branchesFound: 0, branchesHit: 0, branches: new Map()};
      branchOrdinals = new Map();
      files.push(current);
    } else if (current && line.startsWith('BRF:')) {
      current.branchesFound = Number(line.slice(4));
    } else if (current && line.startsWith('BRH:')) {
      current.branchesHit = Number(line.slice(4));
    } else if (current && line.startsWith('BRDA:')) {
      const [lineNumber, block, branch, taken] = line.slice(5).split(',');
      // Node's LCOV branch block IDs are assigned from the loaded module graph,
      // so separate probes can renumber blocks after unrelated branches are
      // omitted. Keep the source line and branch kind, then assign an ordinal
      // in source order to make reports from different probes mergeable.
      const ordinalKey = `${lineNumber},${branch}`;
      const ordinal = branchOrdinals.get(ordinalKey) ?? 0;
      branchOrdinals.set(ordinalKey, ordinal + 1);
      const key = `${lineNumber},${branch},${ordinal}`;
      const previous = current.branches.get(key) ?? false;
      current.branches.set(key, previous || (taken !== '-' && Number(taken) > 0));
    }
  }
  const missing = [];
  for (const file of files) {
    if (!Number.isInteger(file.branchesFound) || !Number.isInteger(file.branchesHit) || file.branchesHit > file.branchesFound) {
      missing.push(file.path);
    }
    if (file.branches.size > 0) {
      file.branchesFound = file.branches.size;
      file.branchesHit = [...file.branches.values()].filter(Boolean).length;
    }
  }
  const branchesFound = files.reduce((total, file) => total + file.branchesFound, 0);
  const branchesHit = files.reduce((total, file) => total + file.branchesHit, 0);
  return {files: files.map((file) => ({...file, branches: [...file.branches]})), missing, branchesFound, branchesHit, percent: branchesFound ? branchesHit / branchesFound * 100 : 0};
}

export function mergeLcov(sources, root) {
  const branches = new Map();
  const malformed = new Set();
  for (const source of sources) {
    const summary = summarizeLcov(source, root);
    for (const file of summary.files) {
      const current = branches.get(file.path) ?? new Map();
      for (const [key, hit] of file.branches) current.set(key, (current.get(key) ?? false) || hit);
      branches.set(file.path, current);
      if (summary.missing.includes(file.path)) malformed.add(file.path);
    }
  }
  const reports = [...branches].map(([sourcePath, values]) => ({
    path: sourcePath,
    branchesFound: values.size,
    branchesHit: [...values.values()].filter(Boolean).length,
  }));
  return {reports, malformed: [...malformed]};
}

export function assessCoverage({ownedModules, reports, malformed = [], suitePassed, minimumPercent = 80}) {
  const reported = new Set(reports.map((report) => report.path));
  const missingSources = ownedModules.filter((file) => !reported.has(file));
  const totals = reports.reduce((result, report) => ({
    branchesFound: result.branchesFound + report.branchesFound,
    branchesHit: result.branchesHit + report.branchesHit,
  }), {branchesFound: 0, branchesHit: 0});
  const percent = totals.branchesFound ? totals.branchesHit / totals.branchesFound * 100 : 0;
  const passed = suitePassed && missingSources.length === 0 && malformed.length === 0 && totals.branchesFound > 0 && percent >= minimumPercent;
  return {status: passed ? 'PASS' : 'FAIL', ...totals, percent, missingSources, malformed};
}

export function deriveStageStatus({candidateStable, criteria, standards, scenarios, submissionReady}) {
  if (!candidateStable) return 'STALE';
  const required = [...criteria, ...standards.filter((entry) => entry.applicable), ...scenarios.filter((entry) => entry.mandatory)];
  if (required.some((entry) => entry.result === 'FAIL')) return 'FAIL';
  if (required.some((entry) => entry.result !== 'PASS')) return 'IN_PROGRESS';
  return submissionReady ? 'READY_FOR_REVIEW' : 'IN_PROGRESS';
}

export function resultFromCommands(commandIds, commands, evidenceRefs) {
  const statuses = commandIds.map((id) => commands.find((command) => command.commandId === id)?.status);
  const result = statuses.some((status) => status === 'FAIL') ? 'FAIL'
    : statuses.length > 0 && statuses.every((status) => status === 'PASS') ? 'PASS'
      : 'NOT_RUN';
  return {result, evidenceRefs: result === 'NOT_RUN' ? [] : evidenceRefs};
}
