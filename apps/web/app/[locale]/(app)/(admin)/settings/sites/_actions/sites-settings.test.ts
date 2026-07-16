import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('../../../../../../../actions/infra/line', () => ({
  upsertLine: vi.fn(),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { upsertLine } from '../../../../../../../actions/infra/line';
import { deleteSite, renameSite, updateLine, updateSiteSettings } from './sites';

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

describe('settings/sites updateSiteSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists site settings for the caller org', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (/update public\.sites/i.test(sql) && /returning/i.test(sql)) {
        return {
          rows: [
            {
              id: SITE_ID,
              org_id: ORG_ID,
              site_code: 'KRK',
              name: 'Kraków HQ',
              is_default: true,
              country: 'Poland',
              address_text: 'ul. Wadowicka 3, Kraków',
              latitude: null,
              longitude: null,
              map_x: '50',
              map_y: '50',
              operating_hours: 'Mon-Fri 07:00-21:00',
              haccp_enabled: true,
              haccp_valid_until: '2027-01-01',
              line_count: '0',
              worker_count: '0',
              is_active: true,
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await updateSiteSettings(ORG_ID, SITE_ID, {
      primary: true,
      operating_hours: 'Mon-Fri 07:00-21:00',
      haccp_enabled: true,
      haccp_valid_until: '2027-01-01',
    });

    expect(result.ok).toBe(true);
    const update = calls.find((call) => /update public\.sites/i.test(call.sql) && /returning/i.test(call.sql));
    expect(update?.sql).toContain('org_id = app.current_org_id()');
    expect(update?.params?.[0]).toBe(ORG_ID);
    expect(update?.params?.[1]).toBe(SITE_ID);
  });

  it('returns forbidden without settings.org.update', async () => {
    mockOrgContext(() => ({ rows: [], rowCount: 0 }), false);
    const result = await updateSiteSettings(ORG_ID, SITE_ID, { operating_hours: 'Mon-Fri 08:00-18:00' });
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('settings/sites lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes inactive through to the line writer unchanged', async () => {
    mockOrgContext((sql) => {
      if (/from public\.production_lines pl/i.test(sql)) {
        return { rows: [{ warehouse_id: null, default_output_location_id: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    vi.mocked(upsertLine).mockResolvedValue({ ok: true, data: { id: SITE_ID, status: 'inactive' } });

    await updateLine({
      id: SITE_ID,
      site_id: SITE_ID,
      code: 'L1',
      name: 'Line 1',
      status: 'inactive',
    });

    expect(upsertLine).toHaveBeenCalledWith(expect.objectContaining({ status: 'inactive' }));
  });

  it('renames a site with an org-scoped update', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    mockOrgContext((sql, params) => {
      calls.push({ sql, params });
      if (/update public\.sites/i.test(sql)) {
        return { rows: [{ id: SITE_ID, name: 'Kraków Central' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await renameSite({ id: SITE_ID, name: 'Kraków Central' });

    expect(result).toEqual({ ok: true, data: { id: SITE_ID, name: 'Kraków Central' } });
    const update = calls.find((call) => /update public\.sites/i.test(call.sql));
    expect(update?.sql).toContain('org_id = app.current_org_id()');
  });

  it('cascades line removal and deletes the site when only production lines block deletion', async () => {
    const calls: string[] = [];
    mockOrgContext((sql) => {
      calls.push(sql);
      if (/count\(\*\).*active_count/i.test(sql)) return { rows: [{ active_count: 0 }], rowCount: 1 };
      if (/select exists/i.test(sql) && /blocked/i.test(sql)) return { rows: [{ blocked: false }], rowCount: 1 };
      if (/delete from public\.sites/i.test(sql)) return { rows: [{ id: SITE_ID }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const result = await deleteSite({ id: SITE_ID });

    expect(result).toEqual({ ok: true, data: { id: SITE_ID } });
    expect(calls.some((sql) => /delete from public\.production_lines/i.test(sql))).toBe(true);
    expect(calls.some((sql) => /delete from public\.sites/i.test(sql))).toBe(true);
  });
});
