/**
 * S11 Z-1 / Z-2 — the FA cell writer must ENFORCE the rules the NPD field
 * catalog already stores, and must not truthiness-coerce booleans.
 *
 * Values come straight from the audit (FINDING-WALIDACJA-WEJSCIA): `Infinity`,
 * `1e309`, `-50`, `100000` on a column whose catalog row says
 * `{"minimum":0,"maximum":100}`, and the string `"false"` on a boolean column.
 */
import { describe, expect, it } from 'vitest';

import { validateValue, type DeptColumnRow, type OrgContextLike } from '../_lib/fa-cell-shared';

const ctx = {
  userId: 'u',
  orgId: 'o',
  client: {
    async query() {
      throw new Error('no query expected for non-dropdown columns');
    },
  },
} as unknown as OrgContextLike;

function column(overrides: Partial<DeptColumnRow>): DeptColumnRow {
  return {
    dept_code: 'production',
    column_key: 'yield_p1',
    data_type: 'number',
    field_type: null,
    dropdown_source: null,
    required_for_done: false,
    validation_json: null,
    ...overrides,
  };
}

// Exactly what psql shows in npd_field_catalog for Operation_Yield_1..4.
const YIELD = column({ validation_json: { minimum: 0, maximum: 100 } });

async function reject(col: DeptColumnRow, value: unknown): Promise<string> {
  try {
    await validateValue(ctx, col, value);
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
  throw new Error(`expected ${String(value)} to be rejected`);
}

describe('Z-1 numeric FA cells honour the catalog bounds', () => {
  it('rejects the non-finite values that poisoned avg(yield_p1) for the whole org', async () => {
    expect(await reject(YIELD, 'Infinity')).toBe('INVALID_VALUE');
    expect(await reject(YIELD, '1e309')).toBe('INVALID_VALUE');
    expect(await reject(YIELD, Number.POSITIVE_INFINITY)).toBe('INVALID_VALUE');
    expect(await reject(YIELD, 'NaN')).toBe('INVALID_VALUE');
  });

  it('rejects values outside minimum/maximum', async () => {
    expect(await reject(YIELD, '-50')).toBe('INVALID_VALUE');
    expect(await reject(YIELD, '100000')).toBe('INVALID_VALUE');
  });

  it('still accepts values inside the declared range (guard must not freeze the field)', async () => {
    await expect(validateValue(ctx, YIELD, '97.5')).resolves.toBe(97.5);
    await expect(validateValue(ctx, YIELD, 0)).resolves.toBe(0);
    await expect(validateValue(ctx, YIELD, 100)).resolves.toBe(100);
    // optional column: clearing it must stay possible
    await expect(validateValue(ctx, YIELD, '')).resolves.toBeNull();
  });

  it('keeps a bound-less numeric column open, but still finite', async () => {
    const plain = column({ column_key: 'rate', validation_json: null });
    await expect(validateValue(ctx, plain, '123456')).resolves.toBe(123456);
    expect(await reject(plain, 'Infinity')).toBe('INVALID_VALUE');
  });

  it('reads the wizard/preview spellings of the same rule too', async () => {
    const flat = column({ validation_json: { min: 0, max: 100 } });
    const nested = column({ validation_json: { range: { min: 0, max: 100 } } });
    expect(await reject(flat, '5000')).toBe('INVALID_VALUE');
    expect(await reject(nested, '5000')).toBe('INVALID_VALUE');
  });

  it('enforces minimum on shelf life so a negative one cannot expire before production', async () => {
    const shelfLife = column({ column_key: 'proc_shelf_life', validation_json: { minimum: 0 } });
    expect(await reject(shelfLife, '-30')).toBe('INVALID_VALUE');
    await expect(validateValue(ctx, shelfLife, '30')).resolves.toBe(30);
  });

  it('applies the same bounds on a required column (the .pipe branch)', async () => {
    const required = column({ required_for_done: true, validation_json: { minimum: 0, maximum: 100 } });
    expect(await reject(required, 'Infinity')).toBe('INVALID_VALUE');
    expect(await reject(required, '5000')).toBe('INVALID_VALUE');
    expect(await reject(required, '')).toBe('INVALID_VALUE');
    await expect(validateValue(ctx, required, '50')).resolves.toBe(50);
  });

  it('parses booleans strictly on a required column too', async () => {
    const required = column({ column_key: 'closed_core', data_type: 'boolean', required_for_done: true });
    await expect(validateValue(ctx, required, 'false')).resolves.toBe(false);
    await expect(validateValue(ctx, required, true)).resolves.toBe(true);
  });

  it('supports data_type integer, which the switch used to refuse outright', async () => {
    const packs = column({ column_key: 'packs_per_case', data_type: 'integer', validation_json: { minimum: 0 } });
    await expect(validateValue(ctx, packs, '12')).resolves.toBe(12);
    expect(await reject(packs, '12.5')).toBe('INVALID_VALUE');
  });
});

describe('Z-2 boolean FA cells are not truthiness-coerced', () => {
  const flag = column({ column_key: 'closed_core', data_type: 'boolean', validation_json: null });

  it('stores the string "false" as false, not true', async () => {
    await expect(validateValue(ctx, flag, 'false')).resolves.toBe(false);
    await expect(validateValue(ctx, flag, '0')).resolves.toBe(false);
    await expect(validateValue(ctx, flag, 'no')).resolves.toBe(false);
  });

  it('still accepts what the checkbox actually sends', async () => {
    await expect(validateValue(ctx, flag, true)).resolves.toBe(true);
    await expect(validateValue(ctx, flag, false)).resolves.toBe(false);
    await expect(validateValue(ctx, flag, 'true')).resolves.toBe(true);
  });

  it('rejects a value that means nothing instead of guessing', async () => {
    expect(await reject(flag, 'maybe')).toBe('INVALID_VALUE');
  });
});

describe('text FA cells honour declared length bounds', () => {
  it('rejects an over-long value and accepts a legal one', async () => {
    const name = column({ column_key: 'product_name', data_type: 'text', validation_json: { minLength: 1, maxLength: 120 } });
    await expect(validateValue(ctx, name, 'Chicken Kyiv 400g')).resolves.toBe('Chicken Kyiv 400g');
    expect(await reject(name, 'x'.repeat(121))).toBe('INVALID_VALUE');
  });
});
