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
import {sweepExpiredGenerationTasks} from '../src/modules/generation/sweep-recovery.ts';
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
  const health = {lastDispatchAt: new Date().toISOString(), lastSweepAt: null as string | null, lastInboxAt: null as string | null, lastCleanupAt: null as string | null, errors: 0};
  const pending = new Set<Promise<void>>();
  const timers: ReturnType<typeof setInterval>[] = [];
  const loop = (name: string, interval: number, run: () => Promise<unknown>): void => {
    let busy = false;
    const tick = () => {
      if (stopping || busy) return;
      busy = true;
      const operation = run().then(() => { if (name === 'dispatch') health.lastDispatchAt = new Date().toISOString(); }, (error: unknown) => {
        health.errors++;
        console.error(JSON.stringify({event: 'provider-worker-cycle-failed', loop: name, code: error instanceof DomainError ? error.code : 'INFRASTRUCTURE'}));
      }).finally(() => { busy = false; pending.delete(operation); });
      pending.add(operation);
    };
    timers.push(setInterval(tick, interval));
    tick();
  };
  const server = createServer(async (request, response) => {
    if (request.url !== '/healthz') { response.writeHead(404).end(); return; }
    try {
      await database.pool.query('select 1');
      const fresh = config.state === 'paused' || Date.now() - new Date(health.lastDispatchAt).getTime() < 120_000;
      response.writeHead(fresh ? 200 : 503, {'content-type': 'application/json', 'cache-control': 'no-store'}).end(JSON.stringify({status: fresh ? 'ready' : 'degraded', role: 'provider-worker', state: config.state, createsEnabled: config.allowCreate, scope: config.workspaceId ? 'assigned' : 'unassigned', database: 'ready', schema: 'ready', mediaTools: tools, ...health}));
    } catch { response.writeHead(503, {'content-type': 'application/json'}).end(JSON.stringify({status: 'not_ready', role: 'provider-worker', state: config.state, database: 'unavailable'})); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '0.0.0.0', resolve); });
  console.log(JSON.stringify({event: 'provider-worker-ready', state: config.state, createsEnabled: config.allowCreate, scoped: Boolean(config.workspaceId)}));
  loop('dispatch', config.pollMs, () => runProviderWorkerOnce(database.db, {config, owner, store}));
  loop('sweep', 10_000, async () => {
    if (!config.workspaceId) return;
    await sweepExpiredGenerationTasks(database.db, new Date(), {workspaceId: config.workspaceId});
    health.lastSweepAt = new Date().toISOString();
    const old = await database.db.select({id: generationTasks.id}).from(generationTasks).where(and(eq(generationTasks.workspaceId, config.workspaceId), eq(generationTasks.status, 'submission_unknown'), lte(generationTasks.submissionStartedAt, new Date(Date.now() - 30 * 60 * 1000)))).limit(1);
    if (old.length) console.warn(JSON.stringify({event: 'provider-submission-unknown-over-30-minutes', scope: 'assigned-workspace'}));
  });
  loop('inbox', 10_000, async () => {
    if (!config.workspaceId) return;
    await drainTerminalProviderWebhookInbox(database.db, {workspaceId: config.workspaceId, limit: 20});
    health.lastInboxAt = new Date().toISOString();
  });
  loop('cleanup', 60_000, async () => {
    if (!config.workspaceId) return;
    await cleanupOrphanedAssetsDetailed(database.db, {workspaceId: config.workspaceId, store});
    health.lastCleanupAt = new Date().toISOString();
  });
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    for (const timer of timers) clearInterval(timer);
    server.close();
    await Promise.all([...pending]);
    await database.pool.end();
  };
  process.once('SIGINT', () => { void shutdown(); });
  process.once('SIGTERM', () => { void shutdown(); });
}

main().catch(() => { console.error('Provider worker startup failed; check configuration, migrations and media tools.'); process.exitCode = 1; });
