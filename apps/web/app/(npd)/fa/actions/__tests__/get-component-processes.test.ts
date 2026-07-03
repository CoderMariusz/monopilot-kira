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

import { getComponentProcesses } from '../get-component-processes';

const prodDetailId = '33333333-3333-4333-8333-333333333333';
const processId = '44444444-4444-4444-8444-444444444444';

afterEach(() => {
  queryMock.mockReset();
});

describe('getComponentProcesses', () => {
  it('returns processes, roles, and computed processCost', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.npd_wip_processes/i.test(text)) {
        return {
          rows: [{
            id: processId,
            process_name: 'Smoke',
            display_order: 1,
            duration_hours: '1.5',
            additional_cost: '5',
            creates_wip_item: true,
            wip_item_id: '55555555-5555-4555-8555-555555555555',
            throughput_per_hour: null,
            throughput_uom: null,
            setup_cost: null,
          }],
        };
      }
      if (/from\s+public\.npd_wip_process_roles/i.test(text)) {
        return {
          rows: [{
            process_id: processId,
            role_group: 'operator',
            headcount: 2,
            rate_per_hour: '20',
          }],
        };
      }
      if (/from\s+public\.labor_rates/i.test(text)) return { rows: [] };
      return { rows: [] };
    });

    const result = await getComponentProcesses(prodDetailId);

    expect(result).toEqual({
      ok: true,
      data: [{
        id: processId,
        processName: 'Smoke',
        displayOrder: 1,
        durationHours: 1.5,
        additionalCost: 5,
        createsWipItem: true,
        wipItemId: '55555555-5555-4555-8555-555555555555',
        throughputPerHour: 0,
        throughputUom: 'kg',
        setupCost: 0,
        roles: [{ roleGroup: 'operator', headcount: 2, ratePerHour: 20 }],
        processCost: 65,
      }],
    });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it('falls back to labor_rates when role ratePerHour is null', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/from\s+public\.npd_wip_processes/i.test(text)) {
        return {
          rows: [{
            id: processId,
            process_name: 'Hang',
            display_order: 2,
            duration_hours: '2',
            additional_cost: '1',
            creates_wip_item: false,
            wip_item_id: null,
          }],
        };
      }
      if (/from\s+public\.npd_wip_process_roles/i.test(text)) {
        return {
          rows: [{
            process_id: processId,
            role_group: 'butcher',
            headcount: 1,
            rate_per_hour: null,
          }],
        };
      }
      if (/from\s+public\.labor_rates/i.test(text)) {
        return { rows: [{ role_group: 'butcher', rate_per_hour: '30' }] };
      }
      return { rows: [] };
    });

    const result = await getComponentProcesses(prodDetailId);

    expect(result).toMatchObject({
      ok: true,
      data: [{
        roles: [{ roleGroup: 'butcher', headcount: 1, ratePerHour: 30 }],
        processCost: 61,
      }],
    });
  });
});
