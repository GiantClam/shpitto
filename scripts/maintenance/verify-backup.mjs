import {existsSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options: {input: {type: 'string'}, help: {type: 'boolean', short: 'h'}}});
if (values.help) {
  console.log('Usage: node scripts/maintenance/verify-backup.mjs --input .data/backups/shpitto.dump');
  process.exit(0);
}
const input = typeof values.input === 'string' ? resolve(values.input) : '';
if (!input || !existsSync(input) || statSync(input).size <= 0) throw new Error('A non-empty --input backup is required.');
const result = spawnSync('pg_restore', ['--list', input], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, encoding: 'utf8'});
if (result.status !== 0 || !(result.stdout || '').includes('TABLE')) throw new Error('Backup verification failed; inspect the database operator logs for a redacted diagnostic.');
console.log(JSON.stringify({status: 'PASS', input, format: 'custom', tableEntries: (result.stdout.match(/ TABLE /g) || []).length}));
