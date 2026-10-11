declare module 'pg' {
  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    [key: string]: unknown;
  }

  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<TResult extends QueryResultRow = QueryResultRow> {
    rows: TResult[];
    rowCount: number | null;
  }

  export class Client {
    constructor(config?: PoolConfig);
    connect(): Promise<void>;
    query<TResult extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<TResult>>;
    end(): Promise<void>;
  }

  export class Pool {
    constructor(config?: PoolConfig);
    query<TResult extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<TResult>>;
    end(): Promise<void>;
  }

  export type PoolClient = Client;

  const pg: {Client: typeof Client; Pool: typeof Pool};
  export default pg;
}
