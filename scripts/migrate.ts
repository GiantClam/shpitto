import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

import {sql} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/node-postgres/migrator';

import {createMigrationClient} from '../src/db/client.ts';

const MIGRATION_LOCK_KEY = 'shpitto:drizzle:migrations:v1';

async function run(): Promise<void> {
  const client = createMigrationClient();
  await client.connect();
  const db = (await import('drizzle-orm/node-postgres')).drizzle(client);
  let lockHeld = false;

  try {
    await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [MIGRATION_LOCK_KEY]);
    lockHeld = true;
    await client.query(await readFile(resolve(process.cwd(), 'src/db/legacy-credit-baseline.sql'), 'utf8'));
    await migrate(db, {migrationsFolder: resolve(process.cwd(), 'src/db/migrations')});
    const result = await db.execute(sql`select count(*)::int as count from app.schema_ownership`);
    console.log(JSON.stringify({status: 'PASS', migrationOwner: 'drizzle-migration-runner', rows: result.rows}));
  } finally {
    if (lockHeld) {
      await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [MIGRATION_LOCK_KEY]);
    }
    await client.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
