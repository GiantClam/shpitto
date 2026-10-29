import {mkdirSync, statSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options: {output: {type: 'string'}, help: {type: 'boolean', short: 'h'}}});
if (values.help) {
  console.log('Usage: node scripts/maintenance/backup-db.mjs --output .data/backups/shpitto.dump');
  process.exit(0);
}
const output = typeof values.output === 'string' ? resolve(values.output) : '';
const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';
if (!output || !databaseUrl) throw new Error('DATABASE_URL and --output are required.');
mkdirSync(dirname(output), {recursive: true});
const result = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', output, databaseUrl], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, encoding: 'utf8'});
if (result.status !== 0) throw new Error('pg_dump failed; inspect the database operator logs for a redacted diagnostic.');
const bytes = statSync(output).size;
if (bytes <= 0) throw new Error('pg_dump produced an empty backup.');
console.log(JSON.stringify({status: 'PASS', output, bytes, format: 'custom', database: 'redacted'}));
