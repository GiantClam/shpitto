import {createDatabase} from '../src/db/client.ts';
import {sweepExpiredGenerationTasks} from '../src/modules/generation/sweep-recovery.ts';

const database = createDatabase();
try {
  const result = await sweepExpiredGenerationTasks(database.db);
  console.log(JSON.stringify({status: 'PASS', command: 'reconcile-overdue', ...result}));
} finally {
  await database.pool.end();
}
