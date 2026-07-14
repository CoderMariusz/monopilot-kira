import { describe, expect, it } from 'vitest';

import {
  computeWipComponentCost,
  computeWipMaterialCost,
  computeWipProcessCost,
  computeWipTreeUnitCost,
  computeWipUnitCost,
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
      expect(computeWipComponentCost([65, 35], 100, 80)).toBe(250);
    });

    it('treats yieldPct 100 as a no-op', () => {
      expect(computeWipComponentCost([65, 35], 100, 100)).toBe(200);
    });

    it('defaults yieldPct to 100', () => {
      expect(computeWipComponentCost([65, 35], 100)).toBe(200);
    });

    it('coerces bad component inputs to safe fallback values', () => {
      expect(computeWipComponentCost([65, -35, Number.NaN], -100, 0)).toBe(65);
      expect(computeWipComponentCost([65], 35, Number.NaN)).toBe(100);
      expect(computeWipComponentCost([65], 35, undefined)).toBe(100);
      expect(computeWipComponentCost([65], 35, 101)).toBe(100);
      expect(computeWipComponentCost(undefined as never, undefined as never, undefined)).toBe(0);
    });
  });

  describe('computeWipUnitCost (G4 — materials + labour)', () => {
    // Wheat flour 1.0 kg @ £0.80 + one role (rate 12 × headcount 2 × duration 0.5h)
    // = 0.80 + 12 = 12.80 at 100% yield.
    it('computes materials + rate×headcount×duration', () => {
      expect(
        computeWipUnitCost({
          materials: [{ qtyPerUnit: 1, unitCost: 0.8 }],
          processes: [
            {
              roles: [{ rolePerHour: 12, headcount: 2 }],
              durationHours: 0.5,
              additionalCost: 0,
            },
          ],
          yieldPct: 100,
        }),
      ).toBe(12.8);
    });

    it('applies yield to the combined materials + labour total', () => {
      // (2.0 material + 20 labour) / 0.8 = 27.5
      expect(
        computeWipUnitCost({
          materials: [{ qtyPerUnit: 2, unitCost: 1 }],
          processes: [
            {
              roles: [{ rolePerHour: 20, headcount: 1 }],
              durationHours: 1,
              additionalCost: 0,
            },
          ],
          yieldPct: 80,
        }),
      ).toBe(27.5);
    });

    it('sums material lines via computeWipMaterialCost', () => {
      expect(
        computeWipMaterialCost([
          { qtyPerUnit: 0.5, unitCost: 2 },
          { qtyPerUnit: 1.5, unitCost: 1 },
        ]),
      ).toBe(2.5);
    });
  });

  describe('computeWipTreeUnitCost (cycle + depth guard)', () => {
    it('breaks cycles with a visited-set (contributes 0, not missing)', () => {
      const result = computeWipTreeUnitCost({
        itemId: 'wip-a',
        materials: [{ childItemId: 'wip-a', qtyPerUnit: 1, unitCost: null, isIntermediate: true }],
        processes: [],
        resolveChild: () => 99,
      });
      expect(result).toEqual({ unitCost: 0, missing: false });
    });

    it('marks missing when depth exceeds WIP_COST_DEPTH_CEILING', () => {
      const result = computeWipTreeUnitCost({
        itemId: 'wip-deep',
        materials: [],
        processes: [],
        depth: WIP_COST_DEPTH_CEILING + 1,
      });
      expect(result.missing).toBe(true);
      expect(result.unitCost).toBe(0);
    });

    it('resolves nested intermediate unit costs via resolveChild', () => {
      const result = computeWipTreeUnitCost({
        itemId: 'wip-parent',
        materials: [
          { childItemId: 'wip-child', qtyPerUnit: 2, unitCost: null, isIntermediate: true },
          { childItemId: 'rm-flour', qtyPerUnit: 1, unitCost: 0.5, isIntermediate: false },
        ],
        processes: [
          {
            roles: [{ rolePerHour: 10, headcount: 1 }],
            durationHours: 1,
            additionalCost: 0,
          },
        ],
        yieldPct: 100,
        resolveChild: (id) => (id === 'wip-child' ? 3 : null),
      });
      // materials 2×3 + 1×0.5 = 6.5; labour 10; total 16.5
      expect(result).toEqual({ unitCost: 16.5, missing: false });
    });
  });
});
