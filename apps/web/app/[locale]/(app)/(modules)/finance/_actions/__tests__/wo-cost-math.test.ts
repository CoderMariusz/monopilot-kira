import { describe, expect, it } from 'vitest';

import { computeWoActualCostTotals } from '../wo-cost-math';

describe('computeWoActualCostTotals', () => {
  it('computes exact decimal material, labor, waste, and output costs without float drift', () => {
    const result = computeWoActualCostTotals({
      materials: [
        { itemCode: 'RM-A', qtyKg: '1.125', costPerKg: '2.333333' },
        { itemCode: 'RM-B', qtyKg: '0.875', costPerKg: '4.100000' },
      ],
      labor: { runtimeMin: '90.000000', staffing: '2', ratePerHour: '12.3456' },
      machineCost: null,
      setupCost: '3.2500',
      wasteKg: '0.250',
      outputKg: '2.500',
    });

    expect(result.materials).toEqual([
      { itemCode: 'RM-A', qtyKg: '1.125', costPerKg: '2.333333', cost: '2.6250' },
      { itemCode: 'RM-B', qtyKg: '0.875', costPerKg: '4.100000', cost: '3.5875' },
    ]);
    expect(result.materialsTotal).toBe('6.2125');
    expect(result.labor).toEqual({
      runtimeMin: '90.000',
      staffing: '2',
      ratePerHour: '12.3456',
      cost: '37.0368',
    });
    expect(result.wasteCost).toBe('0.7766');
    expect(result.setupCost).toBe('3.2500');
    expect(result.totalCost).toBe('47.2759');
    expect(result.costPerKgOutput).toBe('18.9103');
  });

  it('keeps labor null when no process costing row is resolvable', () => {
    const result = computeWoActualCostTotals({
      materials: [{ itemCode: 'RM-A', qtyKg: '10.000', costPerKg: '1.250000' }],
      labor: null,
      machineCost: null,
      setupCost: null,
      wasteKg: '1.000',
      outputKg: '5.000',
    });

    expect(result.labor).toBeNull();
    expect(result.materialsTotal).toBe('12.5000');
    expect(result.wasteCost).toBe('1.2500');
    expect(result.totalCost).toBe('13.7500');
  });

  it('returns null costPerKgOutput for zero output', () => {
    const result = computeWoActualCostTotals({
      materials: [{ itemCode: 'RM-A', qtyKg: '3.000', costPerKg: '2.000000' }],
      labor: { runtimeMin: '30.000000', staffing: '1', ratePerHour: '10.0000' },
      machineCost: null,
      setupCost: null,
      wasteKg: '0.000',
      outputKg: '0.000',
    });

    expect(result.totalCost).toBe('11.0000');
    expect(result.costPerKgOutput).toBeNull();
  });

  it('uses raw labor micro-units for costPerKgOutput before display rounding', () => {
    const result = computeWoActualCostTotals({
      materials: [],
      labor: { runtimeMin: '0.000030', staffing: '1', ratePerHour: '1.0000' },
      machineCost: null,
      setupCost: null,
      wasteKg: '0.000',
      outputKg: '0.000001',
    });

    expect(result.labor?.cost).toBe('0.0000');
    expect(result.totalCost).toBe('0.0000');
    expect(result.costPerKgOutput).toBe('1.0000');
  });

  it('keeps crew-populated WO totals byte-identical when setup cost is zero', () => {
    const withoutSetup = computeWoActualCostTotals({
      materials: [],
      labor: { runtimeMin: '90.000000', staffing: '1', ratePerHour: '100.0000' },
      machineCost: null,
      setupCost: null,
      wasteKg: '0.000',
      outputKg: '20.000',
    });
    const withZeroSetup = computeWoActualCostTotals({
      materials: [],
      labor: { runtimeMin: '90.000000', staffing: '1', ratePerHour: '100.0000' },
      machineCost: null,
      setupCost: '0.0000',
      wasteKg: '0.000',
      outputKg: '20.000',
    });

    expect(withoutSetup.totalCost).toBe('150.0000');
    expect(withZeroSetup.totalCost).toBe(withoutSetup.totalCost);
    expect(withZeroSetup.labor).toEqual(withoutSetup.labor);
  });

  it('adds setupCost into the WO total when the process default has one', () => {
    const result = computeWoActualCostTotals({
      materials: [],
      labor: { runtimeMin: '60.000000', staffing: '1', ratePerHour: '20.0000' },
      machineCost: null,
      setupCost: '12.5000',
      wasteKg: '0.000',
      outputKg: '10.000',
    });

    expect(result.setupCost).toBe('12.5000');
    expect(result.labor?.cost).toBe('20.0000');
    expect(result.totalCost).toBe('32.5000');
  });

  it('computes labor as aggregate rate × hours for fractional staffing without float drift', () => {
    const result = computeWoActualCostTotals({
      materials: [],
      labor: { runtimeMin: '60.000000', staffing: '2.5', ratePerHour: '50.0000' },
      machineCost: null,
      setupCost: null,
      wasteKg: '0.000',
      outputKg: '10.000',
    });

    expect(result.labor).toEqual({
      runtimeMin: '60.000',
      staffing: '2.5',
      ratePerHour: '50.0000',
      cost: '125.0000',
    });
    expect(result.totalCost).toBe('125.0000');
  });

  it('keeps integer staffing labor identical to aggregate-rate × hours', () => {
    const aggregate = computeWoActualCostTotals({
      materials: [],
      labor: { runtimeMin: '60.000000', staffing: '1', ratePerHour: '30.0000' },
      machineCost: null,
      setupCost: null,
      wasteKg: '0.000',
      outputKg: '10.000',
    });
    const perSeat = computeWoActualCostTotals({
      materials: [],
      labor: { runtimeMin: '60.000000', staffing: '2', ratePerHour: '15.0000' },
      machineCost: null,
      setupCost: null,
      wasteKg: '0.000',
      outputKg: '10.000',
    });

    expect(perSeat.labor?.cost).toBe('30.0000');
    expect(perSeat.totalCost).toBe(aggregate.totalCost);
  });
});
