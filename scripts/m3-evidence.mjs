import {existsSync, readdirSync, statSync} from 'node:fs';
import path from 'node:path';

export const M3_OWNED_SOURCE_ROOTS = [
  'src/modules',
  'src/adapters',
  'src/config/models.ts',
  'src/contracts/http.ts',
  'src/lib/auth.ts',
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
