/**
 * C5 — updateFaCell identity-field denylist (no DB).
 *
 * Mocks withOrgContext so we can assert that an UPDATE targeting an identity
 * column (product_code, base_uom, output_uom, category) is REJECTED with
 * ValidationError('IDENTITY_COLUMN_IMMUTABLE') and that NO product UPDATE runs.
 * Identity is set once at creation; this action must never re-key it (a
 * product_code change would fan down to items.item_code via the mig-359 trigger).
 * A non-identity field still flows through to the product UPDATE unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'u1', orgId: 'o1', client: { query: queryMock } }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updateFaCell } from '../update-fa-cell';
import { ValidationError } from '../errors';

/** Route the action's queries by SQL shape — a permitted caller, no auto columns. */
function wireQueries(opts: { deptCode: string }) {
  queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
    const text = String(sql);
    if (
      /from\s+public\.npd_departments\s+d/i.test(text) &&
      /join\s+public\.npd_department_field\s+df/i.test(text) &&
      /join\s+public\.npd_field_catalog\s+f/i.test(text) &&
      /lower\(f\.code\)\s*=\s*lower\(\$1::text\)/i.test(text)
    ) {
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
    if (/user_roles|role_permissions|permissions/i.test(text)) {
      return { rows: [{ ok: true }] };
    }
    if (/from\s+public\.npd_field_catalog\s+f/i.test(text) && /f\.is_auto\s*=\s*true/i.test(text)) {
      return { rows: [] };
    }
    if (/information_schema\.columns/i.test(text)) {
      return { rows: [{ ok: true }] };
    }
    if (/for\s+update/i.test(text)) {
      return { rows: [{ id: 'item-1' }] };
    }
    if (/update\s+public\.product/i.test(text)) {
      return { rows: [{ previous_value: 'old', new_value: 'new', built_reset: false }] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  queryMock.mockReset();
});

describe('updateFaCell — identity-field denylist (C5)', () => {
  it('rejects a write to product_code with IDENTITY_COLUMN_IMMUTABLE and runs no UPDATE', async () => {
    wireQueries({ deptCode: 'Core' });

    await expect(updateFaCell('FA0001', 'product_code', 'FA9999')).rejects.toMatchObject({
      code: 'IDENTITY_COLUMN_IMMUTABLE',
    });
    await expect(updateFaCell('FA0001', 'product_code', 'FA9999')).rejects.toBeInstanceOf(
      ValidationError,
    );

    // No product UPDATE was attempted (guard fires before the write) — the
    // product_code rename that would fan down to items.item_code is blocked.
    const ranUpdate = queryMock.mock.calls.some((c) =>
      /update\s+public\.product/i.test(String(c[0])),
    );
    expect(ranUpdate).toBe(false);
  });

  it('blocks product_code BEFORE assertProductColumn (no information_schema probe)', async () => {
    wireQueries({ deptCode: 'Core' });
    await expect(updateFaCell('FA0001', 'product_code', 'FA9999')).rejects.toBeInstanceOf(
      ValidationError,
    );
    const probed = queryMock.mock.calls.some((c) =>
      /information_schema\.columns/i.test(String(c[0])),
    );
    expect(probed).toBe(false);
  });

  it('still updates a NON-identity column through to the product UPDATE', async () => {
    wireQueries({ deptCode: 'Core' });

    const result = await updateFaCell('FA0001', 'product_name', 'New Name');
    expect(result).toEqual({ previousValue: 'old', newValue: 'new', builtReset: false });

    const ranUpdate = queryMock.mock.calls.some((c) =>
      /update\s+public\.product/i.test(String(c[0])),
    );
    expect(ranUpdate).toBe(true);
  });
});
