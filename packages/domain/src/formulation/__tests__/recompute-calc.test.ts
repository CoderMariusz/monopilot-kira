import { describe, expect, it } from 'vitest';

import {
  TOTAL_PCT_MAX,
  TOTAL_PCT_MIN,
  recomputeCalc,
  type RecomputeInput,
  type RecomputeIngredient,
} from '../recompute-calc';

// ───────────────────────────────────────────────────────────────────────────
// Fixtures — NUMERIC values arrive as strings (the repo reads NUMERIC columns
// as strings and we must keep money exact, never Number() them).
// ───────────────────────────────────────────────────────────────────────────

/** A deterministic 10-ingredient seed that sums to exactly 100.000 %. */
function seedTenIngredients(): RecomputeIngredient[] {
  // pcts chosen to sum to exactly 100; varied costs/allergens for coverage.
  const rows: Array<{ pct: string; cost: string; allergens: string[] }> = [
    { pct: '40.000', cost: '3.50', allergens: ['milk'] },
    { pct: '20.000', cost: '5.25', allergens: ['soya', 'milk'] },
    { pct: '10.000', cost: '1.10', allergens: [] },
    { pct: '8.000', cost: '12.40', allergens: ['eggs'] },
    { pct: '7.000', cost: '0.95', allergens: ['gluten'] },
    { pct: '5.000', cost: '2.00', allergens: [] },
    { pct: '4.000', cost: '8.80', allergens: ['nuts'] },
    { pct: '3.000', cost: '0.40', allergens: [] },
    { pct: '2.000', cost: '15.00', allergens: ['fish'] },
    { pct: '1.000', cost: '0.10', allergens: ['celery'] },
  ];
  return rows.map((r, i) => ({
    rmCode: `RM-${1000 + i}`,
    pct: r.pct,
    costPerKgEur: r.cost,
    allergensInherited: r.allergens,
  }));
}

function baseInput(ingredients: RecomputeIngredient[]): RecomputeInput {
  return {
    ingredients,
    batchKg: '100',
    targetPriceEur: '2.00',
    yieldPct: '95',
    packWeightKg: '0.2',
    processingOverheadPct: '8',
    packagingCostPerKg: '0.65',
  };
}

describe('recomputeCalc — totalPct', () => {
  it('sums ingredient pcts exactly', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.totalPct).toBe('100.000');
  });

  it('marks totalPct valid inside the [99.99, 100.01] gate', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.totalPctValid).toBe(true);
  });

  it('rejects (invalid) when ingredients do NOT sum to ~100%', () => {
    const ings = seedTenIngredients();
    ings[0] = { ...ings[0], pct: '30.000' }; // total now 90 %
    const out = recomputeCalc(baseInput(ings));
    expect(out.totalPct).toBe('90.000');
    expect(out.totalPctValid).toBe(false);
  });

  it('accepts the lower boundary 99.99 and rejects 99.98', () => {
    const ok = recomputeCalc(
      baseInput([
        { rmCode: 'A', pct: TOTAL_PCT_MIN.toString(), costPerKgEur: '1', allergensInherited: [] },
      ]),
    );
    expect(ok.totalPctValid).toBe(true);

    const bad = recomputeCalc(
      baseInput([{ rmCode: 'A', pct: '99.98', costPerKgEur: '1', allergensInherited: [] }]),
    );
    expect(bad.totalPctValid).toBe(false);
  });

  it('accepts the upper boundary 100.01 and rejects 100.02', () => {
    const ok = recomputeCalc(
      baseInput([
        { rmCode: 'A', pct: TOTAL_PCT_MAX.toString(), costPerKgEur: '1', allergensInherited: [] },
      ]),
    );
    expect(ok.totalPctValid).toBe(true);

    const bad = recomputeCalc(
      baseInput([{ rmCode: 'A', pct: '100.02', costPerKgEur: '1', allergensInherited: [] }]),
    );
    expect(bad.totalPctValid).toBe(false);
  });
});

describe('recomputeCalc — cost roll-up (money exact, no float)', () => {
  it('computes rawCost = Σ(pct/100 × costPerKg) exactly', () => {
    // Two ingredients: 50% @ 2.00 + 50% @ 4.00 = 1.00 + 2.00 = 3.00
    const out = recomputeCalc(
      baseInput([
        { rmCode: 'A', pct: '50', costPerKgEur: '2.00', allergensInherited: [] },
        { rmCode: 'B', pct: '50', costPerKgEur: '4.00', allergensInherited: [] },
      ]),
    );
    expect(out.rawCost).toBe('3.0000');
  });

  it('keeps cents exact where binary float would drift (0.1 + 0.2)', () => {
    // 50% @ 0.20 + 50% @ 0.40 = 0.10 + 0.20 = 0.30 (float would give 0.30000000000000004)
    const out = recomputeCalc(
      baseInput([
        { rmCode: 'A', pct: '50', costPerKgEur: '0.20', allergensInherited: [] },
        { rmCode: 'B', pct: '50', costPerKgEur: '0.40', allergensInherited: [] },
      ]),
    );
    expect(out.rawCost).toBe('0.3000');
    expect(out.rawCost).not.toContain('0000000');
  });

  it('applies yield, processing overhead and packaging to costPerKg', () => {
    // raw = 100% @ 1.00 = 1.0000
    // yieldedCost = 1.0000 / (95/100) = 1.052631...
    // processing = yielded * 0.08
    // total = yielded + processing + 0.65
    const out = recomputeCalc({
      ingredients: [{ rmCode: 'A', pct: '100', costPerKgEur: '1.00', allergensInherited: [] }],
      batchKg: '100',
      targetPriceEur: '2.00',
      yieldPct: '95',
      packWeightKg: '0.2',
      processingOverheadPct: '8',
      packagingCostPerKg: '0.65',
    });
    expect(out.rawCost).toBe('1.0000');
    // yieldedCost rounded to 4dp
    expect(out.yieldedCost).toBe('1.0526');
    // total = 1.0526 + (1.0526*0.08=0.0842) + 0.65 = 1.7868 (computed from full-precision)
    expect(out.costPerKg).toBe('1.7868');
  });

  it('computes marginPct deterministically from revenuePerKg', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    // marginPct returned as a fixed-precision string, never a raw float
    expect(out.marginPct).toMatch(/^-?\d+\.\d{2}$/);
  });

  it('does not divide by zero when yieldPct is 0 (falls back to rawCost)', () => {
    const out = recomputeCalc({
      ingredients: [{ rmCode: 'A', pct: '100', costPerKgEur: '1.00', allergensInherited: [] }],
      batchKg: '100',
      targetPriceEur: '2.00',
      yieldPct: '0',
      packWeightKg: '0.2',
      processingOverheadPct: '8',
      packagingCostPerKg: '0.65',
    });
    expect(out.yieldedCost).toBe('1.0000');
  });

  it('treats a missing/null cost as zero contribution but flags it', () => {
    const out = recomputeCalc(
      baseInput([
        { rmCode: 'A', pct: '50', costPerKgEur: '2.00', allergensInherited: [] },
        { rmCode: 'B', pct: '50', costPerKgEur: null, allergensInherited: [] },
      ]),
    );
    expect(out.rawCost).toBe('1.0000');
    expect(out.allRmHaveCost).toBe(false);
  });

  it('reports allRmHaveCost=true when every ingredient has a cost', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.allRmHaveCost).toBe(true);
  });
});

describe('recomputeCalc — nutrition per-100g weighted sum', () => {
  it('aggregates per-nutrient as Σ(pct/100 × nutrient_per_100g)', () => {
    // 50% protein=20 + 50% protein=10  → 10 + 5 = 15.00 per 100g
    const out = recomputeCalc(
      baseInput([
        {
          rmCode: 'A',
          pct: '50',
          costPerKgEur: '1',
          allergensInherited: [],
          nutritionPer100g: { energy: '200', protein: '20', salt: '1.0' },
        },
        {
          rmCode: 'B',
          pct: '50',
          costPerKgEur: '1',
          allergensInherited: [],
          nutritionPer100g: { energy: '100', protein: '10', salt: '0.5' },
        },
      ]),
    );
    expect(out.nutrition.energy).toBe('150.00');
    expect(out.nutrition.protein).toBe('15.00');
    expect(out.nutrition.salt).toBe('0.75');
  });

  it('returns an empty nutrition map when no ingredient carries nutrition data', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.nutrition).toEqual({});
  });

  it('treats a nutrient missing on one ingredient as zero for that ingredient', () => {
    const out = recomputeCalc(
      baseInput([
        {
          rmCode: 'A',
          pct: '50',
          costPerKgEur: '1',
          allergensInherited: [],
          nutritionPer100g: { protein: '20' },
        },
        {
          rmCode: 'B',
          pct: '50',
          costPerKgEur: '1',
          allergensInherited: [],
          nutritionPer100g: { fat: '10' },
        },
      ]),
    );
    // protein only from A: 0.5*20 = 10 ; fat only from B: 0.5*10 = 5
    expect(out.nutrition.protein).toBe('10.00');
    expect(out.nutrition.fat).toBe('5.00');
  });
});

describe('recomputeCalc — allergen union (EU14 + process)', () => {
  it('unions ingredient allergens, deduped and deterministically sorted', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    // milk appears twice in the seed → must be deduped
    expect(out.allergens).toEqual([
      'celery',
      'eggs',
      'fish',
      'gluten',
      'milk',
      'nuts',
      'soya',
    ]);
  });

  it('adds process-added allergens to the union', () => {
    const out = recomputeCalc({
      ...baseInput([
        { rmCode: 'A', pct: '100', costPerKgEur: '1', allergensInherited: ['milk'] },
      ]),
      processAddedAllergens: ['sulphites', 'milk'],
    });
    expect(out.allergens).toEqual(['milk', 'sulphites']);
  });

  it('returns an empty array when there are no allergens at all', () => {
    const out = recomputeCalc(
      baseInput([{ rmCode: 'A', pct: '100', costPerKgEur: '1', allergensInherited: [] }]),
    );
    expect(out.allergens).toEqual([]);
  });
});

describe('recomputeCalc — determinism (AC#1)', () => {
  it('is byte-identical across 1000 runs of the same 10-ingredient seed', () => {
    const input = baseInput(seedTenIngredients());
    const first = recomputeCalc(input);
    const firstJson = JSON.stringify(first);
    for (let i = 0; i < 1000; i += 1) {
      const next = recomputeCalc(input);
      expect(JSON.stringify(next)).toBe(firstJson);
    }
    // Spot-check the contract fields explicitly.
    expect(first.totalPct).toBe('100.000');
    expect(typeof first.rawCost).toBe('string');
    expect(typeof first.marginPct).toBe('string');
  });

  it('does not mutate its input', () => {
    const input = baseInput(seedTenIngredients());
    const snapshot = JSON.stringify(input);
    recomputeCalc(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('recomputeCalc — money is STRING-ONLY (rejects JS number)', () => {
  it('throws when a monetary input arrives as a number (cost)', () => {
    expect(() =>
      recomputeCalc(
        baseInput([
          // Force a number past the type boundary the way an untyped/JSON caller
          // could — the runtime guard must reject it.
          { rmCode: 'A', pct: '100', costPerKgEur: 2.0 as unknown as string, allergensInherited: [] },
        ]),
      ),
    ).toThrow(/must be strings/);
  });

  it('throws when pct arrives as a number', () => {
    expect(() =>
      recomputeCalc(
        baseInput([
          { rmCode: 'A', pct: 100 as unknown as string, costPerKgEur: '1', allergensInherited: [] },
        ]),
      ),
    ).toThrow(/must be strings/);
  });

  it('exposes the totalPct gate bounds as string constants', () => {
    expect(TOTAL_PCT_MIN).toBe('99.99');
    expect(TOTAL_PCT_MAX).toBe('100.01');
    expect(typeof TOTAL_PCT_MIN).toBe('string');
    expect(typeof TOTAL_PCT_MAX).toBe('string');
  });
});

describe('recomputeCalc — p95 latency (AC#2)', () => {
  it('runs 50 ingredients in ≤ 50 ms at p95 over 100 calls', () => {
    const ingredients: RecomputeIngredient[] = Array.from({ length: 50 }, (_, i) => ({
      rmCode: `RM-${i}`,
      pct: '2', // 50 × 2 = 100
      costPerKgEur: (1 + i / 10).toFixed(2),
      allergensInherited: i % 3 === 0 ? ['milk'] : i % 3 === 1 ? ['soya'] : [],
      nutritionPer100g: { energy: '100', protein: '5', fat: '2' },
    }));
    const input = baseInput(ingredients);

    const samples: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const t0 = performance.now();
      recomputeCalc(input);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(0.95 * (samples.length - 1))];
    expect(p95).toBeLessThanOrEqual(50);
  });
});
