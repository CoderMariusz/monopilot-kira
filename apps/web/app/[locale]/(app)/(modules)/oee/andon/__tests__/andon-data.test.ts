import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

let queryRows: Array<Record<string, unknown>>;

const client = {
  query: vi.fn(async () => ({ rows: queryRows, rowCount: queryRows.length })),
};

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { orgId: string; client: typeof client }) => Promise<unknown>) =>
      action({ orgId: ORG_ID, client }),
  ),
}));

import { getAllLinesLiveStatus } from '../andon-data';

beforeEach(() => {
  queryRows = [];
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
});
