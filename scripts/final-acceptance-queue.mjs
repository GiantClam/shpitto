import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const FINAL_ACCEPTANCE_QUEUE_REF = 'internal/evidence/final-manual-acceptance-queue.json';
export const FINAL_MANUAL_ACTIONS = [
  {id: 'independent-review', label: 'Independent stage review', owner: 'independent reviewer'},
  {id: 'integration-decision', label: 'Cross-stage integration decision', owner: 'integrator'},
];

const stageIds = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'];
const pass = (entry) => entry?.result === 'PASS';
const requiredPass = (entries, predicate = () => true) => Array.isArray(entries)
  && entries.filter(predicate).every(pass);

export function assessAutomatedEvidence(record) {
  if (record?.status === 'PASS') return {status: 'PASS', blockingReasons: []};
  if (record?.status === 'STALE') return {status: 'IN_PROGRESS', blockingReasons: ['candidate-stale']};
  if (record?.status === 'BLOCKED') return {status: 'IN_PROGRESS', blockingReasons: ['automated-blocker']};
  if (record?.status === 'FAIL') return {status: 'FAIL', blockingReasons: ['automated-failure']};

  const blockingCriteria = requiredPass(record?.criterionResults, (entry) => entry?.mandatory === true);
  const blockingStandards = requiredPass(record?.commonStandardResults, (entry) => entry?.applicable === true && entry?.blocking !== false && entry?.standard !== 'independent-review');
  const blockingScenarios = requiredPass(record?.scenarioResults, (entry) => entry?.mandatory === true);
  const commands = Array.isArray(record?.commands) && record.commands.length > 0
    && record.commands.every((entry) => entry?.status === 'PASS' && entry?.exitCode === 0 && typeof entry.outputRef === 'string' && entry.outputRef.length > 0);
  const coverage = record?.coverage?.status === 'PASS' && Number(record.coverage.percent) >= 80;
  const defects = !Array.isArray(record?.defects) || !record.defects.some((entry) => entry?.status === 'OPEN' && ['P0', 'P1'].includes(entry?.severity));
  const checks = {criteria: blockingCriteria, standards: blockingStandards, scenarios: blockingScenarios, commands, coverage, defects};
  const blockingReasons = Object.entries(checks).filter(([, result]) => !result).map(([id]) => id);
  return {status: blockingReasons.length === 0 ? 'READY_FOR_REVIEW' : 'IN_PROGRESS', blockingReasons};
}

function manualAction(record, action) {
  const field = action.id === 'independent-review' ? record?.independentReview : record?.integrationDecision;
  const complete = action.id === 'independent-review'
    ? field?.decision === 'PASS' && field?.independentFromImplementer === true
    : field?.decision === 'PASS';
  return {...action, status: complete ? 'COMPLETE' : 'PENDING', evidenceRefs: Array.isArray(field?.evidenceRefs) ? field.evidenceRefs : []};
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
        manualActions: FINAL_MANUAL_ACTIONS.map((action) => manualAction(record, action)),
        externalInputs: (Array.isArray(record.externalInputs) ? record.externalInputs : []).map((input) => ({
          input: input.input,
          availability: input.availability,
          owner: input.owner,
          nextAction: input.nextAction,
        })),
      });
    }
  }
  return {
    schemaVersion: '1.0',
    queueKind: 'FINAL_MANUAL_ACCEPTANCE_QUEUE',
    generatedAt,
    checkpointId: 'M8-STABLE',
    policy: 'Automated evidence may advance as READY_FOR_REVIEW. Independent review and integration decisions are accumulated here and are the only manual stage-acceptance actions required before final PASS.',
    entries,
    summary: {
      totalRecords: entries.length,
      automatedReady: entries.filter((entry) => ['READY_FOR_REVIEW', 'PASS'].includes(entry.automatedStatus)).length,
      automatedPending: entries.filter((entry) => entry.automatedStatus === 'IN_PROGRESS').length,
      manualReviewPending: entries.filter((entry) => entry.manualActions.some((action) => action.status === 'PENDING')).length,
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
