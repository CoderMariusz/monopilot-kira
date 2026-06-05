/**
 * T-032 — Catch-weight variance math (pure, no DB). Always runs.
 *
 * Asserts NUMERIC-exact fixed-point computation of the catch-weight summary:
 * avg/total/variance and the ±tolerance SOFT warning (P1 — never a hard block).
 */
import { describe, expect, it } from 'vitest';

import { computeCatchWeightSummary } from '../register-output';

describe('computeCatchWeightSummary (T-032)', () => {
  it('AC1: near-reference array → warning=false, avg=1.0', () => {
    const s = computeCatchWeightSummary(['1.0', '1.05', '0.95'], '1.0', 0.1);
    expect(s.avg_kg).toBe('1.000');
    expect(s.total_kg).toBe('3.000');
    expect(s.warning).toBe(false);
    // variance is |1.0 - 1.0| / 1.0 = 0
    expect(s.variance_pct).toBe('0.0000');
  });

  it('AC2: avg far above reference (>10%) → warning=true, variance_pct=1.0', () => {
    const s = computeCatchWeightSummary(['2.0', '2.0', '2.0'], '1.0', 0.1);
    expect(s.avg_kg).toBe('2.000');
    expect(s.total_kg).toBe('6.000');
    // |2 - 1| / 1 = 1.0 = 100%
    expect(s.variance_pct).toBe('1.0000');
    expect(s.warning).toBe(true);
  });

  it('exactly at tolerance boundary is NOT a warning (strictly greater)', () => {
    // avg = 1.10, reference 1.0, tolerance 0.10 → variance 0.10 == tolerance → no warning
    const s = computeCatchWeightSummary(['1.10'], '1.0', 0.1);
    expect(s.variance_pct).toBe('0.1000');
    expect(s.warning).toBe(false);
  });

  it('just over tolerance → warning', () => {
    const s = computeCatchWeightSummary(['1.1001'], '1.0', 0.1);
    expect(s.warning).toBe(true);
  });

  it('NUMERIC-exact: 0.1 + 0.2 in micro-units totals exactly 0.300 (no float drift)', () => {
    const s = computeCatchWeightSummary(['0.1', '0.2'], '0.15', 0.5);
    expect(s.total_kg).toBe('0.300');
    expect(s.avg_kg).toBe('0.150');
  });

  it('variance below reference is absolute (avg under reference still flags)', () => {
    // avg 0.8, reference 1.0 → variance 0.20 > 0.10 tolerance
    const s = computeCatchWeightSummary(['0.8'], '1.0', 0.1);
    expect(s.variance_pct).toBe('0.2000');
    expect(s.warning).toBe(true);
  });
});
