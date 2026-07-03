import { describe, expect, it } from 'vitest';

import {
  adaptMissingChecklist,
  adaptWaterfallRows,
  type CostEngineResult,
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
