import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'u1', orgId: 'o1', client: { query: queryMock } }),
}));

import { getRequiredFieldsForDept } from '../get-required-fields-for-dept';

beforeEach(() => {
  queryMock.mockReset();
});

describe('getRequiredFieldsForDept', () => {
  it('loads required fields from the dynamic catalog and preserves the checklist shape', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { column_key: 'recipe_components', physical_column: 'recipe_components', field_value: 'Flour' },
        { column_key: 'pack_size', physical_column: 'pack_size', field_value: '' },
      ],
    });

    const result = await getRequiredFieldsForDept('FA0001', 'Core');

    expect(result).toEqual({
      dept: 'Core',
      fields: [
        { key: 'recipe_components', name: 'Recipe Components', ok: true },
        { key: 'pack_size', name: 'Pack Size', ok: false },
      ],
      allPass: false,
    });

    const sql = String(queryMock.mock.calls[0]?.[0] ?? '');
    expect(sql).toMatch(/join\s+public\.npd_department_field\s+df/i);
    expect(sql).toMatch(/join\s+public\.npd_field_catalog\s+f/i);
    expect(sql).toMatch(/df\.required\s*=\s*true/i);
    expect(sql).toMatch(/p\.product_code\s*=\s*\$1::text/i);
    expect(sql).toMatch(/lower\(d\.code\)\s*=\s*lower\(\$2::text\)/i);
    expect(sql).not.toMatch(/"Reference"\."DeptColumns"/i);
  });
});
