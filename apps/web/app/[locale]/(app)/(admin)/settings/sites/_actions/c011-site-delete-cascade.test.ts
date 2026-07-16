import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { deleteSite } from './sites';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type QueryHandler = (sql: string, params?: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount?: number };

function mockOrgContext(queryHandler: QueryHandler, canUpdate = true) {
  vi.mocked(withOrgContext).mockImplementation(async (fn) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
          if (/from public\.user_roles ur/i.test(sql)) {
            return canUpdate ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
          }
          return queryHandler(sql, params);
        }),
      },
    }),
  );
}

describe('C011 site delete cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cascades production line removal and deletes the site when no active work orders exist', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (/count\(\*\).*active_count/i.test(sql)) {
        return { rows: [{ active_count: 0 }], rowCount: 1 };
      }
      if (/select exists/i.test(sql) && /blocked/i.test(sql)) {
        return { rows: [{ blocked: false }], rowCount: 1 };
      }
      if (/delete from public\.sites/i.test(sql)) {
        return { rows: [{ id: SITE_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await deleteSite({ id: SITE_ID });

    expect(result).toEqual({ ok: true, data: { id: SITE_ID } });
    const lineDelete = calls.find((call) => /delete from public\.production_lines/i.test(call.sql));
    expect(lineDelete?.sql).toContain('org_id = app.current_org_id()');
    expect(lineDelete?.params?.[0]).toBe(SITE_ID);
    const warehouseDelete = calls.find((call) => /delete from public\.warehouses/i.test(call.sql));
    expect(warehouseDelete?.params?.[0]).toBe(SITE_ID);
    expect(calls.some((call) => /delete from public\.sites/i.test(call.sql))).toBe(true);
  });

  it('blocks site deletion when active work orders reference a line at the site', async () => {
    const calls: string[] = [];
    mockOrgContext((sql) => {
      calls.push(sql);
      if (/count\(\*\).*active_count/i.test(sql)) {
        return { rows: [{ active_count: 2 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await deleteSite({ id: SITE_ID });

    expect(result).toEqual({
      ok: false,
      error: 'has_dependents',
      message: 'This site has production lines with active work orders and cannot be deleted.',
    });
    expect(calls.some((sql) => /delete from public\.production_lines/i.test(sql))).toBe(false);
    expect(calls.some((sql) => /delete from public\.sites/i.test(sql))).toBe(false);
  });

  it('blocks site deletion when warehouses have dependents and performs no deletes', async () => {
    const calls: string[] = [];
    mockOrgContext((sql) => {
      calls.push(sql);
      if (/count\(\*\).*active_count/i.test(sql)) {
        return { rows: [{ active_count: 0 }], rowCount: 1 };
      }
      if (/select exists/i.test(sql) && /blocked/i.test(sql)) {
        return { rows: [{ blocked: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await deleteSite({ id: SITE_ID });

    expect(result).toEqual({
      ok: false,
      error: 'has_dependents',
      message: 'This site has warehouses with dependent records and cannot be deleted.',
    });
    expect(calls.some((sql) => /delete from public\.production_lines/i.test(sql))).toBe(false);
    expect(calls.some((sql) => /delete from public\.warehouses/i.test(sql))).toBe(false);
    expect(calls.some((sql) => /delete from public\.sites/i.test(sql))).toBe(false);

    const blockedIdx = calls.findIndex((sql) => /select exists/i.test(sql) && /blocked/i.test(sql));
    const lineDeleteIdx = calls.findIndex((sql) => /delete from public\.production_lines/i.test(sql));
    expect(blockedIdx).toBeGreaterThanOrEqual(0);
    expect(lineDeleteIdx).toBe(-1);
  });
});
