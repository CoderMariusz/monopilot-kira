/**
 * A2 (NPD-DYN, mig 374) — updateFaCell auto-field guard (no DB).
 *
 * Mocks withOrgContext so we can assert that an UPDATE targeting an auto-derived
 * catalog field (public.npd_field_catalog.is_auto = true) is REJECTED with
 * ValidationError('READ_ONLY_COLUMN') BEFORE assertProductColumn — auto fields
 * are read-time derived from auto_source_field and must never be independently
 * written. A non-auto field still flows through to the product UPDATE.
 *
 * The boundary mocked is ONLY the transport (withOrgContext) — the SQL the action
 * builds (DeptColumns load, RBAC probe, the auto-field catalog probe, the
 * UPDATE) still runs as written; we route each query by shape and return rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'u1', orgId: 'o1', client: { query: queryMock } }),
}));

// Avoid the Next request-store revalidate path throwing in node env.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updateFaCell } from '../update-fa-cell';
import { ValidationError } from '../errors';

/**
 * Route the action's queries by SQL shape. `autoColumns` is the set of column
 * keys the npd_field_catalog probe should report is_auto=true for.
 */
function wireQueries(opts: { deptCode: string; autoColumns: Set<string> }) {
  queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
    const text = String(sql);
    // 1) DeptColumns load (loadDeptColumn) — returns the dept that owns the col.
    if (/from\s+"Reference"\."DeptColumns"/i.test(text) && /lower\(column_key\)\s*=\s*\$1/i.test(text)) {
      const columnName = String(params?.[0] ?? '');
      return {
        rows: [
          {
            dept_code: opts.deptCode,
            column_key: columnName,
            data_type: 'text',
            field_type: 'string',
            dropdown_source: null,
            required_for_done: false,
          },
        ],
      };
    }
    // 2) RBAC probe — caller is permitted.
    if (/user_roles|role_permissions|permissions/i.test(text)) {
      return { rows: [{ ok: true }] };
    }
    // 3) Auto-field catalog probe (NEW) — npd_field_catalog is_auto=true?
    if (/npd_field_catalog/i.test(text)) {
      const code = String(params?.[0] ?? '');
      return { rows: opts.autoColumns.has(code) ? [{ ok: true }] : [] };
    }
    // 4) assertProductColumn (information_schema) — column exists on product.
    if (/information_schema\.columns/i.test(text)) {
      return { rows: [{ ok: true }] };
    }
    // 5) FOR UPDATE lock on items.
    if (/for\s+update/i.test(text)) {
      return { rows: [{ id: 'item-1' }] };
    }
    // 6) The product UPDATE CTE.
    if (/update\s+public\.product/i.test(text)) {
      return { rows: [{ previous_value: 'old', new_value: 'new', built_reset: false }] };
    }
    // set_config / outbox insert / anything else.
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  queryMock.mockReset();
});

describe('updateFaCell — auto-derived field guard (mig 374)', () => {
  it('rejects a write to an auto-derived column with READ_ONLY_COLUMN', async () => {
    wireQueries({ deptCode: 'Technical', autoColumns: new Set(['shelf_life_days']) });

    await expect(updateFaCell('FA0001', 'shelf_life_days', '14')).rejects.toBeInstanceOf(
      ValidationError,
    );

    // No product UPDATE was attempted (guard fires before the write).
    const ranUpdate = queryMock.mock.calls.some((c) =>
      /update\s+public\.product/i.test(String(c[0])),
    );
    expect(ranUpdate).toBe(false);
  });

  it('throws the READ_ONLY_COLUMN code for an auto field', async () => {
    wireQueries({ deptCode: 'Technical', autoColumns: new Set(['shelf_life_days']) });

    await expect(updateFaCell('FA0001', 'shelf_life_days', '14')).rejects.toMatchObject({
      code: 'READ_ONLY_COLUMN',
    });
  });

  it('blocks the auto field BEFORE assertProductColumn (no information_schema probe)', async () => {
    wireQueries({ deptCode: 'Technical', autoColumns: new Set(['shelf_life_days']) });

    await expect(updateFaCell('FA0001', 'shelf_life_days', '14')).rejects.toBeInstanceOf(
      ValidationError,
    );
    const probedProductColumn = queryMock.mock.calls.some((c) =>
      /information_schema\.columns/i.test(String(c[0])),
    );
    expect(probedProductColumn).toBe(false);
  });

  it('still updates a NON-auto column through to the product UPDATE', async () => {
    wireQueries({ deptCode: 'Core', autoColumns: new Set() });

    const result = await updateFaCell('FA0001', 'product_name', 'New Name');
    expect(result).toEqual({ previousValue: 'old', newValue: 'new', builtReset: false });

    const ranUpdate = queryMock.mock.calls.some((c) =>
      /update\s+public\.product/i.test(String(c[0])),
    );
    expect(ranUpdate).toBe(true);
  });
});
