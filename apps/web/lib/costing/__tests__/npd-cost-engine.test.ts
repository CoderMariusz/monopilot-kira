import { describe, expect, it } from 'vitest';

import { computeNpdCostEngine, type NpdCostEngineInput } from '../compute-waterfall';

function breadInput(overrides: Partial<NpdCostEngineInput> = {}): NpdCostEngineInput {
  return {
    ingredients: [
      { rmCode: 'FLOUR', qtyKg: '0.2', pct: '66.6667', costPerKgEur: '0.5', allergensInherited: [] },
      { rmCode: 'WATER', qtyKg: '0.1', pct: '33.3333', costPerKgEur: '0.01', allergensInherited: [] },
    ],
    yieldPct: '90',
    packWeightKg: '0.2',
    packsPerCase: '4',
    avgBatchQty: '200',
    fgBaseUom: 'kg',
    weeklyVolumePacks: '1000',
    runsPerWeek: '2',
    targetPriceEur: '2',
    packagingComponents: [
      { qtyPerBox: '4', costPerUnit: '0.2', wastePct: '0' },
      { qtyPerBox: '4', costPerUnit: '0.1', wastePct: '0' },
      { qtyPerBox: '4', costPerUnit: '0.001', wastePct: '0' },
      { qtyPerBox: '1', costPerUnit: '1', wastePct: '0' },
    ],
    processes: [
      {
        throughputPerHour: '120',
        throughputUom: 'pack',
        setupCost: '100',
        additionalCost: '0',
        roles: [{ ratePerHour: '12', headcount: '1' }],
      },
    ],
    overheadPerKg: '0.3',
    logisticsPerBox: '0.4',
    ...overrides,
  };
}

describe('computeNpdCostEngine', () => {
  it('computes the owner bread example per pack in U2 order', () => {
    const result = computeNpdCostEngine(breadInput());

    expect(result.missing).toEqual([]);
    expect(result.units).toMatchObject({
      packWeightKg: '0.200000',
      packsPerCase: '4.0000',
      fgBaseUom: 'kg',
      packsPerBatch: '1000.0000',
    });
    expect(result.steps.map((s) => s.stepName)).toEqual([
      'Raw materials',
      'Yield loss',
      'Process labour',
      'Setup',
      'Packaging',
      'Overhead',
      'Logistics',
      'Total cost',
      'Margin vs target price',
    ]);
    expect(result.rawCostEur).toBe('0.1010');
    expect(result.steps[1]!.valueEur).toBe('0.1122');
    expect(result.steps[2]!.valueEur).toBe('0.2122');
    expect(result.steps[3]!.valueEur).toBe('0.4122');
    expect(result.steps[4]!.valueEur).toBe('0.9632');
    expect(result.steps[7]!.valueEur).toBe('1.1232');
    expect(result.steps[8]!.valueEur).toBe('2.0000');
    expect(result.marginPct).toBe('43.8389');
  });

  it('returns typed errors for required yield, brief inputs, and packs per case', () => {
    const result = computeNpdCostEngine(
      breadInput({
        yieldPct: null,
        packsPerCase: '0',
        weeklyVolumePacks: null,
        runsPerWeek: '0',
        avgBatchQty: null,
      }),
    );

    expect(result.missing).toEqual([
      'yield_required',
      'packs_per_case_required',
      'brief_inputs_required',
    ]);
  });

  it('falls back to legacy duration basis when throughput is absent', () => {
    const result = computeNpdCostEngine(
      breadInput({
        processes: [
          {
            durationHours: '2',
            additionalCost: '50',
            setupCost: '0',
            roles: [{ ratePerHour: '10', headcount: '2' }],
          },
        ],
      }),
    );

    expect(result.legacyDurationBasis).toBe(true);
    expect(result.steps[2]!.valueEur).toBe('0.2022');
  });

  it('converts kg throughput to per-pack labour via pack weight', () => {
    const result = computeNpdCostEngine(
      breadInput({
        processes: [
          {
            throughputPerHour: '100',
            throughputUom: 'kg',
            setupCost: '0',
            roles: [{ ratePerHour: '60', headcount: '1' }],
          },
        ],
      }),
    );

    expect(result.params.processLabourEur).toBe('0.1200');
  });

  it('converts gram throughput to per-pack labour via pack weight', () => {
    const result = computeNpdCostEngine(
      breadInput({
        processes: [
          {
            throughputPerHour: '10000',
            throughputUom: 'g',
            setupCost: '0',
            roles: [{ ratePerHour: '50', headcount: '1' }],
          },
        ],
      }),
    );

    expect(result.params.processLabourEur).toBe('1.0000');
  });

  it('supports each-based finished goods for packs per batch', () => {
    const result = computeNpdCostEngine(
      breadInput({
        fgBaseUom: 'each',
        avgBatchQty: '500',
      }),
    );

    expect(result.units.packsPerBatch).toBe('500.0000');
  });

  it('adds WIP component recursion into raw materials', () => {
    const result = computeNpdCostEngine(
      breadInput({
        wipComponents: [
          {
            quantity: '1',
            quantityUom: 'pack',
            rawMaterialCostPerOutputUnit: '0.50',
            yieldPct: '80',
            wipDefinitionId: 'def-1',
            wipItemId: 'item-1',
            processes: [
              {
                throughputPerHour: '100',
                throughputUom: 'pack',
                roles: [{ ratePerHour: '10', headcount: '1' }],
              },
            ],
          },
        ],
      }),
    );

    expect(result.rawCostEur).toBe('0.8510');
    // unitCost = (0.50 + 10/100) / 0.80 = 0.7500; contribution = 0.7500 × 1
    expect(result.wipComponentCosts).toEqual([
      {
        wipDefinitionId: 'def-1',
        wipItemId: 'item-1',
        unitCostEur: '0.7500',
        contributionEur: '0.7500',
      },
    ]);
  });

  it('FG roll-up picks up a non-zero WIP unit cost (G4 — not dropped)', () => {
    // Material £2/unit + labour rate 20 × hc 1 × duration 1h.
    // Waterfall duration labour is / packsPerBatch (1000) → unit ≈ 2.002; ×0.5 qty.
    const result = computeNpdCostEngine(
      breadInput({
        wipComponents: [
          {
            quantity: '0.5',
            quantityUom: 'kg',
            rawMaterialCostPerOutputUnit: '2',
            yieldPct: '100',
            wipItemId: 'wip-flour-mix',
            processes: [
              {
                durationHours: '1',
                additionalCost: '0',
                roles: [{ ratePerHour: '20', headcount: '1' }],
              },
            ],
          },
        ],
      }),
    );

    expect(result.wipComponentCosts).toHaveLength(1);
    expect(Number(result.wipComponentCosts[0]!.unitCostEur)).toBeGreaterThan(0);
    expect(Number(result.rawCostEur)).toBeGreaterThan(0.101);
  });

  it('prices raw materials per pack from per-pack qtyKg while keeping the per-kg column derivable', () => {
    const result = computeNpdCostEngine(
      breadInput({
        ingredients: [
          { rmCode: 'BEEF', qtyKg: '0.2', pct: '100', costPerKgEur: '5', allergensInherited: [] },
        ],
        yieldPct: '100',
        packWeightKg: '0.2',
        packagingComponents: [],
        processes: [],
        overheadPerKg: '0',
        logisticsPerBox: '0',
      }),
    );

    expect(result.rawCostEur).toBe('1.0000');
    expect(result.costSteps[0]).toMatchObject({
      stepName: 'Raw materials',
      perPackEur: '1.0000',
    });
    expect(Number(result.costSteps[0]!.perPackEur) / Number(result.units.packWeightKg)).toBe(5);
  });

  it('WIP contribution is per-pack in the WIP base unit and invariant to pack weight (review H1)', () => {
    // 2 kg of WIP per pack, WIP raw €5/unit at 92.5% yield → (5 / 0.925) × 2 = €10.8108/pack,
    // regardless of the FG pack weight (no unitToPackFactor rescaling).
    const wip = {
      quantity: '2',
      quantityUom: 'kg',
      rawMaterialCostPerOutputUnit: '5',
      yieldPct: '92.5',
      processes: [],
    };
    const base = computeNpdCostEngine(breadInput({}));
    const withWip = computeNpdCostEngine(breadInput({ wipComponents: [wip] }));
    const contribution = Number(withWip.rawCostEur) - Number(base.rawCostEur);
    expect(contribution).toBeCloseTo(10.8108, 3);

    const heavyBase = computeNpdCostEngine(breadInput({ packWeightKg: '2' }));
    const heavyWithWip = computeNpdCostEngine(breadInput({ packWeightKg: '2', wipComponents: [wip] }));
    expect(Number(heavyWithWip.rawCostEur) - Number(heavyBase.rawCostEur)).toBeCloseTo(contribution, 3);
  });
});
