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
  });
});
