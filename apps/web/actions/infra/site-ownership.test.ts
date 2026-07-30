/**
 * F3 — `createWarehouse` / `upsertLine` must refuse a `site_id` that belongs to
 * ANOTHER organization. RLS only scopes `org_id`; the FK only proves the site
 * row exists (proven against monopilot_t2: both INSERTs went through and left a
 * cross-org reference behind). Both directions are asserted here: the own-org
 * site must still insert, so the guard cannot freeze the normal path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
/** Active site of the caller's org. */
const OWN_SITE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
/** Site of a DIFFERENT org — visible to nobody in this org context. */
const FOREIGN_SITE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NEW_WAREHOUSE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NEW_LINE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

vi.mock('../../lib/auth/with-org-context', () => ({ withOrgContext: vi.fn() }));
vi.mock('../../lib/auth/has-permission', () => ({ hasPermission: vi.fn(async () => true) }));
vi.mock('../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
vi.mock('./_shared/outbox', () => ({ writeSettingsInfraOutbox: vi.fn(async () => undefined) }));

import { withOrgContext } from '../../lib/auth/with-org-context';
import { createWarehouse } from './warehouse';
import { upsertLine } from './line';

type Row = Record<string, unknown>;
const executed: string[] = [];

/**
 * Fake RLS-bound client. The site lookup returns a row ONLY for OWN_SITE —
 * exactly what `select ... from public.sites where org_id = app.current_org_id()`
 * does for a foreign site id (zero rows).
 */
function mockContext(): void {
  vi.mocked(withOrgContext).mockImplementation(async (fn: (ctx: unknown) => Promise<unknown>) =>
    fn({
      userId: USER_ID,
      orgId: ORG_ID,
      client: {
        query: vi.fn(async (sql: string, params?: readonly unknown[]): Promise<{ rows: Row[]; rowCount: number }> => {
          executed.push(sql);
          const q = sql.replace(/\s+/g, ' ').toLowerCase();

          if (q.includes('from public.sites')) {
            const visible = String(params?.[0]) === OWN_SITE;
            return { rows: visible ? [{ id: OWN_SITE }] : [], rowCount: visible ? 1 : 0 };
          }
          if (q.startsWith('insert into public.warehouses')) {
            return { rows: [{ id: NEW_WAREHOUSE_ID, code: 'WH1', name: 'Warehouse', site_id: String(params?.[0]) }], rowCount: 1 };
          }
          if (q.startsWith('insert into public.production_lines')) {
            return { rows: [{ id: NEW_LINE_ID, code: 'LINE1', name: 'Line', status: 'draft', default_location_id: null }], rowCount: 1 };
          }
          // No duplicate line code, no warehouse/location lookups needed here.
          return { rows: [], rowCount: 0 };
        }),
      },
    }),
  );
}

const inserted = (table: string): boolean =>
  executed.some((sql) => new RegExp(`insert into public\\.${table}`, 'i').test(sql));

describe('F3 — site_id from another organization is refused server-side', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executed.length = 0;
    mockContext();
  });

  it('createWarehouse rejects a foreign-org site and never reaches the INSERT', async () => {
    const result = await createWarehouse({ code: 'XORG', name: 'Cross-org warehouse', site_id: FOREIGN_SITE, address: null });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(inserted('warehouses')).toBe(false);
  });

  it('createWarehouse still accepts the org\'s own site', async () => {
    const result = await createWarehouse({ code: 'OWN', name: 'Own warehouse', site_id: OWN_SITE, address: null });

    expect(result).toMatchObject({ ok: true, data: { id: NEW_WAREHOUSE_ID, site_id: OWN_SITE } });
    expect(inserted('warehouses')).toBe(true);
  });

  it('upsertLine rejects a foreign-org site and never reaches the INSERT', async () => {
    const result = await upsertLine({ siteId: FOREIGN_SITE, code: 'XORGLINE', name: 'Cross-org line', status: 'draft' });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(inserted('production_lines')).toBe(false);
  });

  it('upsertLine still accepts the org\'s own site', async () => {
    const result = await upsertLine({ siteId: OWN_SITE, code: 'OWNLINE', name: 'Own line', status: 'draft' });

    expect(result).toEqual({ ok: true, data: { id: NEW_LINE_ID, status: 'draft' } });
    expect(inserted('production_lines')).toBe(true);
  });

  it('upsertLine still accepts a site-less line (org-wide line stays creatable)', async () => {
    const result = await upsertLine({ siteId: null, code: 'NOSITE', name: 'Org-wide line', status: 'draft' });

    expect(result).toEqual({ ok: true, data: { id: NEW_LINE_ID, status: 'draft' } });
    expect(inserted('production_lines')).toBe(true);
  });
});
