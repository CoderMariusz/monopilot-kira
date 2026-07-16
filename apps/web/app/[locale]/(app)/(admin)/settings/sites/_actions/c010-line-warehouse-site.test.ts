import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_SITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_SITE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const WAREHOUSE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('../../../../../../../actions/infra/_shared/outbox', () => ({
  writeSettingsInfraOutbox: vi.fn(async () => undefined),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { upsertLine } from '../../../../../../../actions/infra/line';

type QueryHandler = (sql: string, params?: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount?: number };

function mockOrgContext(queryHandler: QueryHandler) {
  vi.mocked(withOrgContext).mockImplementation(async (fn) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: vi.fn(async (sql: string, params?: readonly unknown[]) => queryHandler(sql, params)),
      },
    }),
  );
}

describe('C010 line warehouse site invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a cross-site warehouse assignment before insert', async () => {
    const calls: string[] = [];
    mockOrgContext((sql) => {
      calls.push(sql);
      if (/from public\.warehouses/i.test(sql)) {
        return { rows: [{ id: WAREHOUSE_ID, site_id: OTHER_SITE_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await upsertLine({
      siteId: LINE_SITE_ID,
      warehouseId: WAREHOUSE_ID,
      code: 'LINE-X',
      name: 'Cross-site line',
      status: 'draft',
    });

    expect(result).toEqual({ ok: false, error: 'warehouse_site_mismatch' });
    expect(calls.some((sql) => /insert into public\.production_lines/i.test(sql))).toBe(false);
  });

  it('rejects a site-bound line paired with an org-wide warehouse (site A / NULL)', async () => {
    const calls: string[] = [];
    mockOrgContext((sql) => {
      calls.push(sql);
      if (/from public\.warehouses/i.test(sql)) {
        return { rows: [{ id: WAREHOUSE_ID, site_id: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await upsertLine({
      siteId: LINE_SITE_ID,
      warehouseId: WAREHOUSE_ID,
      code: 'LINE-Y',
      name: 'Org-wide warehouse on site line',
      status: 'draft',
    });

    expect(result).toEqual({ ok: false, error: 'warehouse_site_mismatch' });
    expect(calls.some((sql) => /insert into public\.production_lines/i.test(sql))).toBe(false);
  });

  it('rejects a site-less line paired with a site-bound warehouse (NULL / site A)', async () => {
    const calls: string[] = [];
    mockOrgContext((sql) => {
      calls.push(sql);
      if (/from public\.warehouses/i.test(sql)) {
        return { rows: [{ id: WAREHOUSE_ID, site_id: LINE_SITE_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await upsertLine({
      siteId: null,
      warehouseId: WAREHOUSE_ID,
      code: 'LINE-Z',
      name: 'Site warehouse on org-wide line',
      status: 'draft',
    });

    expect(result).toEqual({ ok: false, error: 'warehouse_site_mismatch' });
    expect(calls.some((sql) => /insert into public\.production_lines/i.test(sql))).toBe(false);
  });

  it('allows a site-less line paired with an org-wide warehouse (NULL / NULL)', async () => {
    const calls: string[] = [];
    mockOrgContext((sql) => {
      calls.push(sql);
      if (/from public\.warehouses/i.test(sql)) {
        return { rows: [{ id: WAREHOUSE_ID, site_id: null }], rowCount: 1 };
      }
      if (/insert into public\.production_lines/i.test(sql)) {
        return {
          rows: [{ id: '11111111-1111-4111-8111-111111111111', code: 'LINE-NULL', name: 'Org-wide line', status: 'draft', default_output_location_id: null }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await upsertLine({
      siteId: null,
      warehouseId: WAREHOUSE_ID,
      code: 'LINE-NULL',
      name: 'Org-wide line',
      status: 'draft',
    });

    expect(result).toEqual({ ok: true, data: { id: '11111111-1111-4111-8111-111111111111', status: 'draft' } });
    expect(calls.some((sql) => /insert into public\.production_lines/i.test(sql))).toBe(true);
  });
});
