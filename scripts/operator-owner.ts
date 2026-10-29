import {parseArgs} from 'node:util';

import {createDatabase} from '../src/db/client.ts';
import {DomainError} from '../src/db/contracts.ts';
import {administerOperatorOwner} from '../src/modules/operations/bootstrap.ts';

async function run(): Promise<void> {
  const {values, positionals} = parseArgs({
    allowPositionals: true,
    options: {
      'target-user-id': {type: 'string'},
      reason: {type: 'string'},
      'change-reference': {type: 'string'},
      'expected-version': {type: 'string'},
      apply: {type: 'boolean', default: false},
    },
  });
  const mode = positionals[0];
  if (positionals.length !== 1 || (mode !== 'bootstrap' && mode !== 'recover')) throw new Error('Usage: operator-owner.ts bootstrap|recover --target-user-id ID --reason TEXT --change-reference TICKET [--expected-version N] [--apply]');
  const database = createDatabase({max: 1});
  try {
    const common = {targetUserId: values['target-user-id'] ?? '', reason: values.reason ?? '', changeReference: values['change-reference'] ?? '', apply: values.apply};
    const result = await administerOperatorOwner(database.db, mode === 'bootstrap' ? {...common, mode} : {...common, mode, expectedVersion: Number(values['expected-version'])});
    console.log(JSON.stringify(result));
  } finally {
    await database.pool.end();
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof DomainError ? `${error.code}: ${error.message}` : error instanceof Error && error.message.startsWith('Usage:') ? error.message : 'Operator owner administration failed; inspect the administrative server logs.');
  process.exitCode = 1;
});
