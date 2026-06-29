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
      // Defect A1-2 — the active-dept existence check runs BEFORE the readiness
      // gate; without this branch the readiness path below would never be reached.
      // It is the ONLY query that selects `true as ok` from npd_departments
      // (listMissingRequiredColumns selects rc.physical_column), so this matcher
      // does not steal the missing-columns query's result.
      if (
        /select\s+true\s+as\s+ok[\s\S]*from\s+public\.npd_departments[\s\S]*d\.active\s*=\s*true/i.test(
          text,
        )
      ) {
        return { rows: [{ ok: true }] };
      }
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

  it('rejects with DEPT_INACTIVE when the department is deactivated (Defect A1-2)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      // Active-dept existence check returns NO row → department is deactivated.
      if (
        /select\s+true\s+as\s+ok[\s\S]*from\s+public\.npd_departments[\s\S]*d\.active\s*=\s*true/i.test(
          text,
        )
      ) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(closeDeptSection('FA0001', 'Production')).rejects.toMatchObject({
      name: 'ValidationError',
      code: 'DEPT_INACTIVE',
    });

    // The readiness gate must NOT have run — the inactive check short-circuits first.
    const ranReadinessGate = queryMock.mock.calls.some((call) =>
      /is_all_required_filled/i.test(String(call[0])),
    );
    expect(ranReadinessGate).toBe(false);
  });

  it('rejects Production close when no WIP process exists', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (
        /select\s+true\s+as\s+ok[\s\S]*from\s+public\.npd_departments[\s\S]*d\.active\s*=\s*true/i.test(
          text,
        )
      ) {
        return { rows: [{ ok: true }] };
      }
      if (/from\s+public\.npd_wip_processes\s+wp/i.test(text)) {
        return { rows: [{ has_process: false }] };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(closeDeptSection('FA0001', 'Production')).rejects.toMatchObject({
      name: 'ValidationError',
      code: 'NO_PRODUCTION_PROCESS',
      message: 'Production requires at least one WIP process.',
    });

    const ranReadinessGate = queryMock.mock.calls.some((call) =>
      /is_all_required_filled/i.test(String(call[0])),
    );
    expect(ranReadinessGate).toBe(false);
  });
});
