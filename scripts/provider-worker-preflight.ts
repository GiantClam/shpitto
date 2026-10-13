import {assertPrivateRailwayWorkerDatabase} from '../src/config/provider-worker.ts';
import {getProviderWorkerConfig, getServerEnv} from '../src/config/env.ts';

try {
  getProviderWorkerConfig();
  assertPrivateRailwayWorkerDatabase(getServerEnv().databaseUrl);
  console.log(JSON.stringify({event: 'provider-worker-isolation-validated', migrationsStarted: false}));
} catch {
  console.error('Provider worker isolation/configuration preflight failed; no database mutation was attempted.');
  process.exitCode = 1;
}
