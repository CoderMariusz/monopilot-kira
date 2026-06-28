import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'u1', orgId: 'o1', client: { query: queryMock } }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { closeDeptSection } from '../close-dept-section';

beforeEach(() => {
  queryMock.mockReset();
});

describe('closeDeptSection required-field close path', () => {
  it('lists missing required columns from the dynamic catalog and preserves the error envelope', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/is_all_required_filled/i.test(text)) return { rows: [{ ready: false }] };
      if (/required_columns\s+as/i.test(text)) {
        return { rows: [{ physical_column: 'recipe_components', field_value: null }] };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(closeDeptSection('FA0001', 'Core')).rejects.toMatchObject({
      name: 'DepartmentNotReadyError',
      code: 'DEPARTMENT_NOT_READY',
      dept: 'Core',
      missingColumns: ['recipe_components'],
    });

    const sql = queryMock.mock.calls.map((call) => String(call[0])).find((text) =>
      /required_columns\s+as/i.test(text),
    );
    expect(sql).toMatch(/join\s+public\.npd_department_field\s+df/i);
    expect(sql).toMatch(/join\s+public\.npd_field_catalog\s+f/i);
    expect(sql).toMatch(/df\.required\s*=\s*true/i);
    expect(sql).toMatch(/p\.product_code\s*=\s*\$1::text/i);
    expect(sql).toMatch(/lower\(d\.code\)\s*=\s*lower\(\$2::text\)/i);
    expect(sql).not.toMatch(/"Reference"\."DeptColumns"/i);
  });
});
