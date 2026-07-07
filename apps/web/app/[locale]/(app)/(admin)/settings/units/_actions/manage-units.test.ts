import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { softDeleteUnit, updateUnit } from './manage-units';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNIT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type QueryHandler = (sql: string, params?: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount?: number };

function mockOrgContext(queryHandler: QueryHandler, canManage = true) {
  vi.mocked(withOrgContext).mockImplementation(async (fn) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
          if (/from public\.user_roles ur/i.test(sql) && /role_permissions/i.test(sql)) {
            return canManage ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
          }
          return queryHandler(sql, params);
        }),
      },
    }),
  );
}

describe('manage-units actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updateUnit persists name only under org scope (factor_to_base immutable)', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (/from public\.unit_of_measure/i.test(sql) && /deleted_at is null/i.test(sql) && /limit 1/i.test(sql)) {
        return {
          rows: [{ id: UNIT_ID, code: 'g', name: 'Gram', factor_to_base: '0.001', is_base: false }],
          rowCount: 1,
        };
      }
      if (/update public\.unit_of_measure/i.test(sql)) {
        return {
          rows: [{ id: UNIT_ID, code: 'g', name: 'Gram (edited)', factor_to_base: '0.001' }],
          rowCount: 1,
        };
      }
      if (/insert into public\.audit_log/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await updateUnit({ id: UNIT_ID, name: 'Gram (edited)' });

    expect(result).toEqual({
      ok: true,
      data: { id: UNIT_ID, code: 'g', name: 'Gram (edited)', factorToBase: 0.001 },
    });
    const update = calls.find((call) => /update public\.unit_of_measure/i.test(call.sql));
    expect(update?.sql).toContain('org_id = app.current_org_id()');
    expect(update?.sql).not.toMatch(/factor_to_base\s*=/);
    expect(update?.params).toEqual([UNIT_ID, 'Gram (edited)']);
  });

  it('updateUnit ignores factorToBase in raw input (factor unchanged in DB)', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (/from public\.unit_of_measure/i.test(sql) && /deleted_at is null/i.test(sql) && /limit 1/i.test(sql)) {
        return {
          rows: [{ id: UNIT_ID, code: 'g', name: 'Gram', factor_to_base: '0.001', is_base: false }],
          rowCount: 1,
        };
      }
      if (/update public\.unit_of_measure/i.test(sql)) {
        return {
          rows: [{ id: UNIT_ID, code: 'g', name: 'Gram (edited)', factor_to_base: '0.001' }],
          rowCount: 1,
        };
      }
      if (/insert into public\.audit_log/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await updateUnit({ id: UNIT_ID, name: 'Gram (edited)', factorToBase: 0.999 } as never);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.factorToBase).toBe(0.001);
    }
    const update = calls.find((call) => /update public\.unit_of_measure/i.test(call.sql));
    expect(update?.params).toEqual([UNIT_ID, 'Gram (edited)']);
  });

  it('updateUnit returns forbidden without settings.units.manage', async () => {
    mockOrgContext(() => ({ rows: [], rowCount: 0 }), false);
    const result = await updateUnit({ id: UNIT_ID, name: 'Gram' });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('softDeleteUnit soft-deletes when the unit is not referenced', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (/from public\.unit_of_measure/i.test(sql) && /deleted_at is null/i.test(sql) && /limit 1/i.test(sql)) {
        return {
          rows: [{ id: UNIT_ID, code: 'g', name: 'Gram', factor_to_base: '0.001', is_base: false }],
          rowCount: 1,
        };
      }
      if (/select exists/i.test(sql)) return { rows: [{ in_use: false }], rowCount: 1 };
      if (/update public\.unit_of_measure/i.test(sql) && /deleted_at = now/i.test(sql)) {
        return { rows: [{ id: UNIT_ID }], rowCount: 1 };
      }
      if (/insert into public\.audit_log/i.test(sql) || /insert into public\.outbox_events/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await softDeleteUnit({ id: UNIT_ID });
    expect(result).toEqual({ ok: true, data: { id: UNIT_ID } });
    const inUseQuery = calls.find((call) => /select exists/i.test(call.sql));
    expect(inUseQuery?.sql).toContain('public.bom_lines');
    expect(inUseQuery?.sql).toContain('public.purchase_order_lines');
    expect(inUseQuery?.sql).toContain('public.wo_outputs');
    expect(inUseQuery?.sql).toContain('public.license_plates');
    expect(inUseQuery?.sql).toContain('public.stock_moves');
  });

  it('softDeleteUnit blocks delete when the unit code is in use', async () => {
    mockOrgContext((sql) => {
      if (/from public\.unit_of_measure/i.test(sql) && /deleted_at is null/i.test(sql) && /limit 1/i.test(sql)) {
        return {
          rows: [{ id: UNIT_ID, code: 'kg', name: 'Kilogram', factor_to_base: '1', is_base: false }],
          rowCount: 1,
        };
      }
      if (/select exists/i.test(sql)) return { rows: [{ in_use: true }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await softDeleteUnit({ id: UNIT_ID });
    expect(result).toEqual({
      ok: false,
      error: 'in_use',
      message: 'Unit "kg" is referenced elsewhere and cannot be deleted.',
    });
  });

  it('softDeleteUnit blocks delete when referenced by bom_lines', async () => {
    mockOrgContext((sql, params) => {
      if (/from public\.unit_of_measure/i.test(sql) && /deleted_at is null/i.test(sql) && /limit 1/i.test(sql)) {
        return {
          rows: [{ id: UNIT_ID, code: 'kg', name: 'Kilogram', factor_to_base: '1', is_base: false }],
          rowCount: 1,
        };
      }
      if (/select exists/i.test(sql) && /public\.bom_lines/i.test(sql)) {
        expect(params).toEqual(['kg']);
        return { rows: [{ in_use: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await softDeleteUnit({ id: UNIT_ID });
    expect(result).toMatchObject({ ok: false, error: 'in_use' });
  });

  it('softDeleteUnit blocks delete when referenced by purchase_order_lines', async () => {
    mockOrgContext((sql, params) => {
      if (/from public\.unit_of_measure/i.test(sql) && /deleted_at is null/i.test(sql) && /limit 1/i.test(sql)) {
        return {
          rows: [{ id: UNIT_ID, code: 'pcs', name: 'Piece', factor_to_base: '1', is_base: false }],
          rowCount: 1,
        };
      }
      if (/select exists/i.test(sql) && /public\.purchase_order_lines/i.test(sql)) {
        expect(params).toEqual(['pcs']);
        return { rows: [{ in_use: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await softDeleteUnit({ id: UNIT_ID });
    expect(result).toMatchObject({ ok: false, error: 'in_use' });
  });

  it('softDeleteUnit returns forbidden without settings.units.manage', async () => {
    mockOrgContext(() => ({ rows: [], rowCount: 0 }), false);
    const result = await softDeleteUnit({ id: UNIT_ID });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });
});
