import { beforeEach, describe, expect, it, vi } from 'vitest';

const LINE_ID = '11111111-1111-4111-8111-111111111111';
const WO_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '33333333-3333-4333-8333-333333333333';

const { getActiveSiteIdMock } = vi.hoisted(() => ({
  getActiveSiteIdMock: vi.fn(),
}));

const query = vi.fn(async (sql: string) => {
  if (sql.includes('from public.scheduler_config')) {
    return {
      rows: [{ line_id: null, default_horizon_days: 1, capacity_hours_per_day: '8' }],
    };
  }
  if (sql.includes('from public.production_lines pl')) {
    return { rows: [{ id: LINE_ID, code: 'LINE-01', name: 'Line One' }] };
  }
  if (sql.includes('from public.work_orders wo')) {
    return {
      rows: Array.from({ length: 5 }, () => ({
        line_id: LINE_ID,
        start_at: '2026-07-15T13:00:00.000Z',
        end_at: '2026-07-15T14:00:00.000Z',
        source: 'draft',
        alternative_key: WO_ID,
      })),
    };
  }
  throw new Error(`Unexpected query: ${sql}`);
});

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '44444444-4444-4444-8444-444444444444',
      orgId: '55555555-5555-4555-8555-555555555555',
      client: { query },
    }),
  ),
}));

vi.mock('../../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: getActiveSiteIdMock,
}));

vi.mock('../../../planning/work-orders/_actions/shared', () => ({
  hasPermission: vi.fn(async () => true),
}));

import { loadSchedulerCapacity } from './capacity-loaders';

describe('loadSchedulerCapacity', () => {
  beforeEach(() => {
    query.mockClear();
    getActiveSiteIdMock.mockResolvedValue(SITE_ID);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
  });

  it('counts mutually exclusive draft variants for the same WO once', async () => {
    const result = await loadSchedulerCapacity();
    const occupancySql = query.mock.calls.find(([sql]) =>
      sql.includes('from public.work_orders wo'),
    )?.[0];

    expect(occupancySql).toContain('select line_id, start_at, end_at, source, alternative_key');
    expect(result.ok && result.lines[0]?.days[0]?.sourceDraftHours).toBe(1);
  });

  it('scopes production lines and occupancy to the active site (null = all sites)', async () => {
    getActiveSiteIdMock.mockResolvedValueOnce(SITE_ID);

    await loadSchedulerCapacity();

    const linesSql = query.mock.calls.find(([sql]) =>
      sql.includes('from public.production_lines pl'),
    )?.[0];
    expect(linesSql).toContain('$1::uuid is null or pl.site_id = $1::uuid');
    expect(query.mock.calls.find(([sql]) => sql.includes('from public.production_lines pl'))?.[1]).toEqual([
      SITE_ID,
    ]);

    const occupancySql = query.mock.calls.find(([sql]) => sql.includes('from public.work_orders wo'))?.[0];
    expect(occupancySql).toContain('$3::uuid is null or pl.site_id = $3::uuid');
    expect(query.mock.calls.find(([sql]) => sql.includes('from public.work_orders wo'))?.[1]).toEqual(
      expect.arrayContaining([SITE_ID]),
    );

    getActiveSiteIdMock.mockResolvedValueOnce(null);
    query.mockClear();

    await loadSchedulerCapacity();

    expect(query.mock.calls.find(([sql]) => sql.includes('from public.production_lines pl'))?.[1]).toEqual([
      null,
    ]);
    expect(query.mock.calls.find(([sql]) => sql.includes('from public.work_orders wo'))?.[1]?.[2]).toBeNull();
  });
});
