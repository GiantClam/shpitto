import {spawn} from 'node:child_process';

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {stdio: 'inherit'});
    child.once('error', (error) => resolve({code: 1, error}));
    child.once('exit', (code, signal) => resolve({code: code ?? (signal ? 1 : 0), signal}));
  });
}

const migration = await run(process.execPath, ['--experimental-strip-types', 'scripts/migrate.ts']);
if (migration.code !== 0) {
  console.error('Local worker migration failed; refusing to start an unready worker.');
  process.exitCode = migration.code || 1;
} else {
  const children = [
    spawn(process.execPath, ['--experimental-strip-types', 'scripts/local-worker.ts'], {stdio: 'inherit'}),
    spawn(process.execPath, ['scripts/worker-health.mjs'], {stdio: 'inherit'}),
  ];

  let stopping = false;
  let exitCode = 0;

  function stop(signal) {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill(signal);
  }

  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  await Promise.all(children.map((child) => new Promise((resolve) => {
    child.once('error', (error) => {
      console.error(`Local worker process failed to start: ${error.message}`);
      exitCode = 1;
      stop('SIGTERM');
      resolve();
    });
    child.once('exit', (code, signal) => {
      if (!stopping) {
        exitCode = code ?? (signal ? 1 : 0);
        stop('SIGTERM');
      }
      resolve();
    });
  })));

  process.exitCode = exitCode;
}
