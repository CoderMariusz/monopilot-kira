import { describe, expect, it } from 'vitest';

import { validateD365Material } from '../src/v04-d365-material.js';

describe('V04 D365 material validator', () => {
  it('returns worst status and per-cell statuses for comma-separated material codes', async () => {
    const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
    const db = {
      async query<T>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }> {
        queries.push({ sql, params });
        return {
          rows: [
            { code: 'RM123', status: 'Found', comment: 'ok' },
            { code: 'RM456', status: 'Missing', comment: 'not in D365' },
          ] as T[],
        };
      },
    };

    const result = await validateD365Material(db, {
      orgId: '00000000-0000-4000-8000-000000000028',
      value: 'RM123, RM456',
    });

    expect(result).toEqual({
      status: 'Missing',
      details: [
        { code: 'RM123', status: 'Found', comment: 'ok' },
        { code: 'RM456', status: 'Missing', comment: 'not in D365' },
      ],
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toMatch(/public\.d365_import_cache/);
    expect(queries[0]?.sql).toMatch(/org_id\s*=\s*\$1/i);
    expect(queries[0]?.params).toEqual([
      '00000000-0000-4000-8000-000000000028',
      ['RM123', 'RM456'],
    ]);
  });

  it('trims codes and returns Empty when no D365 cache row exists', async () => {
    const db = {
      async query<T>(): Promise<{ rows: T[] }> {
        return { rows: [] };
      },
    };

    const result = await validateD365Material(db, {
      orgId: '00000000-0000-4000-8000-000000000028',
      value: ' RM999 ',
    });

    expect(result).toEqual({
      status: 'Empty',
      details: [{ code: 'RM999', status: 'Empty' }],
    });
  });

  it('returns NoCost without converting it into a blocking Missing status', async () => {
    const db = {
      async query<T>(): Promise<{ rows: T[] }> {
        return {
          rows: [{ code: 'RM456', status: 'NoCost', comment: null }] as T[],
        };
      },
    };

    const result = await validateD365Material(db, {
      orgId: '00000000-0000-4000-8000-000000000028',
      value: 'RM456',
    });

    expect(result).toEqual({
      status: 'NoCost',
      details: [{ code: 'RM456', status: 'NoCost', comment: null }],
    });
  });
});
