import assert from 'node:assert/strict';
import {describe, test} from 'node:test';

import {assessBrowserEvidence, assessCoverage, deriveStageStatus, mergeLcov, summarizeLcov} from '../../scripts/m3-evidence.mjs';

const browserFixture = () => ({
  journeys: ['fresh-user-generation', 'team-creation', 'invitation-creation', 'member-invitation', 'invitation-replay-expiry', 'owner-controls', 'workspace-switching', 'personal-space-denial', 'revoked-open-tab', 'private-download', 'application-worker-restart'].map((id) => ({
    id, result: 'PASS', observed: ['Observed assertion'], evidenceRefs: [`evidence/${id}.png`],
  })),
  uiReview: {
    result: 'PASS', desktopViewport: '1440x900', mobileViewport: '390x844',
    checks: ['success', 'loading', 'empty', 'error', 'denied', 'desktop', 'mobile', 'keyboard'].map((id) => ({
      id, result: 'PASS', observed: ['Observed assertion'], evidenceRefs: [`evidence/${id}.png`],
    })),
  },
});

describe('M3 evidence integrity', () => {
  test('browser PASS labels alone cannot stand in for required journeys and UI states', () => {
    assert.equal(assessBrowserEvidence({journeys: [], uiReview: {result: 'PASS'}}, () => true).passed, false);
    const incomplete = browserFixture();
    incomplete.journeys = incomplete.journeys.filter((entry) => entry.id !== 'revoked-open-tab');
    assert.ok(assessBrowserEvidence(incomplete, () => true).missing.includes('revoked-open-tab'));
    incomplete.uiReview.checks = incomplete.uiReview.checks.filter((entry) => entry.id !== 'loading');
    assert.ok(assessBrowserEvidence(incomplete, () => true).missing.includes('ui:loading'));
  });

  test('browser checks require retained artifacts and observed assertions', () => {
    const evidence = browserFixture();
    assert.equal(assessBrowserEvidence(evidence, () => true).passed, true);
    assert.equal(assessBrowserEvidence(evidence, () => false).passed, false);
    evidence.journeys[0].observed = [];
    assert.equal(assessBrowserEvidence(evidence, () => true).passed, false);
  });

  test('contradictory or duplicate browser results cannot be hidden by one passing row', () => {
    for (const result of ['PASS', 'FAIL', 'NOT_RUN']) {
      const evidence = browserFixture();
      evidence.uiReview.checks.push({...evidence.uiReview.checks[1], result});
      assert.ok(assessBrowserEvidence(evidence, () => true).missing.includes('ui:loading'));
      const journeyEvidence = browserFixture();
      journeyEvidence.journeys.push({...journeyEvidence.journeys[0], result});
      assert.ok(assessBrowserEvidence(journeyEvidence, () => true).missing.includes('fresh-user-generation'));
    }
  });

  test('an additional failed or incomplete browser check prevents approval', () => {
    const evidence = browserFixture();
    evidence.uiReview.checks.push({id: 'extra-error-state', result: 'FAIL', observed: ['Unexpected error'], evidenceRefs: ['evidence/error.png']});
    assert.equal(assessBrowserEvidence(evidence, () => true).passed, false);
    const journeyEvidence = browserFixture();
    journeyEvidence.journeys.push({id: 'extra-journey', result: 'PASS', observed: [], evidenceRefs: []});
    assert.equal(assessBrowserEvidence(journeyEvidence, () => true).passed, false);
  });

  test('LCOV branch totals remain branch-based and normalize Windows absolute paths', () => {
    const root = 'D:/repo';
    const summary = summarizeLcov('SF:D:\\repo\\src\\modules\\generation\\state.ts\nBRF:4\nBRH:3\nend_of_record\n', root);
    assert.deepEqual(summary.files, [{path: 'src/modules/generation/state.ts', branchesFound: 4, branchesHit: 3, branches: []}]);
    assert.equal(summary.percent, 75);
    assert.deepEqual(summary.missing, []);
  });

  test('separate verification runs union stable branch IDs without counting repeats twice', () => {
    const first = 'SF:src/modules/generation/state.ts\nBRDA:4,0,0,1\nBRDA:4,0,1,0\nend_of_record\n';
    const second = 'SF:src/modules/generation/state.ts\nBRDA:4,0,0,2\nBRDA:4,0,1,1\nend_of_record\n';
    const merged = mergeLcov([first, second], 'D:/repo');
    assert.deepEqual(merged.reports, [{path: 'src/modules/generation/state.ts', branchesFound: 2, branchesHit: 2}]);
  });

  test('a missing owned source or malformed branch report fails coverage', () => {
    const report = {path: 'src/modules/generation/state.ts', branchesFound: 10, branchesHit: 10};
    assert.equal(assessCoverage({ownedModules: [report.path, 'src/modules/credits/ledger.ts'], reports: [report], suitePassed: true}).status, 'FAIL');
    assert.equal(assessCoverage({ownedModules: [report.path], reports: [report], malformed: [report.path], suitePassed: true}).status, 'FAIL');
  });

  test('zero-branch and failed suites cannot claim coverage', () => {
    const report = {path: 'src/modules/generation/state.ts', branchesFound: 0, branchesHit: 0};
    assert.equal(assessCoverage({ownedModules: [report.path], reports: [report], suitePassed: true}).status, 'FAIL');
    assert.equal(assessCoverage({ownedModules: [report.path], reports: [{...report, branchesFound: 10, branchesHit: 10}], suitePassed: false}).status, 'FAIL');
  });

  test('missing mandatory evidence stays in progress; a recorded failure fails the stage', () => {
    const base = {candidateStable: true, standards: [], scenarios: [], submissionReady: true};
    const inProgress = deriveStageStatus({...base, criteria: [{result: 'PASS'}, {result: 'NOT_RUN'}]});
    const failed = deriveStageStatus({...base, criteria: [{result: 'PASS'}, {result: 'FAIL'}]});
    assert.equal(inProgress, 'IN_PROGRESS');
    assert.equal(failed, 'FAIL');
  });

  test('changed candidate bytes make any result stale, never ready for review', () => {
    assert.equal(deriveStageStatus({candidateStable: false, criteria: [], standards: [], scenarios: [], submissionReady: true}), 'STALE');
  });
});
