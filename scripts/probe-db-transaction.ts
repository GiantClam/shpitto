import {drizzle} from 'drizzle-orm/node-postgres';
import {sql} from 'drizzle-orm';

import {createMigrationClient} from '../src/db/client.ts';

const client = createMigrationClient();
await client.connect();
const db = drizzle(client);
let rollbackObserved = false;

try {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`create temp table shpitto_tx_probe (id integer primary key) on commit drop`);
      await tx.execute(sql`insert into shpitto_tx_probe (id) values (1)`);
      throw new Error('injected-transaction-failure');
    });
  } catch (error) {
    rollbackObserved = error instanceof Error && error.message === 'injected-transaction-failure';
  }

  const rolledBack = await client.query("select to_regclass('pg_temp.shpitto_tx_probe') as relation");
  await db.transaction(async (tx) => {
    await tx.execute(sql`create temp table shpitto_tx_probe (id integer primary key) on commit preserve rows`);
    await tx.execute(sql`insert into shpitto_tx_probe (id) values (1)`);
  });
  const committed = await client.query('select count(*)::int as count from shpitto_tx_probe');
  await client.query('drop table shpitto_tx_probe');

  const result = {
    status: 'PASS',
    rollbackObserved,
    rollbackRemovedTemporaryTable: rolledBack.rows[0]?.relation === null,
    committedRows: committed.rows[0]?.count,
  };
  if (!result.rollbackObserved || !result.rollbackRemovedTemporaryTable || result.committedRows !== 1) {
    throw new Error(`database transaction probe failed: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify(result));
} finally {
  await client.end();
}
