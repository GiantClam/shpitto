import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const packet = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const record = read(path.join(packet, 'automated/record.json'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const integrity = [];
for (const [stageId, recordRef] of [
  ['M3', 'internal/evidence/acceptance/M3/working-tree-20261001-current/record.json'],
  ['M4', 'internal/evidence/acceptance/M4/m4-self-hosted-20261017/record.json'],
]) {
  const historicalBefore = sha(readFileSync(recordRef));
  for (const current of [false, true]) {
    const result = spawnSync('python', ['internal/restart/check-acceptance-record.py', recordRef, ...(current ? ['--current'] : [])],
      {cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 1024 * 1024});
    const name = `${stageId.toLowerCase()}-historical-${current ? 'current-rejection' : 'record-integrity'}.log`;
    writeFileSync(path.join(packet, name), `${result.stdout ?? ''}${result.stderr ?? ''}`, 'utf8');
    integrity.push({stageId, recordRef, currentByteCheck: current, exitCode: result.status,
      expectation: current ? 'STALE_CURRENT_BYTES_REJECTED' : 'HISTORICAL_RECORD_REMAINS_VALID',
      expectationMet: current ? result.status !== 0 : result.status === 0, logRef: `internal/evidence/M3/continuation-20261019/${name}`});
  }
  assert.equal(sha(readFileSync(recordRef)), historicalBefore, 'Historical record was modified.');
}
const result = {createdAt: new Date().toISOString(), diagnosticGeneration: 'r1',
  recordRef: 'internal/evidence/M3/continuation-20261019/automated/record.json',
  recordStatus: record.status, candidateAtEnd: record.candidate,
  commands: {count: record.commands.length, statuses: Object.fromEntries([...new Set(record.commands.map((row) => row.status))]
    .map((status) => [status, record.commands.filter((row) => row.status === status).length]))},
  coverage: record.coverage, criteria: record.criterionResults,
  commonStandards: record.commonStandardResults, unresolved: record.evidenceSummary.unresolved,
  independentReview: record.independentReview, integrationDecision: record.integrationDecision,
  historicalIntegrity: integrity,
  browserLaunched: false,
  interpretation: 'All executed local commands are diagnostic results for r1. Concurrent validator edits invalidated r1 freshness; no gate or r2 acceptance is claimed. The separately prepared browser runtime has not been executed.'};
writeFileSync(path.join(packet, 'r1-diagnostics.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({status: record.status, commandCount: result.commands.count, commandStatuses: result.commands.statuses,
  coverage: record.coverage.percent, currentDigestsStable: record.candidate.stableAcrossVerification,
  historicalIntegrity: integrity.map(({stageId, currentByteCheck, exitCode, expectationMet}) => ({stageId, currentByteCheck, exitCode, expectationMet}))}));
