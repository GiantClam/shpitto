import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {commercialBlockers} from '../../vendor/sales/commerce.mjs';

const root = process.cwd();
const tests = spawnSync(process.execPath, ['--test', '--experimental-test-coverage', 'tests/vendor/commerce.test.mjs', 'tests/vendor/fulfillment.test.mjs'], {cwd: root, encoding: 'utf8', windowsHide: true});
const result = {
  status: tests.status === 0 ? 'PASS' : 'FAIL', profile: 'local-vendor-commerce',
  generatedAt: new Date().toISOString(),
  scenarios: ['SC-COM-01', 'SC-COM-02', 'SC-COM-04', 'SC-COM-05', 'SC-COM-06'],
  checks: {localHttpJourney: tests.status === 0 ? 'PASS' : 'FAIL', isolatedSourceOrders: tests.status === 0 ? 'PASS' : 'FAIL', entitlementAndRenewal: tests.status === 0 ? 'PASS' : 'FAIL', publicCommerceFailClosed: tests.status === 0 ? 'PASS' : 'FAIL'},
  sourceHashes: Object.fromEntries(['vendor/sales/commerce.mjs', 'vendor/sales/commerce.config.json', 'vendor/sales/server.mjs', 'vendor/sales/content/legal/source-license.md', 'vendor/sales/content/legal/support-and-services.md', 'internal/vendor/entitlement-schema.json', 'scripts/verify-local-fulfillment.mjs', 'tests/vendor/commerce.test.mjs', 'tests/vendor/fulfillment.test.mjs'].map((file) => [file, createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')])),
  publicCommerce: 'BLOCKED', vendorAccount: 'NOT_PROVIDED', commercialTerms: 'DRAFT_NOT_APPROVED',
  blockers: commercialBlockers(JSON.parse(readFileSync(path.join(root, 'vendor/sales/commerce.config.json'), 'utf8'))),
  note: 'Local checks only. No real charge, affiliate settlement, external invitation or publication was performed.',
};
for (const folder of ['commerce-separation', 'support-entitlement']) {
  const directory = path.join(root, 'internal/evidence/m8', folder);
  mkdirSync(directory, {recursive: true});
  writeFileSync(path.join(directory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(directory, 'tests.log'), `${tests.stdout ?? ''}${tests.stderr ?? ''}`, 'utf8');
}
console.log(JSON.stringify(result, null, 2));
assert.equal(tests.status, 0, 'Local vendor commerce regression tests failed.');
