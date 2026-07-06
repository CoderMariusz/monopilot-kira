import { beforeEach, describe, expect, it, vi } from 'vitest';

import { previewWorkOrderChain, getStationQueue } from './chain-preview';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ID = '44444444-4444-4444-8444-444444444444';
const WIP_ID = '55555555-5555-4555-8555-555555555555';
const LINE_ID = '66666666-6666-4666-8666-666666666666';
const WO_ID = '77777777-7777-4777-8777-777777777777';

let client: QueryClient;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

describe('previewWorkOrderChain', () => {
  beforeEach(() => {
    client = {
      query: vi.fn(async (sql: string) => {
        const n = sql.replace(/\s+/g, ' ').toLowerCase();
        if (n.includes('from public.items') && n.includes('net_qty_per_each')) {
          return { rows: [{ id: FG_ID, item_code: 'FG-PIZZA', name: 'Pizza', uom_base: 'kg', net_qty_per_each: null, each_per_box: null }] };
        }
        if (n.includes('from public.bom_headers')) {
          return { rows: [{ id: 'bom-1', line_basis: 'per_kg' }] };
        }
        if (n.includes('from public.bom_lines')) {
          return { rows: [{ item_id: WIP_ID, component_code: 'WIP-DOUGH', name: 'Dough', uom_base: 'kg', quantity: '0.7', scrap_pct: '0' }] };
        }
        if (n.includes('from public.routings')) {
          return { rows: [{ item_id: WIP_ID, code: 'MIX-01', name: 'Mixer line' }] };
        }
        if (n.includes('from public.npd_wip_processes')) {
          return { rows: [{ item_id: WIP_ID, process_name: 'Mix dough', throughput_per_hour: '120.0000', throughput_uom: 'kg', duration_hours: '1.5000' }] };
        }
        return { rows: [] };
      }),
    };
  });

  it('builds a multi-stage tree with throughput + line per stage', async () => {
    const result = await previewWorkOrderChain({ productId: FG_ID, plannedQuantity: '1000' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.spansMultipleStages).toBe(true);
    expect(result.stageCount).toBe(2);
    expect(result.root.stageLabel).toBe('FG');
    expect(result.root.consumes).toEqual([{ itemCode: 'WIP-DOUGH', requiredQty: '700.0000', uom: 'kg' }]);
    const child = result.root.children[0];
    expect(child.itemCode).toBe('WIP-DOUGH');
    expect(child.requiredQty).toBe('700.0000');
    expect(child.lines).toEqual([{ code: 'MIX-01', name: 'Mixer line' }]);
    expect(child.processes[0]).toMatchObject({ name: 'Mix dough', throughputPerHour: 120, throughputUom: 'kg' });
  });

  it('returns no_active_bom when the FG has no active BOM', async () => {
    client.query = vi.fn(async (sql: string) => {
      const n = sql.replace(/\s+/g, ' ').toLowerCase();
      if (n.includes('from public.items') && n.includes('net_qty_per_each')) {
        return { rows: [{ id: FG_ID, item_code: 'FG-PIZZA', name: 'Pizza', uom_base: 'kg', net_qty_per_each: null, each_per_box: null }] };
      }
      return { rows: [] };
    });
    await expect(previewWorkOrderChain({ productId: FG_ID, plannedQuantity: '10' })).resolves.toEqual({ ok: false, error: 'no_active_bom' });
  });

  it('rejects invalid input without hitting the db', async () => {
    await expect(previewWorkOrderChain({ productId: 'nope', plannedQuantity: '0' })).resolves.toEqual({ ok: false, error: 'invalid_input' });
  });
});

describe('getStationQueue', () => {
  beforeEach(() => {
    client = {
      query: vi.fn(async (sql: string) => {
        const n = sql.replace(/\s+/g, ' ').toLowerCase();
        if (n.includes('from public.production_lines') && !n.includes('from public.routings')) {
          return { rows: [{ code: 'MIX-01', name: 'Mixer line' }] };
        }
        if (n.includes('from public.work_orders wo')) {
          return { rows: [{ id: WO_ID, wo_number: 'WO-001-W1', status: 'RELEASED', product_id: WIP_ID, item_code: 'WIP-DOUGH', name: 'Dough', planned_quantity: '700.0000', produced_quantity: '350.0000', uom: 'kg', scheduled_start_time: null }] };
        }
        if (n.includes('from public.wo_dependencies')) {
          return { rows: [{ parent_wo_id: WO_ID, child_wo_number: 'WO-001-W0', child_status: 'COMPLETED', child_item_code: 'RM-FLOUR', child_uom: 'kg', produced_quantity: '500.0000', required_qty: '490.0000' }] };
        }
        if (n.includes('from public.npd_wip_processes')) {
          return { rows: [{ item_id: WIP_ID, process_name: 'Mix dough', throughput_per_hour: '120.0000', throughput_uom: 'kg', duration_hours: '1.5000' }] };
        }
        return { rows: [] };
      }),
    };
  });

  it('returns only this line\'s WOs with demand, input availability and rate', async () => {
    const result = await getStationQueue({ lineId: LINE_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.lineCode).toBe('MIX-01');
    expect(result.workOrders).toHaveLength(1);
    const wo = result.workOrders[0];
    expect(wo.demandQty).toBe('700.0000');
    expect(wo.producedQty).toBe('350.0000');
    expect(wo.processes[0]).toMatchObject({ throughputPerHour: 120, throughputUom: 'kg' });
    expect(wo.inputs[0]).toMatchObject({ itemCode: 'RM-FLOUR', producedQty: '500.0000', requiredQty: '490.0000', upstreamWoNumber: 'WO-001-W0' });
  });

  it('returns not_found for an unknown line', async () => {
    client.query = vi.fn(async () => ({ rows: [] }));
    await expect(getStationQueue({ lineId: LINE_ID })).resolves.toEqual({ ok: false, error: 'not_found' });
  });
});
