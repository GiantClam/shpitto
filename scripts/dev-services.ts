import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const action = process.argv[2] ?? 'up';
const allowedActions = new Set(['up', 'down', 'status']);
if (!allowedActions.has(action)) {
  console.error('Usage: pnpm services [up|down|status]');
  process.exit(1);
}

const composeFile = resolve(process.cwd(), 'deploy/compose.local.yml');
const args = ['compose', '-f', composeFile];
if (action === 'up') args.push('up', '--build', '--detach');
if (action === 'down') args.push('down');
if (action === 'status') args.push('ps');

const result = spawnSync('docker', args, {stdio: 'inherit', shell: false});
if (result.error) {
  console.error(`Docker Compose could not start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
