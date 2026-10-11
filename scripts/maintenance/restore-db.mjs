import {existsSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options: {input: {type: 'string'}, confirm: {type: 'string'}, help: {type: 'boolean', short: 'h'}}});
if (values.help) {
  console.log('Usage: ALLOW_DATABASE_RESTORE=1 node scripts/maintenance/restore-db.mjs --input .data/backups/shpitto.dump --confirm RESTORE');
  process.exit(0);
}
const input = typeof values.input === 'string' ? resolve(values.input) : '';
const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
if (!input || !databaseUrl || !existsSync(input) || statSync(input).size <= 0) throw new Error('DATABASE_URL and a non-empty --input backup are required.');
if (values.confirm !== 'RESTORE') throw new Error('Destructive restore requires --confirm RESTORE.');
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DATABASE_RESTORE !== '1') throw new Error('Production restore requires ALLOW_DATABASE_RESTORE=1 after an approved maintenance window.');
const result = spawnSync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', databaseUrl, input], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, encoding: 'utf8'});
if (result.status !== 0) throw new Error('pg_restore failed; inspect the database operator logs for a redacted diagnostic.');
console.log(JSON.stringify({status: 'PASS', input, database: 'redacted', destructive: true}));
