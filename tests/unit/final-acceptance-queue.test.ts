import assert from 'node:assert/strict';
import {test} from 'node:test';

import {assessAutomatedEvidence, buildFinalAcceptanceQueue} from '../../scripts/final-acceptance-queue.mjs';

const passing = {
  status: 'IN_PROGRESS',
  criterionResults: [{mandatory: true, result: 'PASS'}],
  commonStandardResults: [
    {applicable: true, blocking: true, standard: 'build-and-checks', result: 'PASS'},
    {applicable: true, blocking: false, standard: 'independent-review', result: 'DEFERRED_FINAL_REVIEW'},
  ],
  scenarioResults: [{mandatory: true, result: 'PASS'}],
  commands: [{status: 'PASS', exitCode: 0, outputRef: 'commands.log'}],
  coverage: {status: 'PASS', percent: 84},
  defects: [],
  independentReview: {decision: 'NOT_RUN'},
  integrationDecision: {decision: 'NOT_RUN'},
};

test('manual review is deferred when all automated evidence passes', () => {
  assert.deepEqual(assessAutomatedEvidence(passing), {status: 'READY_FOR_REVIEW', blockingReasons: []});
});

test('automated failures remain blocking', () => {
  assert.deepEqual(assessAutomatedEvidence({...passing, coverage: {status: 'PASS', percent: 79}}), {status: 'IN_PROGRESS', blockingReasons: ['coverage']});
  assert.deepEqual(assessAutomatedEvidence({...passing, status: 'STALE'}), {status: 'IN_PROGRESS', blockingReasons: ['candidate-stale']});
});

test('queue accumulates manual actions without changing automated readiness', () => {
  const queue = buildFinalAcceptanceQueue({
    register: {stages: [{stageId: 'M3', name: 'Persistent local product', evidenceRecordRefs: ['m3/record.json']}]},
    records: new Map([['m3/record.json', passing]]),
    generatedAt: '2026-10-24T00:00:00.000Z',
  });
  assert.equal(queue.entries[0].automatedStatus, 'READY_FOR_REVIEW');
  assert.deepEqual(queue.entries[0].manualActions.map((action) => action.status), ['PENDING', 'PENDING']);
  assert.equal(queue.summary.automatedReady, 1);
  assert.equal(queue.summary.manualReviewPending, 1);
});

test('queue gives humans a complete automated explanation and explicit decision choices', () => {
  const queue = buildFinalAcceptanceQueue({
    register: {stages: [{stageId: 'M5', name: 'Payments and cash recovery', evidenceRecordRefs: ['m5/record.json']}]},
    records: new Map([['m5/record.json', {
      ...passing,
      candidateId: 'm5-candidate',
      candidate: {sourceTreeSha256: 'source-digest'},
      criterionResults: [{criterionId: 'M5-C01', mandatory: true, result: 'PASS', expected: 'One grant', observed: 'One grant', evidenceRefs: ['billing.json']}],
      scenarioResults: [{scenarioId: 'T21', mandatory: true, result: 'PASS', expected: 'Replay is idempotent', observed: 'Same result', evidenceRefs: ['replay.json']}],
      externalInputs: [{input: 'Hosted Stripe lifecycle', availability: 'AVAILABLE', owner: 'billing', nextAction: 'Review evidence'}],
      submission: {reportRef: 'report.md'},
    }]]),
    generatedAt: '2026-10-24T00:00:00.000Z',
  });
  const entry = queue.entries[0];
  assert.equal(entry.automatedExplanation.recommendation, 'HUMAN_DECISION_REQUIRED');
  assert.equal(entry.automatedExplanation.criteria[0].expected, 'One grant');
  assert.equal(entry.automatedExplanation.scenarios[0].observed, 'Same result');
  assert.equal(entry.automatedExplanation.reportRef, 'report.md');
  assert.deepEqual(entry.humanDecisionGuide.decisionOptions.map((option) => option.id), ['PASS', 'FAIL', 'RETURN_FOR_EVIDENCE']);
  assert.equal(entry.humanDecisionGuide.noTestRerunRequired, true);
});
