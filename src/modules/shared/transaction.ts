import type {AppDatabase} from '../../db/client.ts';

type TransactionCallback = Parameters<AppDatabase['transaction']>[0];
export type TransactionDatabase = TransactionCallback extends (tx: infer TTransaction) => Promise<unknown>
  ? TTransaction
  : never;

export type TransactionWork<TResult> = (tx: TransactionDatabase) => Promise<TResult>;

/** Domain commands must receive a transaction boundary from the database owner. */
export async function inTransaction<TResult>(db: AppDatabase, work: TransactionWork<TResult>): Promise<TResult> {
  return db.transaction(work);
}
