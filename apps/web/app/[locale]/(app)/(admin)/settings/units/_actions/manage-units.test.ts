import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { createUnit, softDeleteUnit, updateUnit } from './manage-units';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNIT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type QueryHandler = (sql: string, params?: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount?: number };

/** A node-postgres style error: an Error carrying a SQLSTATE `code`. */
function pgError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

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

  it('createUnit rejects zero or negative factorToBase before any DB write', async () => {
    mockOrgContext(() => ({ rows: [], rowCount: 0 }));

    await expect(createUnit({ category: 'mass', code: 'z', name: 'Zero', factorToBase: 0, isBase: false })).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
      subcode: 'factor_positive',
    });
    await expect(createUnit({ category: 'mass', code: 'n', name: 'Negative', factorToBase: -1, isBase: false })).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
      subcode: 'factor_positive',
    });
    expect(withOrgContext).not.toHaveBeenCalled();
  });

  it('createUnit persists a valid unit and revalidates after commit', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (/insert into public\.unit_of_measure/i.test(sql)) {
        return { rows: [{ id: UNIT_ID }], rowCount: 1 };
      }
      if (/insert into public\.audit_log/i.test(sql) || /insert into public\.outbox_events/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createUnit({
      category: 'mass',
      code: 'lb',
      name: 'Pound',
      factorToBase: 2.5,
      isBase: false,
    });

    expect(result).toEqual({ ok: true, data: { id: UNIT_ID, code: 'lb', category: 'mass' } });
    const insert = calls.find((call) => /insert into public\.unit_of_measure/i.test(call.sql));
    expect(insert?.params).toEqual([ORG_ID, 'mass', 'lb', 'Pound', 2.5, false]);
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
      subcode: 'unit_in_use',
      context: { code: 'kg' },
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

  // ── Error mapping (FALA-05 / T3) ──────────────────────────────────────────
  // Postgres raises SQLSTATE 23514 (check_violation) for
  // `no partition of relation "audit_log" found for row` — the SAME code as a
  // real CHECK failure. Before the fix, the 23514 branch ran first and the
  // partition branch below it was unreachable, so an audit-log outage was
  // reported to the administrator as a bad conversion factor.

  it('reports a missing audit_log partition as an audit failure, not a conversion-factor error', async () => {
    mockOrgContext((sql) => {
      if (/insert into public\.unit_of_measure/i.test(sql)) return { rows: [{ id: UNIT_ID }], rowCount: 1 };
      if (/insert into public\.audit_log/i.test(sql)) {
        throw pgError('23514', 'no partition of relation "audit_log" found for row');
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createUnit({ category: 'mass', code: 'lb', name: 'Pound', factorToBase: 2.5, isBase: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('persistence_failed');
      expect(result.subcode).toBe('audit_partition_missing');
    }
  });

  it('still reports a genuine CHECK violation (23514) as an invalid conversion factor', async () => {
    mockOrgContext((sql) => {
      if (/insert into public\.unit_of_measure/i.test(sql)) {
        throw Object.assign(new Error('new row violates check constraint "unit_of_measure_factor_positive"'), {
          code: '23514',
          constraint: 'unit_of_measure_factor_positive',
        });
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createUnit({ category: 'mass', code: 'lb', name: 'Pound', factorToBase: 2.5, isBase: false });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      subcode: 'factor_positive',
    });
  });

  it('softDeleteUnit surfaces a missing audit_log partition as audit_partition_missing', async () => {
    mockOrgContext((sql) => {
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
      if (/insert into public\.audit_log/i.test(sql)) {
        throw pgError('23514', 'no partition of relation "audit_log" found for row');
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await softDeleteUnit({ id: UNIT_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.subcode).toBe('audit_partition_missing');
  });

  it('maps an unrecognized 23503 to persistence_failed, not in_use', async () => {
    mockOrgContext((sql) => {
      if (/insert into public\.unit_of_measure/i.test(sql)) return { rows: [{ id: UNIT_ID }], rowCount: 1 };
      if (/insert into public\.audit_log/i.test(sql)) {
        throw Object.assign(new Error('insert violates foreign key constraint'), {
          code: '23503',
          constraint: 'audit_log_actor_user_id_fkey',
        });
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createUnit({ category: 'mass', code: 'lb', name: 'Pound', factorToBase: 2.5, isBase: false });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
  });

  it('updateUnit returns name_required subcode for an empty name', async () => {
    mockOrgContext(() => ({ rows: [], rowCount: 0 }));
    const result = await updateUnit({ id: UNIT_ID, name: '' });

    expect(result).toEqual({ ok: false, error: 'invalid_input', subcode: 'name_required' });
  });

  const SUBCODE_I18N_KEYS = [
    'errorNameRequired',
    'errorAuditPartitionMissing',
    'errorCannotDeleteBase',
    'errorInvalidUnitId',
    'errorInUseWithCode',
    'errorConversionLabelRequired',
    'errorConversionFactorPositive',
  ] as const;

  it('defines action-error subcode labels in all four locales', () => {
    const locales = ['en', 'pl', 'ro', 'uk'] as const;
    for (const locale of locales) {
      const json = JSON.parse(readFileSync(join(process.cwd(), 'i18n', `${locale}.json`), 'utf8')) as {
        settings?: { units?: Record<string, string> };
      };
      const units = json.settings?.units;
      expect(units, `${locale}: settings.units namespace`).toBeDefined();
      for (const key of SUBCODE_I18N_KEYS) {
        expect(units?.[key], `${locale}.settings.units.${key}`).toBeTruthy();
      }
    }
  });
});
