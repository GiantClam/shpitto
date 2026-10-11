import {drizzle, type NodePgDatabase} from 'drizzle-orm/node-postgres';
import {Client, Pool, type PoolConfig} from 'pg';

import {getServerEnv} from '../config/env.ts';
import * as schema from './schema/index.ts';

export type AppDatabase = NodePgDatabase<typeof schema>;

export type DatabaseHandle = Readonly<{
  db: AppDatabase;
  pool: Pool;
}>;

export function createDatabase(config: PoolConfig = {}): DatabaseHandle {
  const env = getServerEnv();
  const pool = new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    ...config,
  });
  return Object.freeze({db: drizzle(pool, {schema}), pool});
}

/** Migrations use one direct connection so the advisory lock covers all SQL. */
export function createMigrationClient(): Client {
  const env = getServerEnv();
  return new Client({connectionString: env.databaseUrl});
}
