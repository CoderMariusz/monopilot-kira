import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const nextEntityCodeMock = vi.fn();

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

vi.mock('../../../../../lib/documents/code-mask', () => ({
  nextEntityCode: (...args: unknown[]) => nextEntityCodeMock(...args),
}));

import { addWipProcess, updateWipProcess } from '../wip-process-actions';

const prodDetailId = '33333333-3333-4333-8333-333333333333';
const processId = '44444444-4444-4444-8444-444444444444';
const itemId = '55555555-5555-4555-8555-555555555555';
const existingItemId = '66666666-6666-4666-8666-666666666666';

afterEach(() => {
  queryMock.mockReset();
  nextEntityCodeMock.mockReset();
});

beforeEach(() => {
  nextEntityCodeMock.mockResolvedValue('WIP-20260702-0001');
});

describe('wip-process-actions WIP item linkage', () => {
  it('addWipProcess with creates_wip_item=true mints a code via nextEntityCode and links the item', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [{ id: processId }], rowCount: 1 };
      }
      if (/select\s+wip_item_id/i.test(text)) return { rows: [{ wip_item_id: null }] };
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
    expect(nextEntityCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ query: queryMock }),
      '22222222-2222-4222-8222-222222222222',
      'wip',
    );

    const itemInsert = queryMock.mock.calls.find((call) =>
      /insert\s+into\s+public\.items/i.test(String(call[0])),
    );
    expect(itemInsert?.[1]?.[0]).toBe('WIP-20260702-0001');
    expect(itemInsert?.[1]).toEqual(['WIP-20260702-0001', 'Cold Smoke', '11111111-1111-4111-8111-111111111111']);
  });

  it('ensureWipItem returns an existing linked item without minting a new code', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [{ id: processId }], rowCount: 1 };
      }
      if (/select\s+wip_item_id/i.test(text)) return { rows: [{ wip_item_id: existingItemId }] };
      if (/from\s+public\.items/i.test(text) && /id\s*=\s*\$1::uuid/i.test(text)) {
        return { rows: [{ id: existingItemId }] };
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
    expect(nextEntityCodeMock).not.toHaveBeenCalled();
    expect(queryMock.mock.calls.some((call) => /insert\s+into\s+public\.items/i.test(String(call[0])))).toBe(false);
  });

  it('throws when the process linkage update affects zero rows', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [{ id: processId }], rowCount: 1 };
      }
      if (/select\s+wip_item_id/i.test(text)) return { rows: [{ wip_item_id: null }] };
      if (/insert\s+into\s+public\.items/i.test(text)) {
        return { rows: [{ id: itemId }], rowCount: 1 };
      }
      if (/update\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });

    await expect(
      addWipProcess({
        prodDetailId,
        processName: 'Cold Smoke',
        durationHours: 1,
        additionalCost: 0,
        createsWipItem: true,
      }),
    ).rejects.toThrow('Could not link WIP item to process');
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
