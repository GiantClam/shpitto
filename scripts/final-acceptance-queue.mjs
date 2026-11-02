import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const FINAL_ACCEPTANCE_QUEUE_REF = 'internal/evidence/final-manual-acceptance-queue.json';
export const FINAL_MANUAL_DECISION = {
  id: 'm8-final-manual-acceptance',
  label: 'M8-STABLE manual acceptance',
  owner: 'product owner',
  checkpointId: 'M8-STABLE',
};
export const HUMAN_DECISION_OPTIONS = [
  {id: 'PASS', label: 'Pass', meaning: 'Accept the automated evidence for this exact candidate and scope.'},
  {id: 'FAIL', label: 'Fail', meaning: 'Reject the candidate because the evidence or observed behavior is unacceptable.'},
  {id: 'RETURN_FOR_EVIDENCE', label: 'Return for evidence', meaning: 'Request a targeted evidence correction or rerun without accepting the stage.'},
];

const stageIds = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'];
const pass = (entry) => entry?.result === 'PASS';
const requiredPass = (entries, predicate = () => true) => Array.isArray(entries)
  && entries.filter(predicate).every(pass);

function automatedChecks(record) {
  const criteria = requiredPass(record?.criterionResults, (entry) => entry?.mandatory === true);
  const standards = requiredPass(record?.commonStandardResults, (entry) => entry?.applicable === true && entry?.blocking !== false && entry?.standard !== 'independent-review');
  const scenarios = requiredPass(record?.scenarioResults, (entry) => entry?.mandatory === true);
  const commands = Array.isArray(record?.commands) && record.commands.length > 0
    && record.commands.every((entry) => entry?.status === 'PASS' && entry?.exitCode === 0 && typeof entry.outputRef === 'string' && entry.outputRef.length > 0);
  const coverage = record?.coverage?.status === 'PASS' && Number(record.coverage.percent) >= 80;
  const defects = !Array.isArray(record?.defects) || !record.defects.some((entry) => entry?.status === 'OPEN' && ['P0', 'P1'].includes(entry?.severity));
  return {criteria, standards, scenarios, commands, coverage, defects};
}

export function assessAutomatedEvidence(record) {
  if (record?.status === 'PASS') return {status: 'PASS', blockingReasons: []};
  if (record?.status === 'STALE') return {status: 'IN_PROGRESS', blockingReasons: ['candidate-stale']};
  if (record?.status === 'BLOCKED') return {status: 'IN_PROGRESS', blockingReasons: ['automated-blocker']};
  if (record?.status === 'FAIL') return {status: 'FAIL', blockingReasons: ['automated-failure']};

  const checks = automatedChecks(record);
  const blockingReasons = Object.entries(checks).filter(([, result]) => !result).map(([id]) => id);
  return {status: blockingReasons.length === 0 ? 'READY_FOR_REVIEW' : 'IN_PROGRESS', blockingReasons};
}

function firstValue(entry, keys) {
  for (const key of keys) if (entry?.[key] !== undefined && entry?.[key] !== null) return entry[key];
  return null;
}

function explainEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((entry) => ({
    id: firstValue(entry, ['criterionId', 'standard', 'scenarioId', 'scenario', 'taskId', 'id']),
    taskIds: Array.isArray(entry?.taskIds) ? entry.taskIds : [],
    profile: entry?.profile ?? null,
    environmentId: entry?.environmentId ?? null,
    mandatory: entry?.mandatory ?? null,
    applicable: entry?.applicable ?? null,
    result: entry?.result ?? entry?.status ?? null,
    expected: entry?.expected ?? null,
    observed: entry?.observed ?? null,
    assertions: entry?.assertions ?? null,
    commandRef: entry?.commandRef ?? null,
    iteration: entry?.iteration ?? null,
    seed: entry?.seed ?? null,
    evidenceRefs: Array.isArray(entry?.evidenceRefs) ? entry.evidenceRefs : [],
  }));
}

export function buildAutomatedExplanation(record, automated) {
  const checks = automatedChecks(record);
  return {
    conclusion: automated.status,
    recommendation: ['READY_FOR_REVIEW', 'PASS'].includes(automated.status) ? 'M8_MANUAL_DECISION_REQUIRED' : 'AUTOMATED_WORK_REQUIRED',
    blockingReasons: automated.blockingReasons,
    checks: Object.entries(checks).map(([id, passed]) => ({
      id,
      result: passed ? 'PASS' : 'BLOCKED',
      explanation: passed ? 'The automated evidence for this category passed.' : 'The automated evidence for this category is incomplete or failed; do not accept the stage.',
    })),
    candidate: record?.candidate ?? null,
    environments: Array.isArray(record?.environments) ? record.environments : [],
    criteria: explainEntries(record?.criterionResults),
    commonStandards: explainEntries(record?.commonStandardResults),
    scenarios: explainEntries(record?.scenarioResults),
    commands: Array.isArray(record?.commands) ? record.commands.map((entry) => ({
      commandId: entry?.commandId ?? null,
      invocation: entry?.invocation ?? entry?.sanitizedInvocation ?? null,
      environmentId: entry?.environmentId ?? null,
      status: entry?.status ?? null,
      exitCode: entry?.exitCode ?? null,
      startedAt: entry?.startedAt ?? null,
      finishedAt: entry?.finishedAt ?? null,
      outputRef: entry?.outputRef ?? null,
    })) : [],
    coverage: record?.coverage ?? null,
    defects: Array.isArray(record?.defects) ? record.defects : [],
    externalInputs: Array.isArray(record?.externalInputs) ? record.externalInputs.map((input) => ({
      input: input.input,
      availability: input.availability,
      owner: input.owner,
      affectedTasks: input.affectedTasks ?? input.affectedTaskIds ?? [],
      nextAction: input.nextAction,
      authorityRef: input.authorityRef ?? null,
    })) : [],
    reportRef: record?.submission?.reportRef ?? null,
  };
}

export function buildFinalAcceptanceQueue({register, records, generatedAt = new Date().toISOString()}) {
  const entries = [];
  for (const stage of register.stages ?? []) {
    for (const recordRef of stage.evidenceRecordRefs ?? []) {
      if (!recordRef.endsWith('/record.json') || !records.has(recordRef)) continue;
      const record = records.get(recordRef);
      const automated = assessAutomatedEvidence(record);
      entries.push({
        stageId: stage.stageId,
        stageName: stage.name,
        recordRef,
        candidateId: record.candidateId ?? stage.candidateId,
        recordStatus: record.status,
        automatedStatus: automated.status,
        blockingReasons: automated.blockingReasons,
        automatedExplanation: buildAutomatedExplanation(record, automated),
        humanDecisionGuide: {
          decisionOptions: HUMAN_DECISION_OPTIONS,
          noTestRerunRequired: true,
          instruction: 'Review this automated explanation as part of the accumulated package. Do not record a stage decision here; the product owner records one PASS, FAIL or RETURN_FOR_EVIDENCE decision at M8-STABLE after the package is complete.',
        },
        externalInputs: (Array.isArray(record.externalInputs) ? record.externalInputs : []).map((input) => ({
          input: input.input,
          availability: input.availability,
          owner: input.owner,
          nextAction: input.nextAction,
        })),
      });
    }
  }
  const automatedReady = entries.filter((entry) => ['READY_FOR_REVIEW', 'PASS'].includes(entry.automatedStatus));
  const allEvidenceReady = entries.length > 0 && automatedReady.length === entries.length;
  const manualDecision = {
    ...FINAL_MANUAL_DECISION,
    status: allEvidenceReady ? 'PENDING' : 'WAITING_FOR_EVIDENCE',
    decisionOptions: HUMAN_DECISION_OPTIONS,
    noTestRerunRequired: true,
    evidenceRecordRefs: entries.map((entry) => entry.recordRef),
    instruction: 'Review the accumulated automated explanation package once at M8-STABLE, then record PASS, FAIL or RETURN_FOR_EVIDENCE. Do not repeat the test run as a substitute for reviewing the evidence.',
  };
  return {
    schemaVersion: '1.0',
    queueKind: 'FINAL_MANUAL_ACCEPTANCE_QUEUE',
    generatedAt,
    checkpointId: 'M8-STABLE',
    policy: 'Automated evidence produces a complete explanation package and may advance as READY_FOR_REVIEW. The package accumulates until one product-owner decision at M8-STABLE; the decision is the only manual stage-acceptance action and may be PASS, FAIL or RETURN_FOR_EVIDENCE. No intermediate stage or checkpoint PASS is recorded.',
    entries,
    manualDecision,
    summary: {
      totalRecords: entries.length,
      automatedReady: automatedReady.length,
      automatedPending: entries.filter((entry) => entry.automatedStatus === 'IN_PROGRESS').length,
      manualReviewPending: manualDecision.status === 'PENDING' ? 1 : 0,
      externalInputsPending: entries.filter((entry) => entry.externalInputs.some((input) => !['AVAILABLE', 'PASS', 'COMPLETE'].includes(input.availability))).length,
    },
  };
}

function readJson(root, reference) {
  const file = path.join(root, reference);
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadQueueInputs(root) {
  const register = readJson(root, 'openspec/changes/restart-shpitto-video-saas/acceptance-status.json');
  const records = new Map();
  for (const stage of register.stages ?? []) {
    for (const reference of stage.evidenceRecordRefs ?? []) {
      if (reference.endsWith('/record.json') && existsSync(path.join(root, reference))) records.set(reference, readJson(root, reference));
    }
  }
  return {register, records};
}

function run() {
  const root = process.cwd();
  const queue = buildFinalAcceptanceQueue({...loadQueueInputs(root)});
  const output = path.join(root, FINAL_ACCEPTANCE_QUEUE_REF);
  const checkOnly = process.argv.includes('--check');
  if (checkOnly) {
    if (!existsSync(output)) throw new Error(`Missing generated queue: ${FINAL_ACCEPTANCE_QUEUE_REF}`);
    const existing = JSON.parse(readFileSync(output, 'utf8'));
    const comparable = (value) => JSON.stringify({...value, generatedAt: null});
    if (comparable(existing) !== comparable(queue)) throw new Error(`Stale generated queue: ${FINAL_ACCEPTANCE_QUEUE_REF}`);
  } else {
    writeFileSync(output, `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({status: 'PASS', queueRef: FINAL_ACCEPTANCE_QUEUE_REF, ...queue.summary}, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) run();
