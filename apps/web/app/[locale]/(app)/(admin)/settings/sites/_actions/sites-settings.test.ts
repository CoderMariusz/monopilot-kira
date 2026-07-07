import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { updateSiteSettings } from './sites';

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
