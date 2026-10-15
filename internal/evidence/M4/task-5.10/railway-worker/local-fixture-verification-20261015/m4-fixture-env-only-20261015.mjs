import process from 'node:process';
import {syncBuiltinESMExports} from 'node:module';

if (process.env.SHPITTO_FIXTURE_ENV_ONLY !== '1') throw new Error('Fixture-only preload requires explicit verification scope.');
// Verification supplies an allowlisted environment. Do not read local credential files,
// including from worker modules or crash-recovery subprocesses that import this API.
process.loadEnvFile = () => { process.stderr.write('Fixture environment: local env-file loading blocked.\n'); };
syncBuiltinESMExports();
