import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';

const manifestPath = resolve(import.meta.dirname, 'migration-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.migrationOwner !== 'drizzle-migration-runner' || manifest.requestTimeSchemaPush || manifest.secondMigrationAuthority) {
  throw new Error('migration ownership boundary failed');
}

// Import contract is checked without opening a database or reading credentials.
if (typeof drizzle !== 'function') throw new Error('Drizzle import contract failed');
console.log(JSON.stringify({
  singleMigrationOwner: true,
  requestTimeSchemaPush: false,
  secondMigrationAuthority: false,
  manifestSha256: createHash('sha256').update(readFileSync(manifestPath)).digest('hex'),
  databaseConnectionOpened: false,
}));
