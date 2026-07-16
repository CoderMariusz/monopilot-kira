import { describe, expect, it } from 'vitest';

import {
  computeWipComponentCost,
  computeWipMaterialCost,
  computeWipProcessCost,
  computeWipProcessLaborPerOutputUnit,
  computeWipTreeUnitCost,
  computeWipUnitCost,
  inferWipBatchOutputKg,
  WIP_COST_DEPTH_CEILING,
} from '../wip-cost';

describe('wip-cost', () => {
  describe('computeWipProcessCost', () => {
    it('computes a single role cost plus additional cost', () => {
      expect(computeWipProcessCost([{ rolePerHour: 20, headcount: 2 }], 1.5, 5)).toBe(65);
    });

    it('sums two roles correctly', () => {
      expect(
        computeWipProcessCost(
          [
            { rolePerHour: 20, headcount: 2 },
            { rolePerHour: 15, headcount: 3 },
          ],
          2,
          10,
        ),
      ).toBe(180);
    });

    it('returns additional cost alone when no roles are supplied', () => {
      expect(computeWipProcessCost([], 8, 42)).toBe(42);
    });

    it('coerces bad process inputs to safe zeroes', () => {
      expect(
        computeWipProcessCost(
          [
            { rolePerHour: Number.NaN, headcount: 2 },
            { rolePerHour: -20, headcount: 2 },
            { rolePerHour: 10, headcount: Number.NaN },
            { rolePerHour: 10, headcount: -1 },
          ],
          -1,
          Number.NaN,
        ),
      ).toBe(0);
      expect(computeWipProcessCost(undefined as never, undefined as never, undefined as never)).toBe(0);
    });
  });

  describe('computeWipComponentCost', () => {
    it('applies yield percentage to raw material and process costs', () => {
      expect(computeWipComponentCost(['65', '35'], '100', '80')).toBe('250.0000');
    });

    it('treats yieldPct 100 as a no-op', () => {
      expect(computeWipComponentCost(['65', '35'], '100', '100')).toBe('200.0000');
    });

    it('defaults yieldPct to 100', () => {
      expect(computeWipComponentCost(['65', '35'], '100')).toBe('200.0000');
    });

    it('coerces bad component inputs to safe fallback values', () => {
      expect(computeWipComponentCost(['65', '-35', 'bad'], '-100', '0')).toBe('65.0000');
      expect(computeWipComponentCost(['65'], '35', 'bad')).toBe('100.0000');
      expect(computeWipComponentCost(['65'], '35', undefined)).toBe('100.0000');
      expect(computeWipComponentCost(['65'], '35', '101')).toBe('100.0000');
      expect(computeWipComponentCost(undefined as never, undefined as never, undefined)).toBe('0.0000');
    });
  });

  describe('computeWipUnitCost (G4 — materials + labour)', () => {
    // Wheat flour 1.0 kg @ £0.80 + one role (rate 12 × headcount 2 × duration 0.5h)
    // = 0.80 + 12 = 12.80 at 100% yield.
    it('computes materials + rate×headcount×duration', () => {
      expect(
        computeWipUnitCost({
          materials: [{ qtyPerUnit: '1', unitCost: '0.8' }],
          processes: [
            {
              roles: [{ rolePerHour: '12', headcount: '2' }],
              durationHours: '0.5',
              additionalCost: '0',
            },
          ],
          yieldPct: '100',
        }),
      ).toBe('12.8000');
    });

    it('applies yield to the combined materials + labour total', () => {
      // (2.0 material + 20 labour) / 0.8 = 27.5
      expect(
        computeWipUnitCost({
          materials: [{ qtyPerUnit: '2', unitCost: '1' }],
          processes: [
            {
              roles: [{ rolePerHour: '20', headcount: '1' }],
              durationHours: '1',
              additionalCost: '0',
            },
          ],
          yieldPct: '80',
        }),
      ).toBe('27.5000');
    });

    it('sums material lines via computeWipMaterialCost', () => {
      expect(
        computeWipMaterialCost([
          { qtyPerUnit: '0.5', unitCost: '2' },
          { qtyPerUnit: '1.5', unitCost: '1' },
        ]),
      ).toBe('2.5000');
    });

    it('rounds a large exact aggregate half-up without IEEE-754 drift', () => {
      expect(
        computeWipUnitCost({
          materials: [{ qtyPerUnit: '1', unitCost: '999999.99975' }],
          processes: [],
          yieldPct: '100',
        }),
      ).toBe('999999.9998');
    });

    it('keeps sub-cent process precision until after yield division', () => {
      expect(
        computeWipUnitCost({
          materials: [{ qtyPerUnit: '1', unitCost: '0.1' }],
          processes: [
            {
              roles: [{ rolePerHour: '0.1', headcount: '1' }],
              durationHours: '0',
              additionalCost: '0',
              throughputPerHour: '3',
              throughputUom: 'kg',
            },
          ],
          yieldPct: '3',
        }),
      ).toBe('4.4444');
    });
  });

  describe('WIP-019 regression (run-06 C033)', () => {
    const wip019Materials = [
      { qtyPerUnit: '0.2', unitCost: '4.0' },
      { qtyPerUnit: '0.1', unitCost: '0.8' },
      { qtyPerUnit: '0.7', unitCost: '0.5' },
    ];

    const wip019Processes = [
      {
        roles: [{ rolePerHour: '12', headcount: '2' }],
        durationHours: '2',
        additionalCost: '24',
      },
      {
        roles: [{ rolePerHour: '12', headcount: '2' }],
        durationHours: '5',
        additionalCost: '24',
        throughputPerHour: '200',
        throughputUom: 'kg',
      },
    ];

    it('yield-adjusts £216/batch process cost to £0.216/kg (not £216/kg)', () => {
      const batchKg = inferWipBatchOutputKg(wip019Processes);
      expect(batchKg).toBe('1000.0000');

      expect(wip019Processes.map((process) => computeWipProcessLaborPerOutputUnit(process, batchKg))).toEqual([
        '0.0720',
        '0.1440',
      ]);

      const unitCost = computeWipUnitCost({
        materials: wip019Materials,
        processes: wip019Processes,
        yieldPct: '100',
      });
      expect(unitCost).toBe('1.4460');
      expect(unitCost).not.toBe('217.2300');
    });
  });

  describe('computeWipTreeUnitCost (cycle + depth guard)', () => {
    it('breaks cycles with a visited-set (contributes 0, not missing)', () => {
      const result = computeWipTreeUnitCost({
        itemId: 'wip-a',
        materials: [{ childItemId: 'wip-a', qtyPerUnit: '1', unitCost: null, isIntermediate: true }],
        processes: [],
        resolveChild: () => '99',
      });
      expect(result).toEqual({ unitCost: '0.0000', missing: false });
    });

    it('marks missing when depth exceeds WIP_COST_DEPTH_CEILING', () => {
      const result = computeWipTreeUnitCost({
        itemId: 'wip-deep',
        materials: [],
        processes: [],
        depth: WIP_COST_DEPTH_CEILING + 1,
      });
      expect(result.missing).toBe(true);
      expect(result.unitCost).toBe('0.0000');
    });

    it('resolves nested intermediate unit costs via resolveChild', () => {
      const result = computeWipTreeUnitCost({
        itemId: 'wip-parent',
        materials: [
          { childItemId: 'wip-child', qtyPerUnit: '2', unitCost: null, isIntermediate: true },
          { childItemId: 'rm-flour', qtyPerUnit: '1', unitCost: '0.5', isIntermediate: false },
        ],
        processes: [
          {
            roles: [{ rolePerHour: '10', headcount: '1' }],
            durationHours: '1',
            additionalCost: '0',
          },
        ],
        yieldPct: '100',
        resolveChild: (id) => (id === 'wip-child' ? '3' : null),
      });
      // materials 2×3 + 1×0.5 = 6.5; labour 10; total 16.5
      expect(result).toEqual({ unitCost: '16.5000', missing: false });
    });
  });
});
