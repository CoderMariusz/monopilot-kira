import { describe, expect, it } from 'vitest';

import { computeWipComponentCost, computeWipProcessCost } from '../wip-cost';

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
});
