import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {describe, test} from 'node:test';

import {assertM3OutputWritable, assessBrowserEvidence, assessCoverage, deriveStageStatus, isRetainedM3Artifact, mergeLcov, resolveM3VerificationOptions, summarizeLcov} from '../../scripts/m3-evidence.mjs';

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

describe('M3 verification runner safety', () => {
  const root = process.cwd();
  const attemptId = '2026-10-19T03-04-05-006Z-fresh-attempt';

  test('defaults to a fresh candidate path without selecting historical browser evidence', () => {
    const resolved = resolveM3VerificationOptions({root, args: [], env: {}, attemptId});
    assert.equal(resolved.output, path.join(root, 'internal/evidence/acceptance/M3', `working-tree-${attemptId}`));
    assert.equal(resolved.browserEvidencePath, null);
    assert.notEqual(resolved.output, resolveM3VerificationOptions({root, args: [], env: {}, attemptId: `${attemptId}-next`}).output);
  });

  test('retains positional output compatibility and supports explicit CLI and environment selection', () => {
    const env = {SHPITTO_M3_OUTPUT: 'environment-output', SHPITTO_M3_BROWSER_EVIDENCE: 'evidence/environment.json'};
    assert.deepEqual(resolveM3VerificationOptions({root, args: [], env, attemptId}), {
      output: path.join(root, env.SHPITTO_M3_OUTPUT), browserEvidencePath: path.join(root, env.SHPITTO_M3_BROWSER_EVIDENCE),
    });
    assert.deepEqual(resolveM3VerificationOptions({root, args: ['explicit-output', '--browser-evidence', 'evidence/current.json'], env, attemptId}), {
      output: path.join(root, 'explicit-output'), browserEvidencePath: path.join(root, 'evidence/current.json'),
    });
    assert.deepEqual(resolveM3VerificationOptions({root, args: ['--output=flag-output', '--browser-evidence=evidence/flag.json'], env, attemptId}), {
      output: path.join(root, 'flag-output'), browserEvidencePath: path.join(root, 'evidence/flag.json'),
    });
  });

  test('ambiguous or malformed runner options fail before verification starts', () => {
    for (const args of [['--output'], ['--browser-evidence'], ['--unknown'], ['a', 'b'], ['a', '--output', 'b'], ['--output='], ['--browser-evidence='], [' ']]) {
      assert.throws(() => resolveM3VerificationOptions({root, args, env: {}, attemptId}));
    }
    assert.throws(() => resolveM3VerificationOptions({root, args: ['--browser-evidence', '../outside.json'], env: {}, attemptId}), /inside the repository/);
  });

  test('reviewed, approved, and unreadable records cannot be replaced', () => {
    const output = mkdtempSync(path.join(os.tmpdir(), 'shpitto-m3-record-protection-'));
    try {
      assert.doesNotThrow(() => assertM3OutputWritable(output));
      for (const record of [
        {status: 'PASS'},
        {status: 'FAIL', independentReview: {decision: 'FAIL'}},
        {status: 'IN_PROGRESS', independentReview: {decision: 'NOT_RUN', reviewerId: 'reviewer'}},
        {status: 'IN_PROGRESS', integrationDecision: {decision: 'NOT_RUN', decidedAt: '2026-10-19T03:04:05Z'}},
      ]) {
        writeFileSync(path.join(output, 'record.json'), JSON.stringify(record), 'utf8');
        assert.throws(() => assertM3OutputWritable(output), /fresh output directory/);
      }
      writeFileSync(path.join(output, 'record.json'), '{broken', 'utf8');
      assert.throws(() => assertM3OutputWritable(output), /cannot read/);
      writeFileSync(path.join(output, 'record.json'), JSON.stringify({status: 'IN_PROGRESS', independentReview: {decision: 'NOT_RUN', reviewerId: null}, integrationDecision: {decision: 'NOT_RUN'}}), 'utf8');
      assert.doesNotThrow(() => assertM3OutputWritable(output));
    } finally {
      rmSync(output, {recursive: true, force: true});
    }
  });

  test('malformed review and integration metadata fail closed', () => {
    const output = mkdtempSync(path.join(os.tmpdir(), 'shpitto-m3-malformed-review-'));
    try {
      for (const field of ['independentReview', 'integrationDecision']) {
        for (const value of ['reviewed', [], ['PASS'], false, true, 0]) {
          writeFileSync(path.join(output, 'record.json'), JSON.stringify({status: 'IN_PROGRESS', [field]: value}), 'utf8');
          assert.throws(() => assertM3OutputWritable(output), /fresh output directory/);
        }
      }
    } finally {
      rmSync(output, {recursive: true, force: true});
    }
  });

  test('browser evidence and artifact references cannot escape through a directory junction', () => {
    const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'shpitto-m3-retained-evidence-'));
    const repository = path.join(temporaryRoot, 'repository');
    const outside = path.join(temporaryRoot, 'outside');
    try {
      mkdirSync(repository);
      mkdirSync(outside);
      writeFileSync(path.join(repository, 'retained.json'), '{}', 'utf8');
      writeFileSync(path.join(outside, 'external.json'), '{}', 'utf8');
      symlinkSync(outside, path.join(repository, 'linked-outside'), process.platform === 'win32' ? 'junction' : 'dir');
      assert.throws(() => resolveM3VerificationOptions({root: repository, args: ['--browser-evidence', 'linked-outside/external.json'], env: {}, attemptId}), /inside the repository/);
      assert.equal(isRetainedM3Artifact(repository, 'linked-outside/external.json'), false);
      assert.equal(isRetainedM3Artifact(repository, '../outside/external.json'), false);
      assert.equal(isRetainedM3Artifact(repository, 'missing.json'), false);
      assert.equal(isRetainedM3Artifact(repository, 'retained.json'), true);
      assert.equal(resolveM3VerificationOptions({root: repository, args: ['--browser-evidence', 'retained.json'], env: {}, attemptId}).browserEvidencePath, path.join(repository, 'retained.json'));
    } finally {
      rmSync(temporaryRoot, {recursive: true, force: true});
    }
  });

  test('the CLI protects an approved record before creating any attempt logs', () => {
    const output = mkdtempSync(path.join(os.tmpdir(), 'shpitto-m3-cli-protection-'));
    const record = `${JSON.stringify({status: 'PASS'})}\n`;
    try {
      writeFileSync(path.join(output, 'record.json'), record, 'utf8');
      const result = spawnSync(process.execPath, ['scripts/verify-m3.mjs', output], {cwd: root, encoding: 'utf8', timeout: 10_000});
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /fresh output directory/);
      assert.deepEqual(readdirSync(output), ['record.json']);
      assert.equal(readFileSync(path.join(output, 'record.json'), 'utf8'), record);
    } finally {
      rmSync(output, {recursive: true, force: true});
    }
  });
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
