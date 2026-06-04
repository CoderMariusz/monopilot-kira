import { describe, expect, it } from 'vitest';

import { validateAllergensV07 } from '../src/v07-allergens.js';

describe('V07 allergen validator', () => {
  it('returns PASS when cascade exists and every override reason has at least 10 characters', async () => {
    const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
    const db = {
      async query<T>(sql: string, params: readonly unknown[]): Promise<{ rows: T[] }> {
        queries.push({ sql, params });
        if (/from public\.fa_allergen_cascade/i.test(sql)) {
          return { rows: [{ product_code: 'FG-1' }] as T[] };
        }
        return { rows: [] };
      },
    };

    const result = await validateAllergensV07(db, {
      orgId: '00000000-0000-4000-8000-000000000039',
      productCode: 'FG-1',
    });

    expect(result).toEqual({ status: 'PASS' });
    expect(queries).toHaveLength(2);
    expect(queries[0]?.sql).toMatch(/public\.fa_allergen_cascade/);
    expect(queries[1]?.sql).toMatch(/public\.fa_allergen_overrides/);
  });

  it('returns WARN with details when legacy override data has a blank reason', async () => {
    const db = {
      async query<T>(sql: string): Promise<{ rows: T[] }> {
        if (/from public\.fa_allergen_cascade/i.test(sql)) {
          return { rows: [{ product_code: 'FG-1' }] as T[] };
        }
        return {
          rows: [
            {
              id: 'override-1',
              product_code: 'FG-1',
              allergen_code: 'gluten',
              reason_length: 0,
            },
          ] as T[],
        };
      },
    };

    const result = await validateAllergensV07(db, {
      orgId: '00000000-0000-4000-8000-000000000039',
      productCode: 'FG-1',
    });

    expect(result.status).toBe('WARN');
    if (result.status !== 'WARN') throw new Error('expected WARN');
    expect(result.details).toEqual([
      {
        code: 'OVERRIDE_REASON_TOO_SHORT',
        id: 'override-1',
        productCode: 'FG-1',
        allergenCode: 'gluten',
        reasonLength: 0,
      },
    ]);
  });

  it('returns WARN when the cascade row is missing', async () => {
    const db = {
      async query<T>(): Promise<{ rows: T[] }> {
        return { rows: [] };
      },
    };

    const result = await validateAllergensV07(db, {
      orgId: '00000000-0000-4000-8000-000000000039',
      productCode: 'FG-1',
    });

    expect(result).toEqual({
      status: 'WARN',
      details: [{ code: 'CASCADE_MISSING', productCode: 'FG-1' }],
    });
  });
});
