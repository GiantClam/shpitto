import {spawn} from 'node:child_process';
import {createServer} from 'node:net';

export function startLogged(command, args, {cwd, env, logs, name}) {
  const child = spawn(command, args, {cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  logs.set(name, '');
  const append = (value) => logs.set(name, (logs.get(name) + String(value)).slice(-2_000_000));
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (error) => append(error.message));
  child.completed = new Promise((resolve) => {
    child.once('error', (error) => resolve({code: 1, error}));
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  return child;
}

export async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'});
    await new Promise((resolve) => {killer.once('close', resolve); killer.once('error', resolve);});
  } else child.kill('SIGTERM');
  let timer;
  await Promise.race([child.completed, new Promise((resolve) => {timer = setTimeout(() => {child.kill('SIGKILL'); resolve();}, 5000);})]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([child.completed, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error('Candidate child process did not stop.')), 5000);})]).finally(() => clearTimeout(timer));
  }
}

export async function runLogged(command, args, options) {
  const child = startLogged(command, args, options);
  console.log(`Candidate check started: ${options.name}`);
  let timer;
  const timeout = new Promise((resolve) => {timer = setTimeout(() => resolve({timeout: true}), options.timeoutMs ?? 120_000);});
  const result = await Promise.race([child.completed, timeout]);
  clearTimeout(timer);
  if (result.timeout) await stopChild(child);
  if (result.code !== 0) throw new Error(`${options.name} failed${result.timeout ? ' (timeout)' : ` (exit ${result.code})`}; inspect ${options.name}.log.`);
  console.log(`Candidate check passed: ${options.name}`);
  return options.logs.get(options.name);
}

export async function freeLocalPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function waitUntil(check, description, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}
