import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';

if (process.env.SHPITTO_FIXTURE_ENV_ONLY !== '1') throw new Error('Explicit fixture verification scope required.');
process.loadEnvFile = () => undefined;
// Next discovers dotenv files through statSync. Keep protected local env files
// out of this verification while allowing the shipped placeholder example.
const statSync = fs.statSync;
fs.statSync = function(file, ...options) {
  if (typeof file === 'string' && path.basename(file).startsWith('.env') && path.basename(file) !== '.env.example') {
    const error = new Error('Fixture verification does not load local env files.');
    error.code = 'ENOENT';
    throw error;
  }
  return statSync.call(this, file, ...options);
};
syncBuiltinESMExports();
