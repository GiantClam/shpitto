import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const packet = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(packet, 'run-browser-from-verified.mjs');
const targetPath = path.join(packet, 'run-browser-attempt2.mjs');
assert.equal(existsSync(targetPath), false);
const source = readFileSync(sourcePath, 'utf8');
let adapted = source
  .replaceAll('browser-launch-result.json', 'browser-launch-result-attempt2.json')
  .replaceAll('browser-harness-executed.mjs', 'browser-harness-executed-attempt2.mjs')
  .replaceAll('browser-harness-execution-adaptation.json', 'browser-harness-execution-adaptation-attempt2.json')
  .replaceAll('local-mail.log', 'local-mail-attempt2.log')
  .replaceAll("run('browser-driver',", "run('browser-driver-attempt2',");
const insertion = ".replaceAll('await browser.newContext(', 'await localContext(')";
assert.ok(adapted.includes(insertion));
adapted = adapted.replace(insertion, `${insertion}\n  .replaceAll('m.To.some(to => to.Address === account.email)', 'm.To.some(to => (typeof to === \\'string\\' ? to : to.Address) === account.email)')`);
assert.ok(adapted.includes('typeof to'));
writeFileSync(targetPath, adapted, 'utf8');
writeFileSync(path.join(packet, 'browser-attempt2-rationale.json'), `${JSON.stringify({
  createdAt: new Date().toISOString(),
  priorAttempt: 'browser-launch-result.json',
  priorFailure: 'Email verification lookup timed out because the retained Mailpit harness expected To[].Address; scripts/local-mail-capture.mjs returns To[] strings.',
  change: 'Only the harness mail-recipient shape adapter and unique attempt output names. Real application registration, captured email, verification URL, browser assertions, exact source/build binding, and cleanup are preserved.',
  originalDriverSha256: createHash('sha256').update(source).digest('hex'),
  adaptedDriverSha256: createHash('sha256').update(adapted).digest('hex'),
  originalArtifactsPreserved: true, shippedFilesModified: false, inventedManualProof: false,
}, null, 2)}\n`, 'utf8');
console.log('Prepared unique second browser attempt; no application source changes.');
