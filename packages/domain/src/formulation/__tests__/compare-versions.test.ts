import { describe, expect, it } from 'vitest';

import {
  compareFormulationVersions,
  type CompareIngredient,
} from '../compare-versions';

// NUMERIC values are STRING-ONLY (the repo reads NUMERIC as strings; money exact).

function ing(
  sequence: number,
  rmCode: string,
  pct: string,
  qtyKg: string,
  cost: string,
): CompareIngredient {
  return { sequence, rmCode, pct, qtyKg, costPerKgEur: cost };
}

describe('compareFormulationVersions — diff aligned by sequence', () => {
  it('5 unchanged + 1 ADDED when B appends one ingredient (AC#3)', () => {
    const a = [
      ing(1, 'RM-1', '40.000', '40', '3.50'),
      ing(2, 'RM-2', '25.000', '25', '5.00'),
      ing(3, 'RM-3', '20.000', '20', '1.00'),
      ing(4, 'RM-4', '10.000', '10', '8.00'),
      ing(5, 'RM-5', '5.000', '5', '2.00'),
    ];
    const b = [...a, ing(6, 'RM-6', '1.000', '1', '9.99')];

    const out = compareFormulationVersions(a, b);
    expect(out.unchanged).toBe(5);
    expect(out.added).toBe(1);
    expect(out.removed).toBe(0);
    expect(out.changed).toBe(0);
    const added = out.rows.find((r) => r.status === 'ADDED');
    expect(added?.sequence).toBe(6);
    expect(added?.rmCode).toBe('RM-6');
  });

  it('flags CHANGED with per-field deltas when a pct changes', () => {
    const a = [ing(1, 'RM-1', '40.000', '40', '3.50')];
    const b = [ing(1, 'RM-1', '38.000', '40', '3.50')];
    const out = compareFormulationVersions(a, b);
    expect(out.changed).toBe(1);
    const row = out.rows.find((r) => r.status === 'CHANGED');
    expect(row?.changed.pct).toBe(true);
    expect(row?.changed.costPerKgEur).toBe(false);
  });

  it('detects an RM swap in the SAME sequence slot as CHANGED', () => {
    const a = [ing(1, 'RM-1', '40.000', '40', '3.50')];
    const b = [ing(1, 'RM-9', '40.000', '40', '3.50')];
    const out = compareFormulationVersions(a, b);
    expect(out.changed).toBe(1);
    const row = out.rows.find((r) => r.status === 'CHANGED');
    expect(row?.changed.rmCode).toBe(true);
    expect(row?.rmCode).toBe('RM-9'); // B-side wins for display
  });
});

describe('compareFormulationVersions — duplicate RM regression (Codex finding #4)', () => {
  it('does NOT collapse duplicate rm_code rows (keyed by sequence)', () => {
    // Same RM-1 appears TWICE per version at different sequences (e.g. a water
    // split). Keyed by rm_code this would collapse to one row and lose a diff;
    // keyed by sequence each occurrence is compared independently.
    const a = [
      ing(1, 'RM-1', '30.000', '30', '1.00'),
      ing(2, 'RM-1', '20.000', '20', '1.00'),
      ing(3, 'RM-2', '50.000', '50', '2.00'),
    ];
    // B changes ONLY the second RM-1 occurrence (sequence 2).
    const b = [
      ing(1, 'RM-1', '30.000', '30', '1.00'),
      ing(2, 'RM-1', '25.000', '25', '1.00'),
      ing(3, 'RM-2', '50.000', '50', '2.00'),
    ];

    const out = compareFormulationVersions(a, b);

    // Three distinct rows survive (not collapsed to two).
    expect(out.rows).toHaveLength(3);
    expect(out.unchanged).toBe(2);
    expect(out.changed).toBe(1);

    const changed = out.rows.find((r) => r.status === 'CHANGED');
    expect(changed?.sequence).toBe(2); // the second RM-1 occurrence
    expect(changed?.changed.pct).toBe(true);
    expect(changed?.a?.pct).toBe('20.000');
    expect(changed?.b?.pct).toBe('25.000');

    // The first RM-1 occurrence is untouched (would be wrong if collapsed).
    const firstRm1 = out.rows.find((r) => r.sequence === 1);
    expect(firstRm1?.status).toBe('UNCHANGED');
  });

  it('throws on a malformed version with a duplicate sequence', () => {
    const bad = [ing(1, 'RM-1', '50.000', '50', '1.00'), ing(1, 'RM-2', '50.000', '50', '2.00')];
    expect(() => compareFormulationVersions(bad, [])).toThrow(/duplicate sequence/);
  });
});

describe('compareFormulationVersions — truncation', () => {
  it('flags truncated when a side exceeds maxRows', () => {
    const many = Array.from({ length: 51 }, (_, i) => ing(i + 1, `RM-${i}`, '1', '1', '1'));
    const out = compareFormulationVersions(many, [], 50);
    expect(out.truncated).toBe(true);
    expect(out.rows.length).toBeLessThanOrEqual(50);
  });
});
