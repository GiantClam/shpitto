import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {and, eq, lte} from 'drizzle-orm';
import {getProviderWorkerConfig, getProviderCredentials} from '../src/config/env.ts';
import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {generationTasks} from '../src/db/schema/generation.ts';
import {getPrivateObjectStore} from '../src/adapters/storage/runtime.ts';
import {drainTerminalProviderWebhookInbox} from '../src/modules/generation/provider-webhooks.ts';
import {runProviderWorkerOnce} from '../src/modules/generation/provider-worker.ts';
import {drainOverdueGenerationTasks} from '../src/modules/generation/sweep-recovery.ts';
import {startWorkerLoops, startWorkerLoopsAfterBind} from '../src/modules/generation/worker-loops.ts';
import {cleanupOrphanedAssetsDetailed} from '../src/modules/assets/cleanup.ts';

async function main(): Promise<void> {
  const config = getProviderWorkerConfig();
  const port = Number(getProviderCredentials().port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Worker port must be a valid TCP port.');
  const database = createDatabase({max: 4, connectionTimeoutMillis: 2_000, statement_timeout: 15_000});
  const tools = Object.fromEntries(['ffmpeg', 'ffprobe'].map((tool) => [tool, execFileSync(tool, ['-version'], {encoding: 'utf8', timeout: 5_000, windowsHide: true}).split('\n')[0]]));
  const store = getPrivateObjectStore();
  const owner = `provider-worker-${randomUUID()}`;
  const schema = await database.pool.query<{ready: boolean}>("select to_regclass('app.generation_tasks') is not null and to_regclass('app.submission_attempts') is not null and to_regclass('app.provider_webhook_inbox') is not null as ready");
  if (!schema.rows[0]?.ready) { await database.pool.end(); throw new Error('Provider worker database migrations are required.'); }
  let stopping = false;
  const scoped = config.state === 'active' && config.workspaceId;
  let runner: ReturnType<typeof startWorkerLoops> | null = null;
  const loopOptions: Parameters<typeof startWorkerLoops>[0] = {onError: (name, error) => {
    console.error(JSON.stringify({event: 'provider-worker-cycle-failed', loop: name, code: error instanceof DomainError ? error.code : 'INFRASTRUCTURE'}));
  }, loops: scoped ? [
    {name: 'dispatch', intervalMs: config.pollMs, staleMs: 120_000, run: async () => {
      const result = await runProviderWorkerOnce(database.db, {config, owner, store});
      if (result.outcome === 'recovery_pending') throw new DomainError('CONFLICT', 'Overdue recovery must finish before dispatch.');
    }},
    {name: 'sweep', intervalMs: 10_000, staleMs: 180_000, run: async () => {
      const result = await drainOverdueGenerationTasks(database.db, new Date(), {workspaceId: scoped});
      if (!result.drained) throw new DomainError('CONFLICT', 'Overdue recovery has unfinished work.');
      const old = await database.db.select({id: generationTasks.id}).from(generationTasks).where(and(eq(generationTasks.workspaceId, scoped), eq(generationTasks.status, 'submission_unknown'), lte(generationTasks.submissionStartedAt, new Date(Date.now() - 30 * 60 * 1000)))).limit(1);
      if (old.length) console.warn(JSON.stringify({event: 'provider-submission-unknown-over-30-minutes', scope: 'assigned-workspace'}));
    }},
    {name: 'inbox', intervalMs: 10_000, staleMs: 120_000, run: () => drainTerminalProviderWebhookInbox(database.db, {workspaceId: scoped, limit: 20})},
    {name: 'cleanup', intervalMs: 60_000, staleMs: 180_000, run: async () => {
      const report = await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: scoped, store});
      if (report.failures.length) throw new DomainError('CONFLICT', 'Asset cleanup has retryable failures.');
    }},
  ] : []};
  const server = createServer(async (request, response) => {
    if (request.url !== '/healthz') { response.writeHead(404).end(); return; }
    try {
      await database.pool.query('select 1');
      const health = runner?.snapshot();
      const fresh = !stopping && health?.ready === true;
      response.writeHead(fresh ? 200 : 503, {'content-type': 'application/json', 'cache-control': 'no-store'}).end(JSON.stringify({status: fresh ? 'ready' : 'degraded', role: 'provider-worker', taskRuntime: config.taskRuntime, state: config.state, createsEnabled: config.allowCreate, scope: config.workspaceId ? 'assigned' : 'unassigned', database: 'ready', schema: 'ready', mediaTools: tools, ...health}));
    } catch { response.writeHead(503, {'content-type': 'application/json'}).end(JSON.stringify({status: 'not_ready', role: 'provider-worker', state: config.state, database: 'unavailable'})); }
  });
  runner = await startWorkerLoopsAfterBind(() => new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); }), loopOptions).catch(async (error: unknown) => {
    await database.pool.end();
    throw error;
  });
  console.log(JSON.stringify({event: 'provider-worker-ready', state: config.state, createsEnabled: config.allowCreate, scoped: Boolean(config.workspaceId)}));
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const closed = new Promise<void>((resolve) => { server.close(() => resolve()); });
    await runner?.stop();
    await closed;
    await database.pool.end();
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}

main().catch(() => { console.error('Provider worker startup failed; check configuration, migrations and media tools.'); process.exitCode = 1; });
