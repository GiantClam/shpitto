import {createServer} from 'node:http';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema/index.ts';
import {getProviderCredentials, getRecoveryMonitorEnvironment} from '../src/config/env.ts';
import {parseRecoveryMonitorConfig} from '../src/config/recovery-monitor.ts';
import {runRecoveryHeartbeatMonitorOnce} from '../src/modules/operations/recovery-heartbeat.ts';
import {deliverRecoveryAlert} from '../src/modules/operations/recovery-alert-delivery.ts';
import {observeRecoveryMonitorHealth, recoveryMonitorReady, type RecoveryMonitorHealth} from '../src/modules/operations/recovery-monitor-health.ts';

/** This separate process has no dispatch loop, provider token, or paid-create authority. */
async function main(): Promise<void> {
  const config = parseRecoveryMonitorConfig(getRecoveryMonitorEnvironment());
  const port = Number(getProviderCredentials().port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Monitor port is invalid.');
  const pool = config.mode === 'observe' ? new Pool({connectionString: config.databaseUrl, max: 2, connectionTimeoutMillis: 2_000, statement_timeout: 15_000}) : null;
  const db = pool ? drizzle(pool, {schema}) : null;
  const scope = {workspaceId: config.workspaceId, workerKey: config.workerKey, expectedAt: new Date()};
  let stopping = false;
  let health: RecoveryMonitorHealth = {lastSuccessAt:null,errors:0,deliveryPending:false};
  let pending: Promise<void> | null = null;
  const server = createServer((request, response) => {
    if (request.url !== '/healthz') { response.writeHead(404).end(); return; }
    const ready = !stopping && (config.mode === 'off' || recoveryMonitorReady(health));
    response.writeHead(ready ? 200 : 503, {'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({status:ready?'ready':'degraded', role:'recovery-monitor', mode:config.mode, providerCreatesEnabled:false, lastSuccessAt:health.lastSuccessAt?.toISOString()??null,errors:health.errors,deliveryPending:health.deliveryPending}));
  });
  await new Promise<void>((resolve, reject) => {server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
  const tick = () => {
    if (stopping || pending || !db) return;
    pending = runRecoveryHeartbeatMonitorOnce(db, {...scope, deliver:(payload) => deliverRecoveryAlert(payload, config)}).then((result) => {
      health = observeRecoveryMonitorHealth(health,result.status,new Date());
      if (['delivered','retry','superseded'].includes(result.status)) console.log(JSON.stringify({event:'recovery-monitor-observation',...result,workspaceId:scope.workspaceId,workerKey:scope.workerKey}));
    }).catch(() => {health={...health,errors:health.errors+1};console.error(JSON.stringify({event:'recovery-monitor-cycle-failed',code:'INFRASTRUCTURE'}));}).finally(() => {pending=null;});
  };
  const timer = setInterval(tick,10_000);
  tick();
  console.log(JSON.stringify({event:'recovery-monitor-ready',mode:config.mode,providerCreatesEnabled:false}));
  const stop = async () => {
    if(stopping) return;
    stopping=true;clearInterval(timer);
    const closed = new Promise<void>((resolve)=>server.close(()=>resolve()));
    await pending; await closed; await pool?.end();
  };
  process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
}
main().catch(()=>{console.error('Recovery monitor startup failed; verify isolated binding and recipient configuration.');process.exitCode=1;});
