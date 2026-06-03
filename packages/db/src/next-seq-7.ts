import type pg from 'pg';
import { getAppConnection } from './clients.js';

type QueryExecutor = {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<pg.QueryResult<T>>;
};

export type NextSeq7Options = {
  client?: QueryExecutor;
};

export async function nextSeq7(orgId: string, options: NextSeq7Options = {}): Promise<string> {
  const query = `
    select app.app_next_seq_7($1::uuid) as seq
  `;

  if (options.client) {
    const result = await options.client.query<{ seq: string }>(query, [orgId]);
    return result.rows[0]?.seq ?? raiseMissingSequence();
  }

  const pool = getAppConnection();
  try {
    const result = await pool.query<{ seq: string }>(query, [orgId]);
    return result.rows[0]?.seq ?? raiseMissingSequence();
  } finally {
    await pool.end();
  }
}

function raiseMissingSequence(): never {
  throw new Error('app.app_next_seq_7 returned no sequence value');
}
