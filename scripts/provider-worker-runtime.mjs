import {spawn} from 'node:child_process';

// Validate isolation before any migration client is constructed or any SQL is executed.
const preflight = spawn(process.execPath, ['--experimental-strip-types', 'scripts/provider-worker-preflight.ts'], {stdio: 'inherit'});
const preflightCode = await new Promise((resolve) => { preflight.once('error', () => resolve(1)); preflight.once('exit', (status) => resolve(status ?? 1)); });
if (preflightCode !== 0) process.exit(1);

// The isolated worker is the migration authority for its own Railway database.
const migrate = spawn(process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts'], {stdio: 'inherit'});
const code = await new Promise((resolve) => { migrate.once('error', () => resolve(1)); migrate.once('exit', (status) => resolve(status ?? 1)); });
if (code !== 0) { console.error('Provider worker migration failed; worker remains stopped.'); process.exitCode = 1; }
else {
  const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/provider-worker.ts'], {stdio: 'inherit'});
  process.once('SIGINT', () => child.kill('SIGINT'));
  process.once('SIGTERM', () => child.kill('SIGTERM'));
  child.once('error', () => { console.error('Provider worker failed to start.'); process.exitCode = 1; });
  child.once('exit', (status, signal) => { process.exitCode = status ?? (signal ? 1 : 0); });
}
