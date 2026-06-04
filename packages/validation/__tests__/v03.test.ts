import { describe, expect, it } from 'vitest';

import { validatePackSize } from '../src/v03-pack-size.js';

describe('V03 pack size validator', () => {
  it("returns FAIL with the unknown pack size when value is absent from Reference.PackSizes for the org", async () => {
    const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
    const db = {
      async query<T>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }> {
        queries.push({ sql, params });
        return { rows: [] };
      },
    };

    const result = await validatePackSize(db, {
      orgId: '00000000-0000-4000-8000-000000000028',
      value: '500g',
    });

    expect(result).toEqual({
      status: 'FAIL',
      message: 'Unknown pack size: 500g',
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toMatch(/"Reference"\."PackSizes"/);
    expect(queries[0]?.sql).toMatch(/org_id\s*=\s*\$1/i);
    expect(queries[0]?.params).toEqual(['00000000-0000-4000-8000-000000000028', '500g']);
  });
});
