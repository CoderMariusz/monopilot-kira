/** Highest `$n` placeholder index referenced in a Postgres-style parameterized SQL string. */
export function maxSqlPlaceholderIndex(sql: string): number {
  let max = 0;
  for (const match of sql.matchAll(/\$(\d+)/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

/** Assert params length matches the highest `$n` referenced in SQL (count + page queries). */
export function assertSqlParamArity(sql: string, params: readonly unknown[]): void {
  const expected = maxSqlPlaceholderIndex(sql);
  if (params.length !== expected) {
    throw new Error(`SQL expects ${expected} params but received ${params.length}`);
  }
}
