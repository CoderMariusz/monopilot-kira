import { describe, expect, it } from 'vitest';

import { computeNpdCostEngine } from '../../../../../../../../../lib/costing/compute-waterfall';
import {
  adaptMissingChecklist,
  adaptWaterfallRows,
  type CostEngineResult,
  type CostEngineStepKey,
} from '../cost-engine-adapter';

const BASE: CostEngineResult = {
  status: 'ok',
  missing: [],
  units: {
    packWeightKg: '0.25',
    packsPerCase: 12,
    avgBatchQty: '50',
    fgBaseUom: 'kg',
    packsPerBatch: '200',
  },
  steps: [{ key: 'raw_materials', valuePerPackEur: '2.5000' }],
};

describe('cost-engine-adapter', () => {
  it('derives kg and batch columns from per-pack values', () => {
    const rows = adaptWaterfallRows(BASE);
    const rm = rows.find((r) => r.key === 'raw_materials');
    expect(rm?.perPack).toBe('2.5000');
    expect(rm?.perKg).toBe('10.0000');
    expect(rm?.perBatch).toBe('500.0000');
  });

  it('renders the audited margin as £4.7083/kg, £2.2600/pack and £1130/batch', () => {
    const result = computeNpdCostEngine({
      ingredients: [
        { rmCode: 'AUDIT-RM', qtyKg: '0.480', costPerKgEur: '0.50', allergensInherited: [] },
      ],
      yieldPct: '100',
      packWeightKg: '0.480',
      packsPerCase: '1',
      avgBatchQty: '500',
      fgBaseUom: 'pack',
      weeklyVolumePacks: '500',
      runsPerWeek: '1',
      targetPriceEur: '2.50',
      packagingComponents: [],
      processes: [],
      overheadPerKg: '0',
      logisticsPerBox: '0',
    });
    const keys: CostEngineStepKey[] = [
      'raw_materials',
      'yield_loss',
      'process_labour',
      'setup',
      'packaging',
      'overhead',
      'logistics',
      'total',
      'margin',
    ];
    const rows = adaptWaterfallRows({
      status: result.status === 'fail' ? 'fail' : 'ok',
      missing: result.missing,
      marginPct: result.marginPct,
      units: { ...result.units, packsPerCase: null },
      steps: result.steps.map((step, index) => ({
        key: keys[index]!,
        valuePerPackEur: step.valueEur,
      })),
    });
    const margin = rows.find((row) => row.key === 'margin');

    expect(margin).toMatchObject({
      perKg: '4.7083',
      perPack: '2.2600',
      perBatch: '1130.0000',
    });
  });

  it('maps missing keys to stage links', () => {
    const links = adaptMissingChecklist(
      ['yield_pct', 'weekly_volume_packs', 'packs_per_case'],
      'en',
      'proj-1',
    );
    expect(links.map((l) => l.href)).toEqual([
      '/en/pipeline/proj-1/formulation',
      '/en/pipeline/proj-1/brief',
      '/en/pipeline/proj-1/packaging',
    ]);
  });
});
