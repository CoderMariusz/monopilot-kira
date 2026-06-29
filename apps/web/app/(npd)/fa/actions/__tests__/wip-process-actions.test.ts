import { afterEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

import { addWipProcess, updateWipProcess } from '../wip-process-actions';

const prodDetailId = '33333333-3333-4333-8333-333333333333';
const processId = '44444444-4444-4444-8444-444444444444';
const itemId = '55555555-5555-4555-8555-555555555555';

afterEach(() => {
  queryMock.mockReset();
});

describe('wip-process-actions WIP item linkage', () => {
  it('addWipProcess with creates_wip_item=true inserts an intermediate item and sets wip_item_id', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [{ id: processId }], rowCount: 1 };
      }
      if (/insert\s+into\s+public\.items/i.test(text)) {
        return { rows: [{ id: itemId }], rowCount: 1 };
      }
      if (/update\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    });

    const result = await addWipProcess({
      prodDetailId,
      processName: 'Cold Smoke',
      durationHours: 1,
      additionalCost: 0,
      createsWipItem: true,
    });

    expect(result).toEqual({ ok: true, id: processId });

    const itemInsert = queryMock.mock.calls.find((call) =>
      /insert\s+into\s+public\.items/i.test(String(call[0])),
    );
    expect(String(itemInsert?.[0])).toMatch(/item_type,\s*name,\s*origin_module,\s*status,\s*uom_base,\s*created_by/i);
    expect(itemInsert?.[1]).toEqual([
      'WIP-COLD-SMOKE-44444444',
      'Cold Smoke',
      '11111111-1111-4111-8111-111111111111',
    ]);

    const linkageUpdate = queryMock.mock.calls.find((call) =>
      /update\s+public\.npd_wip_processes/i.test(String(call[0])) &&
      /set\s+wip_item_id\s*=\s*\$2::uuid/i.test(String(call[0])),
    );
    expect(linkageUpdate?.[1]).toEqual([processId, itemId]);
  });

  it('updateWipProcess with creates_wip_item=false nulls wip_item_id and does not delete item', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/update\s+public\.npd_wip_processes/i.test(text)) {
        return {
          rows: [{ id: processId, process_name: 'Cold Smoke', creates_wip_item: false }],
          rowCount: 1,
        };
      }
      return { rows: [] };
    });

    const result = await updateWipProcess({ id: processId, createsWipItem: false });

    expect(result).toEqual({ ok: true, updated: true });

    const updateCall = queryMock.mock.calls.find((call) =>
      /update\s+public\.npd_wip_processes/i.test(String(call[0])),
    );
    expect(String(updateCall?.[0])).toMatch(/wip_item_id\s*=\s*case\s+when\s+\$5::boolean\s+is\s+false\s+then\s+null/i);
    expect(updateCall?.[1]).toEqual([processId, null, null, null, false]);

    const deletedItem = queryMock.mock.calls.some((call) =>
      /delete\s+from\s+public\.items/i.test(String(call[0])),
    );
    expect(deletedItem).toBe(false);
  });
});
