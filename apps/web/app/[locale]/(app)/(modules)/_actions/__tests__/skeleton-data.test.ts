import { beforeEach, describe, expect, it, vi } from 'vitest';

// Run the action body with a fake in-transaction pg client — no DB required.
const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

type FakeCtx = {
  userId: string;
  orgId: string;
  sessionToken: string;
  client: { query: typeof queryMock };
};

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: FakeCtx) => unknown) =>
    action({ userId: 'user-1', orgId: 'org-1', sessionToken: 'tok-1', client: { query: queryMock } }),
}));

import { getModuleCount, getOrgSummary } from '../skeleton-data';

beforeEach(() => {
  queryMock.mockReset();
});

describe('getModuleCount', () => {
  it('returns an org-scoped count from the allowlisted, schema-qualified table', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 7 }] });

    const result = await getModuleCount('work_order');

    expect(result).toEqual({ ok: true, count: 7 });
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('from public.work_order'));
  });

  it('maps every allowlisted key to its public.* table', async () => {
    const cases: Array<[Parameters<typeof getModuleCount>[0], string]> = [
      ['bom_item', 'public.bom_item'],
      ['work_order', 'public.work_order'],
      ['quality_event', 'public.quality_event'],
      ['shipment', 'public.shipment'],
      ['lot', 'public.lot'],
      ['users', 'public.users'],
    ];

    for (const [key, qualified] of cases) {
      queryMock.mockReset();
      queryMock.mockResolvedValue({ rows: [{ n: 1 }] });
      await getModuleCount(key);
      expect(queryMock).toHaveBeenCalledWith(expect.stringContaining(`from ${qualified}`));
    }
  });

  it('treats a missing row as zero', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(getModuleCount('lot')).resolves.toEqual({ ok: true, count: 0 });
  });

  it('degrades to { ok: false } and logs when the read fails (no silent swallow)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queryMock.mockRejectedValue(new Error('connection refused'));

    const result = await getModuleCount('quality_event');

    expect(result).toEqual({ ok: false });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

describe('getOrgSummary', () => {
  it('counts all six metrics in one org-context transaction', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 4 }] });

    const summary = await getOrgSummary();

    expect(summary).toEqual({
      users: 4,
      workOrders: 4,
      lots: 4,
      qualityEvents: 4,
      shipments: 4,
      bomItems: 4,
    });
    expect(queryMock).toHaveBeenCalledTimes(6);
  });

  it('returns an all-null summary (not a throw) when the reads fail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queryMock.mockRejectedValue(new Error('pool exhausted'));

    const summary = await getOrgSummary();

    expect(summary).toEqual({
      users: null,
      workOrders: null,
      lots: null,
      qualityEvents: null,
      shipments: null,
      bomItems: null,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
