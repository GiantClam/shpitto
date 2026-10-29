import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {recordSourceOrder, canReceiveRelease, canAccessRelease} from '../vendor/sales/commerce.mjs';

export function verifyLocalFulfillment(root, candidateId) {
  assert.match(candidateId, /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, 'Candidate ID must be a single safe path segment.');
  const candidateRoot = path.join(root, 'internal', 'evidence', 'm8', 'artifact-manifest', candidateId);
  const manifest = JSON.parse(readFileSync(path.join(candidateRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.candidateId, candidateId, 'Manifest candidate identity must match.');
  const zipPath = path.resolve(root, manifest.zip.path);
  assert.equal(path.dirname(zipPath), candidateRoot, 'Candidate archive must stay inside its manifest directory.');
  const archive = readFileSync(zipPath);
  const digest = createHash('sha256').update(archive).digest('hex');
  assert.equal(digest, manifest.zip.sha256, 'Candidate archive SHA-256 mismatch.');
  assert.equal(archive.length, manifest.zip.bytes, 'Candidate archive byte length mismatch.');
  const deliveryRoot = mkdtempSync(path.join(os.tmpdir(), 'shpitto-vendor-delivery-'));
  try {
    const customerArchive = path.join(deliveryRoot, `${candidateId}.zip`);
    copyFileSync(zipPath, customerArchive);
    assert.equal(createHash('sha256').update(readFileSync(customerArchive)).digest('hex'), digest, 'Per-customer archive copy must retain the exact checksum.');
  } finally { rmSync(deliveryRoot, {recursive: true, force: true}); }

  const config = JSON.parse(readFileSync(path.join(root, 'vendor', 'sales', 'commerce.config.json'), 'utf8'));
  assert.equal(config.mode, 'mock', 'Local rehearsal must never record a real entitlement.');
  const order = {id: `local-order-${candidateId}`, buyerId: 'local-buyer-fixture', githubIdentity: 'local-github-fixture', provider: 'lemon-squeezy', mode: 'mock', status: 'paid', merchantId: config.merchantId, purchasedAt: '2026-10-07T00:00:00.000Z'};
  const release = {version: candidateId, artifactSha256: digest};
  const first = recordSourceOrder([], order, release, config);
  assert.deepEqual(recordSourceOrder(first, order, release, config), first, 'Duplicate source orders must not add rights.');
  assert.throws(() => recordSourceOrder(first, {...order, buyerId: 'different-buyer'}, release, config), /conflict/);
  assert.throws(() => recordSourceOrder([], {...order, provider: 'stripe'}, release, config), /isolated/);
  assert.equal(canReceiveRelease(first[0], '2027-10-06T23:59:59.999Z'), true);
  assert.equal(canReceiveRelease(first[0], first[0].updateSupportEndsAt), false);
  assert.equal(canAccessRelease(first[0], release), true, 'Expiry cannot revoke acquired code.');
  const renewal = recordSourceOrder(first, {...order, id: 'local-renewal-fixture', purchasedAt: '2028-01-01T00:00:00.000Z'}, {...release, version: 'fixture-later-version'}, config);
  assert.equal(canReceiveRelease(renewal[0], '2028-01-01T00:00:00.000Z'), true);
  assert.equal(canReceiveRelease(renewal[0], '2027-12-01T00:00:00.000Z'), false, 'Renewal cannot rewrite an expired gap.');
  assert.equal(canAccessRelease(renewal[0], release), true);
  assert.equal(first[0].orders.length, 1, 'Renewal must preserve its original input record.');
  return {
    status: 'PASS', profile: 'local-fulfillment-fixture', candidateId,
    checks: {orderIdentity: 'PASS', artifactDigest: 'PASS', artifactBytes: 'PASS', duplicateReplay: 'PASS', conflictRejection: 'PASS', paymentIsolation: 'PASS', expiryTransition: 'PASS', acquiredVersionRetention: 'PASS', renewalVersion: 'PASS', renewalGapPreserved: 'PASS', customerCopy: 'PASS'},
    entitlement: {orderId: 'redacted-local-order', buyerId: 'redacted-local-buyer', candidateId, artifactSha256: digest, versions: [1, 2], acquiredSourceRetained: true},
    vendorAccount: 'NOT_PROVIDED', commercialTerms: 'NOT_PROVIDED',
    note: 'Actual candidate bytes and local domain rules verified; no merchant charge, external delivery or commercial entitlement was performed.',
  };
}

function main() {
  const root = process.cwd();
  const candidateId = process.env.SHPITTO_CANDIDATE_ID?.trim() || 'local-candidate-20261007-completion';
  const output = path.join(root, 'internal', 'evidence', 'm8', 'fulfillment', 'local-fixture');
  let result;
  try { result = verifyLocalFulfillment(root, candidateId); }
  catch (error) {
    result = {status: 'FAIL', profile: 'local-fulfillment-fixture', candidateId, error: error.message};
    process.exitCode = 1;
  }
  mkdirSync(output, {recursive: true});
  writeFileSync(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
