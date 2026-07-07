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

import { addWipProcess, removeWipProcess, saveWipProcessRoles, updateWipProcess } from '../wip-process-actions';

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
      if (/select\s+p\.wip_item_id/i.test(text)) {
        return {
          rows: [{
            wip_item_id: null,
            wip_definition_id: null,
            definition_item_id: null,
            definition_base_uom: null,
            definition_name: null,
          }],
        };
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
    const processInsert = queryMock.mock.calls.find((call) =>
      /insert\s+into\s+public\.npd_wip_processes/i.test(String(call[0])),
    );
    expect(String(processInsert?.[0])).toMatch(/yield_pct/i);
    expect(processInsert?.[1]?.[8]).toBe(100);
  });

  it('ensureWipItem returns an existing linked item without minting a new code', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [{ id: processId }], rowCount: 1 };
      }
      if (/select\s+p\.wip_item_id/i.test(text)) {
        return {
          rows: [{
            wip_item_id: existingItemId,
            wip_definition_id: null,
            definition_item_id: null,
            definition_base_uom: null,
            definition_name: null,
          }],
        };
      }
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
      if (/select\s+p\.wip_item_id/i.test(text)) {
        return {
          rows: [{
            wip_item_id: null,
            wip_definition_id: null,
            definition_item_id: null,
            definition_base_uom: null,
            definition_name: null,
          }],
        };
      }
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
    // Params: [id, processName, durationHours, additionalCost, createsWipItem, throughputPerHour, throughputUom, setupCost, yieldPct, hasLineId, lineId]
    expect(updateCall?.[1]).toEqual([processId, null, null, null, false, null, null, null, null, false, null]);

    const deletedItem = queryMock.mock.calls.some((call) =>
      /delete\s+from\s+public\.items/i.test(String(call[0])),
    );
    expect(deletedItem).toBe(false);
  });

  it('updateWipProcess returns a typed error when no process row is updated', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/update\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });

    const result = await updateWipProcess({ id: processId, durationHours: 2 });

    expect(result).toEqual({
      ok: false,
      error: 'WIP process is not visible in this organisation',
    });
  });

  it('persists explicit process yield percentages on add and update', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) return { rows: [{ id: processId }], rowCount: 1 };
      if (/update\s+public\.npd_wip_processes/i.test(text)) {
        return { rows: [{ id: processId, process_name: 'Cold Smoke', creates_wip_item: false }], rowCount: 1 };
      }
      return { rows: [] };
    });

    const added = await addWipProcess({
      prodDetailId,
      processName: 'Cold Smoke',
      yieldPct: 95,
    });
    const updated = await updateWipProcess({ id: processId, yieldPct: 97.5 });

    expect(added).toEqual({ ok: true, id: processId });
    expect(updated).toEqual({ ok: true, updated: true });
    const processInsert = queryMock.mock.calls.find((call) => /insert\s+into\s+public\.npd_wip_processes/i.test(String(call[0])));
    const processUpdate = queryMock.mock.calls.find((call) => /update\s+public\.npd_wip_processes/i.test(String(call[0])));
    expect(processInsert?.[1]?.[8]).toBe(95);
    expect(processUpdate?.[1]?.[8]).toBe(97.5);
  });

  it('removeWipProcess returns a typed error when no process row is deleted', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/delete\s+from\s+public\.npd_wip_processes/i.test(text)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const result = await removeWipProcess({ id: processId });

    expect(result).toEqual({
      ok: false,
      error: 'WIP process is not visible in this organisation',
    });
  });

  it('saveWipProcessRoles writes role rows with headcounts and persisted rates', async () => {
    queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/select\s+true\s+as\s+ok/i.test(text)) return { rows: [{ ok: true }] };
      if (/delete\s+from\s+public\.npd_wip_process_roles/i.test(text)) return { rows: [], rowCount: 1 };
      if (/from\s+public\.labor_rates/i.test(text)) {
        return { rows: [{ rate_per_hour: params?.[0] === 'Supervisor' ? '30' : '20' }] };
      }
      if (/insert\s+into\s+public\.npd_wip_process_roles/i.test(text)) return { rows: [], rowCount: 1 };
      return { rows: [] };
    });

    const result = await saveWipProcessRoles({
      processId,
      roles: [
        { roleGroup: 'Operator', headcount: 2 },
        { roleGroup: 'Supervisor', headcount: 1, ratePerHour: 35 },
      ],
    });

    expect(result).toEqual({ ok: true, saved: 2 });
    const inserts = queryMock.mock.calls.filter((call) =>
      /insert\s+into\s+public\.npd_wip_process_roles/i.test(String(call[0])),
    );
    expect(inserts.map((call) => call[1])).toEqual([
      [processId, 'Operator', 2, 20],
      [processId, 'Supervisor', 1, 35],
    ]);
  });

  it('addWipProcess rejects a production line outside the org', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/from\s+public\.production_lines/i.test(text)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const result = await addWipProcess({
      prodDetailId,
      processName: 'Cold Smoke',
      lineId: '77777777-7777-4777-8777-777777777777',
    });

    expect(result).toEqual({ ok: false, error: 'Production line is not visible in this organisation' });
    expect(
      queryMock.mock.calls.some((call) => /insert\s+into\s+public\.npd_wip_processes/i.test(String(call[0]))),
    ).toBe(false);
  });

  it('addWipProcess persists lineId when the line is org-visible and active', async () => {
    const lineId = '77777777-7777-4777-8777-777777777777';
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/from\s+public\.production_lines/i.test(text)) return { rows: [{ id: lineId }], rowCount: 1 };
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) return { rows: [{ id: processId }], rowCount: 1 };
      return { rows: [] };
    });

    const result = await addWipProcess({
      prodDetailId,
      processName: 'Cold Smoke',
      lineId,
    });

    expect(result).toEqual({ ok: true, id: processId });
    const processInsert = queryMock.mock.calls.find((call) =>
      /insert\s+into\s+public\.npd_wip_processes/i.test(String(call[0])),
    );
    expect(processInsert?.[1]?.[9]).toBe(lineId);
  });

  it('updateWipProcess rejects a production line outside the org', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.user_roles/i.test(text)) return { rows: [{ ok: true }] };
      if (/from\s+public\.production_lines/i.test(text)) return { rows: [], rowCount: 0 };
      return { rows: [] };
    });

    const result = await updateWipProcess({
      id: processId,
      lineId: '77777777-7777-4777-8777-777777777777',
    });

    expect(result).toEqual({ ok: false, error: 'Production line is not visible in this organisation' });
    expect(
      queryMock.mock.calls.some((call) => /update\s+public\.npd_wip_processes/i.test(String(call[0]))),
    ).toBe(false);
  });
});
