import { describe, expect, it } from 'vitest';

import {
  TOTAL_PCT_MAX,
  TOTAL_PCT_MIN,
  isTotalPctValid,
  recomputeCalc,
  type RecomputeInput,
  type RecomputeIngredient,
} from '../recompute-calc';

// ───────────────────────────────────────────────────────────────────────────
// Costing v2 — quantity-per-pack model. Each ingredient carries qtyKg (the
// amount used in ONE pack, in kg). rawCostPerPack = Σ(qtyKg × costPerKg);
// costPerKg = rawCostPerPack / packWeightKg.
//
// NUMERIC values arrive as strings (the repo reads NUMERIC columns as strings
// and we must keep money exact, never Number() them).
// ───────────────────────────────────────────────────────────────────────────

/**
 * A deterministic 10-ingredient seed whose qtyKg sums to exactly 0.200 kg
 * (a 200 g pack). Varied costs/allergens for coverage; pct retained for the
 * composition / legacy paths.
 */
function seedTenIngredients(): RecomputeIngredient[] {
  // qty (kg/pack) chosen to sum to exactly 0.200; varied costs/allergens.
  const rows: Array<{ qty: string; pct: string; cost: string; allergens: string[] }> = [
    { qty: '0.080', pct: '40.000', cost: '3.50', allergens: ['milk'] },
    { qty: '0.040', pct: '20.000', cost: '5.25', allergens: ['soya', 'milk'] },
    { qty: '0.020', pct: '10.000', cost: '1.10', allergens: [] },
    { qty: '0.016', pct: '8.000', cost: '12.40', allergens: ['eggs'] },
    { qty: '0.014', pct: '7.000', cost: '0.95', allergens: ['gluten'] },
    { qty: '0.010', pct: '5.000', cost: '2.00', allergens: [] },
    { qty: '0.008', pct: '4.000', cost: '8.80', allergens: ['nuts'] },
    { qty: '0.006', pct: '3.000', cost: '0.40', allergens: [] },
    { qty: '0.004', pct: '2.000', cost: '15.00', allergens: ['fish'] },
    { qty: '0.002', pct: '1.000', cost: '0.10', allergens: ['celery'] },
  ];
  return rows.map((r, i) => ({
    rmCode: `RM-${1000 + i}`,
    qtyKg: r.qty,
    pct: r.pct,
    costPerKgEur: r.cost,
    allergensInherited: r.allergens,
  }));
}

function baseInput(ingredients: RecomputeIngredient[]): RecomputeInput {
  return {
    ingredients,
    targetPriceEur: '2.00',
    yieldPct: '95',
    packWeightKg: '0.2',
    processingOverheadPct: '8',
    // packaging defaults to 0 at the recipe stage — left unset on purpose.
  };
}

describe('recomputeCalc — qty balance (Costing v2 submit gate)', () => {
  it('sums ingredient qtyKg exactly', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.totalQtyKg).toBe('0.200');
  });

  it('marks qtyBalanceValid when Σ qtyKg matches packWeightKg', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.qtyBalanceValid).toBe(true);
    expect(out.qtyBalanceUnset).toBe(false);
  });

  it('rejects when Σ qtyKg drifts beyond ±0.01 % of the pack weight', () => {
    const ings = seedTenIngredients();
    // bump the first row so the total is 0.260 kg vs a 0.200 kg pack (30 % over).
    ings[0] = { ...ings[0], qtyKg: '0.140' };
    const out = recomputeCalc(baseInput(ings));
    expect(out.totalQtyKg).toBe('0.260');
    expect(out.qtyBalanceValid).toBe(false);
  });

  it('accepts the +0.01 % boundary', () => {
    const out = recomputeCalc({
      ...baseInput([
        { rmCode: 'A', qtyKg: '1.0001', costPerKgEur: '1', allergensInherited: [] },
      ]),
      packWeightKg: '1',
    });
    expect(out.qtyBalanceValid).toBe(true);
  });

  it('rejects just past the +0.01 % boundary', () => {
    const out = recomputeCalc({
      ...baseInput([
        { rmCode: 'A', qtyKg: '1.0002', costPerKgEur: '1', allergensInherited: [] },
      ]),
      packWeightKg: '1',
    });
    expect(out.qtyBalanceValid).toBe(false);
  });

  it('does NOT hard-block (qtyBalanceValid=true) when pack weight is unset', () => {
    const out = recomputeCalc({
      ingredients: [{ rmCode: 'A', qtyKg: '5', costPerKgEur: '1', allergensInherited: [] }],
      targetPriceEur: '2.00',
      yieldPct: '95',
      // packWeightKg omitted → unset.
    });
    expect(out.qtyBalanceUnset).toBe(true);
    expect(out.qtyBalanceValid).toBe(true);
  });
});

describe('recomputeCalc — cost roll-up (money exact, no float)', () => {
  it('computes rawCostPerPack = Σ(qtyKg × costPerKg) exactly', () => {
    // 0.10 kg @ 2.00 + 0.10 kg @ 4.00 = 0.20 + 0.40 = 0.60 € / pack
    const out = recomputeCalc(
      baseInput([
        { rmCode: 'A', qtyKg: '0.10', costPerKgEur: '2.00', allergensInherited: [] },
        { rmCode: 'B', qtyKg: '0.10', costPerKgEur: '4.00', allergensInherited: [] },
      ]),
    );
    expect(out.rawCostPerPack).toBe('0.6000');
  });

  it('derives rawCost per kg = rawCostPerPack / packWeightKg', () => {
    // rawCostPerPack 0.60 € / 0.20 kg pack = 3.0000 € / kg
    const out = recomputeCalc(
      baseInput([
        { rmCode: 'A', qtyKg: '0.10', costPerKgEur: '2.00', allergensInherited: [] },
        { rmCode: 'B', qtyKg: '0.10', costPerKgEur: '4.00', allergensInherited: [] },
      ]),
    );
    expect(out.rawCost).toBe('3.0000');
  });

  it('keeps cents exact where binary float would drift (0.1 + 0.2)', () => {
    // 0.5 kg @ 0.20 + 0.5 kg @ 0.40 = 0.10 + 0.20 = 0.30 € / pack
    const out = recomputeCalc({
      ...baseInput([
        { rmCode: 'A', qtyKg: '0.5', costPerKgEur: '0.20', allergensInherited: [] },
        { rmCode: 'B', qtyKg: '0.5', costPerKgEur: '0.40', allergensInherited: [] },
      ]),
      packWeightKg: '1',
    });
    expect(out.rawCostPerPack).toBe('0.3000');
    expect(out.rawCostPerPack).not.toContain('0000000');
  });

  it('applies yield + processing overhead to costPerKg, packaging defaults to 0', () => {
    // 1 kg @ 1.00 in a 1 kg pack → rawCostPerPack 1.00 / 1 kg = 1.0000 € / kg
    // yieldedCost = 1.0000 / (95/100) = 1.0526
    // processing = yielded * 0.08
    // packaging = 0 (recipe stage)
    // total = yielded + processing + 0 = 1.1368
    const out = recomputeCalc({
      ingredients: [{ rmCode: 'A', qtyKg: '1', costPerKgEur: '1.00', allergensInherited: [] }],
      targetPriceEur: '2.00',
      yieldPct: '95',
      packWeightKg: '1',
      processingOverheadPct: '8',
    });
    expect(out.rawCost).toBe('1.0000');
    expect(out.yieldedCost).toBe('1.0526');
    expect(out.packaging).toBe('0.0000');
    expect(out.costPerKg).toBe('1.1368');
  });

  it('adds packaging ONLY when the caller passes it (post-packaging stage)', () => {
    const recipe = recomputeCalc({
      ingredients: [{ rmCode: 'A', qtyKg: '1', costPerKgEur: '1.00', allergensInherited: [] }],
      yieldPct: '100',
      packWeightKg: '1',
      processingOverheadPct: '0',
    });
    expect(recipe.packaging).toBe('0.0000');
    expect(recipe.costPerKg).toBe('1.0000');

    const withPackaging = recomputeCalc({
      ingredients: [{ rmCode: 'A', qtyKg: '1', costPerKgEur: '1.00', allergensInherited: [] }],
      yieldPct: '100',
      packWeightKg: '1',
      processingOverheadPct: '0',
      packagingCostPerKg: '0.65',
    });
    expect(withPackaging.packaging).toBe('0.6500');
    expect(withPackaging.costPerKg).toBe('1.6500');
  });

  it('yields zero per-kg figures when pack weight is unset (no 200 g default)', () => {
    const out = recomputeCalc({
      ingredients: [{ rmCode: 'A', qtyKg: '0.1', costPerKgEur: '2.00', allergensInherited: [] }],
      yieldPct: '100',
      // packWeightKg omitted.
    });
    expect(out.rawCostPerPack).toBe('0.2000');
    expect(out.rawCost).toBe('0.0000');
    expect(out.costPerKg).toBe('0.0000');
    expect(out.revenuePerKg).toBe('0.0000');
  });

  it('computes marginPct deterministically from revenuePerKg', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.marginPct).toMatch(/^-?\d+\.\d{2}$/);
  });

  it('does not divide by zero when yieldPct is 0 (falls back to rawCost)', () => {
    const out = recomputeCalc({
      ingredients: [{ rmCode: 'A', qtyKg: '1', costPerKgEur: '1.00', allergensInherited: [] }],
      targetPriceEur: '2.00',
      yieldPct: '0',
      packWeightKg: '1',
      processingOverheadPct: '8',
    });
    expect(out.yieldedCost).toBe('1.0000');
  });

  it('treats a missing/null cost as zero contribution but flags it', () => {
    const out = recomputeCalc(
      baseInput([
        { rmCode: 'A', qtyKg: '0.1', costPerKgEur: '2.00', allergensInherited: [] },
        { rmCode: 'B', qtyKg: '0.1', costPerKgEur: null, allergensInherited: [] },
      ]),
    );
    // only A contributes: 0.1 × 2.00 = 0.20 € / pack
    expect(out.rawCostPerPack).toBe('0.2000');
    expect(out.allRmHaveCost).toBe(false);
  });

  it('reports allRmHaveCost=true when every ingredient has a cost', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.allRmHaveCost).toBe(true);
  });
});

describe('recomputeCalc — legacy totalPct (composition / informational)', () => {
  it.each([
    ['99.99', true],
    ['100.00', true],
    ['100.01', true],
    ['100.02', false],
  ])('validates actual total %s against the contract band', (total, valid) => {
    expect(isTotalPctValid(total)).toBe(valid);
  });

  it('still sums ingredient pcts exactly when supplied', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
    expect(out.totalPct).toBe('100.000');
    expect(out.totalPctValid).toBe(true);
  });

  it('exposes the legacy totalPct gate bounds as string constants', () => {
    expect(TOTAL_PCT_MIN).toBe('99.99');
    expect(TOTAL_PCT_MAX).toBe('100.01');
  });

  it('treats absent pct as 0 (qty-only rows)', () => {
    const out = recomputeCalc(
      baseInput([{ rmCode: 'A', qtyKg: '0.2', costPerKgEur: '1', allergensInherited: [] }]),
    );
    expect(out.totalPct).toBe('0.000');
  });
});

describe('recomputeCalc — nutrition per-100g weighted sum', () => {
  it('aggregates per-nutrient as Σ(pct/100 × nutrient_per_100g)', () => {
    // 50% protein=20 + 50% protein=10  → 10 + 5 = 15.00 per 100g
    const out = recomputeCalc(
      baseInput([
        {
          rmCode: 'A',
          qtyKg: '0.1',
          pct: '50',
          costPerKgEur: '1',
          allergensInherited: [],
          nutritionPer100g: { energy: '200', protein: '20', salt: '1.0' },
        },
        {
          rmCode: 'B',
          qtyKg: '0.1',
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
          qtyKg: '0.1',
          pct: '50',
          costPerKgEur: '1',
          allergensInherited: [],
          nutritionPer100g: { protein: '20' },
        },
        {
          rmCode: 'B',
          qtyKg: '0.1',
          pct: '50',
          costPerKgEur: '1',
          allergensInherited: [],
          nutritionPer100g: { fat: '10' },
        },
      ]),
    );
    expect(out.nutrition.protein).toBe('10.00');
    expect(out.nutrition.fat).toBe('5.00');
  });
});

describe('recomputeCalc — allergen union (EU14 + process)', () => {
  it('unions ingredient allergens, deduped and deterministically sorted', () => {
    const out = recomputeCalc(baseInput(seedTenIngredients()));
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
        { rmCode: 'A', qtyKg: '0.2', costPerKgEur: '1', allergensInherited: ['milk'] },
      ]),
      processAddedAllergens: ['sulphites', 'milk'],
    });
    expect(out.allergens).toEqual(['milk', 'sulphites']);
  });

  it('returns an empty array when there are no allergens at all', () => {
    const out = recomputeCalc(
      baseInput([{ rmCode: 'A', qtyKg: '0.2', costPerKgEur: '1', allergensInherited: [] }]),
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
    expect(first.totalQtyKg).toBe('0.200');
    expect(typeof first.rawCostPerPack).toBe('string');
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
          { rmCode: 'A', qtyKg: '0.2', costPerKgEur: 2.0 as unknown as string, allergensInherited: [] },
        ]),
      ),
    ).toThrow(/must be strings/);
  });

  it('throws when qtyKg arrives as a number', () => {
    expect(() =>
      recomputeCalc(
        baseInput([
          { rmCode: 'A', qtyKg: 0.2 as unknown as string, costPerKgEur: '1', allergensInherited: [] },
        ]),
      ),
    ).toThrow(/must be strings/);
  });

  it('exposes the totalPct gate bounds as string constants', () => {
    expect(typeof TOTAL_PCT_MIN).toBe('string');
    expect(typeof TOTAL_PCT_MAX).toBe('string');
  });
});

describe('recomputeCalc — p95 latency (AC#2)', () => {
  it('runs 50 ingredients in ≤ 50 ms at p95 over 100 calls', () => {
    const ingredients: RecomputeIngredient[] = Array.from({ length: 50 }, (_, i) => ({
      rmCode: `RM-${i}`,
      qtyKg: '0.004', // 50 × 0.004 = 0.200
      pct: '2',
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
