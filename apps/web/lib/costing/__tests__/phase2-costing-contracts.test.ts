import { beforeEach, describe, expect, it, vi } from 'vitest';

import { previewWorkOrderChain } from '../../../app/[locale]/(app)/(modules)/planning/work-orders/_actions/chain-preview';
import { computeWipSetupPerOutputUnit } from '../../npd/wip-cost';
import { computeNpdCostEngine, type NpdCostEngineInput } from '../compute-waterfall';

const planningState = {
  scrapPct: '5',
};

const FG_ID = '11111111-1111-4111-8111-111111111111';
const WIP_ID = '22222222-2222-4222-8222-222222222222';

const planningClient = {
  async query<T>(sql: string) {
    const query = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (query.includes('from public.items') && query.includes('net_qty_per_each')) {
      return {
        rows: [{
          id: FG_ID,
          item_code: 'FG-NSA-057',
          name: 'Waste/scrap boundary',
          uom_base: 'kg',
          net_qty_per_each: null,
          each_per_box: null,
        }] as T[],
      };
    }
    if (query.includes('from public.bom_headers')) {
      return { rows: [{ id: 'bom-nsa-057', line_basis: 'per_base' }] as T[] };
    }
    if (query.includes('from public.bom_lines')) {
      return {
        rows: [{
          item_id: WIP_ID,
          component_code: 'WIP-NSA-057',
          name: 'WIP',
          uom_base: 'kg',
          quantity: '1',
          scrap_pct: planningState.scrapPct,
        }] as T[],
      };
    }
    return { rows: [] as T[] };
  },
};

vi.mock('../../auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '33333333-3333-4333-8333-333333333333',
      orgId: '44444444-4444-4444-8444-444444444444',
      client: planningClient,
    }),
}));

function packagingInput(wastePct: string): NpdCostEngineInput {
  return {
    ingredients: [],
    yieldPct: '100',
    packWeightKg: '1',
    packsPerCase: '1',
    avgBatchQty: '100',
    fgBaseUom: 'kg',
    weeklyVolumePacks: '100',
    runsPerWeek: '1',
    targetPriceEur: '10',
    packagingComponents: [{ qtyPerBox: '1', costPerUnit: '1', wastePct }],
    processes: [],
    overheadPerKg: '0',
    logisticsPerBox: '0',
  };
}

async function woRequiredQty(scrapPct: string): Promise<string> {
  planningState.scrapPct = scrapPct;
  const result = await previewWorkOrderChain({ productId: FG_ID, plannedQuantity: '1' });
  if (!result.ok) throw new Error(result.error);
  return result.root.children[0]!.requiredQty;
}

beforeEach(() => {
  planningState.scrapPct = '5';
});

describe('Phase 2 NPD costing contracts', () => {
  it('NSA-048 returns zero setup for either zero denominator and a finite cost otherwise', () => {
    const processes = [{ roles: [], durationHours: '0', additionalCost: '0', setupCost: '50' }];

    expect(
      computeWipSetupPerOutputUnit(processes, {
        runsPerWeek: '2',
        weeklyVolumePacks: '0',
        wipQtyPerFgPack: '0.2',
      }),
    ).toBe('0.0000');
    expect(
      computeWipSetupPerOutputUnit(processes, {
        runsPerWeek: '2',
        weeklyVolumePacks: '1000',
        wipQtyPerFgPack: '0',
      }),
    ).toBe('0.0000');
    expect(
      computeWipSetupPerOutputUnit(processes, {
        runsPerWeek: '2',
        weeklyVolumePacks: '1000',
        wipQtyPerFgPack: '0.2',
      }),
    ).toBe('0.5000');
  });

  it('NSA-055 applies packaging waste_pct as 1 + waste/100', () => {
    expect(computeNpdCostEngine(packagingInput('0')).params.packagingEur).toBe('1.0000');
    expect(computeNpdCostEngine(packagingInput('5')).params.packagingEur).toBe('1.0500');
  });

  it('NSA-057 keeps NPD waste multiplication separate from WO scrap gross-up', async () => {
    const npdWaste5 = computeNpdCostEngine(packagingInput('5')).params.packagingEur;
    const npdWaste20 = computeNpdCostEngine(packagingInput('20')).params.packagingEur;
    const woScrap5 = await woRequiredQty('5');
    const woScrap20 = await woRequiredQty('20');

    expect({ npdWaste5, npdWaste20 }).toEqual({
      npdWaste5: '1.0500',
      npdWaste20: '1.2000',
    });
    expect({ woScrap5, woScrap20 }).toEqual({
      woScrap5: '1.0526',
      woScrap20: '1.2500',
    });
    expect(computeNpdCostEngine(packagingInput('5')).params.packagingEur).toBe('1.0500');
  });
});
