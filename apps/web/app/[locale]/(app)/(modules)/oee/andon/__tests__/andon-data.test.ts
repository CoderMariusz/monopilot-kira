import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '22222222-2222-4222-8222-222222222222';

let queryRows: Array<Record<string, unknown>>;
let boundSiteId: string | null = SITE_ID;
let actionReceivedSiteId: string | null | undefined;

const client = {
  query: vi.fn(async () => ({ rows: queryRows, rowCount: queryRows.length })),
};

vi.mock('../../../../../../../lib/auth/with-site-context', () => ({
  withSiteContext: vi.fn(
    async (
      arg1: unknown,
      arg2?: (ctx: { orgId: string; siteId: string | null; client: typeof client }) => Promise<unknown>,
    ) => {
      const action = typeof arg1 === 'function' ? arg1 : arg2;
      if (!action) throw new TypeError('withSiteContext mock: missing action');
      actionReceivedSiteId = boundSiteId;
      return action({ orgId: ORG_ID, siteId: boundSiteId, client });
    },
  ),
}));

import { getAllLinesLiveStatus } from '../andon-data';

beforeEach(() => {
  queryRows = [];
  boundSiteId = SITE_ID;
  actionReceivedSiteId = undefined;
  client.query.mockClear();
});

describe('andon-data', () => {
  it('maps summed qty_kg output into goodKg and scrapKg fields', async () => {
    queryRows = [
      {
        id: 'line-1',
        line_code: 'LINE-01',
        line_name: 'Primary packing',
        line_status: 'active',
        wo_number: 'WO-1001',
        product_name: 'Smoked salmon pack',
        runtime_status: 'in_progress',
        good_kg: '128.5',
        scrap_kg: '3.25',
        oee_percent: '87.4',
        last_activity_at: '2026-06-23T10:15:00.000Z',
      },
    ];

    const lines = await getAllLinesLiveStatus('current');

    expect(lines).toEqual([
      expect.objectContaining({
        lineCode: 'LINE-01',
        goodKg: 128.5,
        scrapKg: 3.25,
      }),
    ]);
    expect(lines[0]).not.toHaveProperty('goodCount');
    expect(lines[0]).not.toHaveProperty('scrapCount');
  });

  it('scopes line reads to the active site when a site is bound', async () => {
    boundSiteId = SITE_ID;
    await getAllLinesLiveStatus('current');
    expect(actionReceivedSiteId).toBe(SITE_ID);
    const sql = String(client.query.mock.calls[0]?.[0] ?? '').replace(/\s+/g, ' ').toLowerCase();
    expect(sql).toContain('app.current_site_id()');
    expect(sql).toContain('coalesce(w.site_id, pl.site_id) = app.current_site_id()');
    expect(sql).toContain('pl.site_id = app.current_site_id()');
  });

  it('allows all visible sites when all-sites mode is bound', async () => {
    boundSiteId = null;
    await getAllLinesLiveStatus('current');
    expect(actionReceivedSiteId).toBeNull();
    const sql = String(client.query.mock.calls[0]?.[0] ?? '').replace(/\s+/g, ' ').toLowerCase();
    expect(sql).toContain('app.current_site_id() is null');
    expect(client.query).toHaveBeenCalled();
  });
});
