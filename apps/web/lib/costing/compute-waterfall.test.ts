/**
 * T-073 — Unit tests for the pure 9-step costing waterfall.
 *
 * PRD: docs/prd/01-NPD-PRD.md §17.11.3.
 *
 * RED-first: these tests describe the deterministic, NUMERIC-exact contract of
 * `computeWaterfall` BEFORE the function exists. Money is carried as
 * fixed-scale decimal STRINGS end-to-end — never JS floats — so the assertions
 * compare exact string values.
 */
import { describe, expect, it } from 'vitest';

import {
  COSTING_WATERFALL_STEP_NAMES,
  computeWaterfall,
  type WaterfallParams,
} from './compute-waterfall';

// A complete, deterministic parameter set (all monetary inputs are decimal
// strings, all percentages are decimal strings). No floats anywhere.
const PARAMS: WaterfallParams = {
  rawCostEur: '10.00',
  yieldPct: '90',
  processLabourEur: '2.00',
  packagingEur: '1.00',
  overheadEur: '1.50',
  logisticsEur: '0.50',
  marginPct: '20',
  distributorMarkupPct: '15',
  retailMarkupPct: '40',
};

describe('computeWaterfall — 9-step ordering', () => {
  it('emits exactly 9 steps in the canonical §17.11.3 order with step_index 1..9', () => {
    const result = computeWaterfall(PARAMS);

    expect(result.steps).toHaveLength(9);
    expect(result.steps.map((s) => s.stepIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.steps.map((s) => s.stepName)).toEqual([
      'Raw materials',
      'Yield loss',
      'Process labour',
      'Packaging',
      'Overhead',
      'Logistics',
      'Margin',
      'Distributor',
      'Retail',
    ]);
  });

  it('exposes the canonical step-name constant in the same order', () => {
    expect(COSTING_WATERFALL_STEP_NAMES).toEqual([
      'Raw materials',
      'Yield loss',
      'Process labour',
      'Packaging',
      'Overhead',
      'Logistics',
      'Margin',
      'Distributor',
      'Retail',
    ]);
  });
});

describe('computeWaterfall — NUMERIC-exact worked example (rawCost=10, yield=90, margin=20)', () => {
  const result = computeWaterfall(PARAMS);
  const byName = (name: string) => result.steps.find((s) => s.stepName === name)!;

  it('keeps every monetary value as a fixed-scale decimal string (no floats)', () => {
    for (const step of result.steps) {
      expect(typeof step.valueEur).toBe('string');
      // 4-dp internal money scale, exact string form.
      expect(step.valueEur).toMatch(/^\d+\.\d{4}$/);
    }
    expect(typeof result.rawCostEur).toBe('string');
    expect(typeof result.targetPriceEur).toBe('string');
    expect(typeof result.marginPct).toBe('string');
  });

  it('step 1 Raw materials == rawCost', () => {
    expect(byName('Raw materials').valueEur).toBe('10.0000');
  });

  it('step 2 Yield loss grosses material cost up by yield (10 / 0.90)', () => {
    // 10 / 0.90 = 11.1111 (4dp, half-up)
    expect(byName('Yield loss').valueEur).toBe('11.1111');
  });

  it('steps 3..6 accumulate labour, packaging, overhead, logistics exactly', () => {
    // 11.1111 + 2 = 13.1111
    expect(byName('Process labour').valueEur).toBe('13.1111');
    // + 1 = 14.1111
    expect(byName('Packaging').valueEur).toBe('14.1111');
    // + 1.50 = 15.6111
    expect(byName('Overhead').valueEur).toBe('15.6111');
    // + 0.50 = 16.1111  (this is COGS)
    expect(byName('Logistics').valueEur).toBe('16.1111');
  });

  it('step 7 Margin grosses COGS up to ex-works price = COGS / (1 - margin)', () => {
    // 16.1111 / (1 - 0.20) = 16.1111 / 0.80 = 20.1389 (4dp half-up)
    expect(byName('Margin').valueEur).toBe('20.1389');
  });

  it('step 8 Distributor applies distributor markup to ex-works price', () => {
    // 20.1389 * 1.15 = 23.1597 (4dp half-up)
    expect(byName('Distributor').valueEur).toBe('23.1597');
  });

  it('step 9 Retail applies retail markup to distributor price (final retail)', () => {
    // 23.1597 * 1.40 = 32.4236 (4dp half-up)
    expect(byName('Retail').valueEur).toBe('32.4236');
  });

  it('reports the breakdown summary: rawCost, marginPct, targetPrice (retail)', () => {
    expect(result.rawCostEur).toBe('10.0000');
    expect(result.marginPct).toBe('20.0000');
    expect(result.targetPriceEur).toBe('32.4236');
  });

  it('each step carries delta_pct vs the prior step (step 1 delta is null)', () => {
    expect(byName('Raw materials').deltaPct).toBeNull();
    // Yield loss vs Raw materials: (11.1111-10)/10 = 11.1110% -> exact string
    expect(byName('Yield loss').deltaPct).toBe('11.1110');
    // Margin vs Logistics: (20.1389-16.1111)/16.1111 = 4.0278/16.1111 = 25.0002% (half-up 4dp)
    expect(byName('Margin').deltaPct).toBe('25.0002');
  });
});

describe('computeWaterfall — V07 margin status boundaries', () => {
  it('margin >= warn threshold -> ok status, warn=false', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '20' }, { marginWarnPct: '15' });
    expect(r.status).toBe('ok');
    expect(r.warn).toBe(false);
  });

  it('0 <= margin < warn threshold -> warn status', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '10' }, { marginWarnPct: '15' });
    expect(r.status).toBe('warn');
    expect(r.warn).toBe(true);
  });

  it('margin exactly AT the warn threshold is NOT a warn (warn is strictly below)', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '15' }, { marginWarnPct: '15' });
    expect(r.status).toBe('ok');
    expect(r.warn).toBe(false);
  });

  it('margin < 0 -> fail status (hard fail)', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '-5' }, { marginWarnPct: '15' });
    expect(r.status).toBe('fail');
  });

  it('without a threshold supplied, status is computed only for the hard-fail floor', () => {
    const ok = computeWaterfall({ ...PARAMS, marginPct: '10' });
    expect(ok.status).toBe('ok'); // no warn threshold -> cannot warn
    const fail = computeWaterfall({ ...PARAMS, marginPct: '-1' });
    expect(fail.status).toBe('fail');
  });
});

describe('computeWaterfall — V07 gate uses FULL precision, NEVER display-rounded (rework finding 1)', () => {
  it('14.99999% just below a 15% warn threshold WARNS (must not round up to 15 -> ok)', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '14.99999' }, { marginWarnPct: '15' });
    expect(r.status).toBe('warn');
    expect(r.warn).toBe(true);
  });

  it('-0.00001% HARD-FAILS (must not round to 0.0000 -> ok)', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '-0.00001' }, { marginWarnPct: '15' });
    expect(r.status).toBe('fail');
  });

  it('exactly AT the threshold (15.00000%) is ok (warn is strictly below)', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '15.00000' }, { marginWarnPct: '15' });
    expect(r.status).toBe('ok');
    expect(r.warn).toBe(false);
  });

  it('exactly 0% is NOT a hard fail (floor is strictly below 0)', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '0' }, { marginWarnPct: '15' });
    expect(r.status).toBe('warn'); // 0 < 15 -> warn, but not fail
  });

  it('a fractional threshold (15.5%) gates a 15.49999% margin as warn', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '15.49999' }, { marginWarnPct: '15.5' });
    expect(r.status).toBe('warn');
  });
});

describe('computeWaterfall — input bounds (rework finding 3)', () => {
  it('rejects yieldPct > 100 (would silently REDUCE cost)', () => {
    expect(() => computeWaterfall({ ...PARAMS, yieldPct: '100.0001' })).toThrow(/yieldPct must be <= 100/);
  });

  it('accepts yieldPct exactly 100 (no gross-up)', () => {
    const r = computeWaterfall({ ...PARAMS, yieldPct: '100' });
    // At 100% yield, Yield-loss step equals Raw materials (10.0000).
    expect(r.steps.find((s) => s.stepName === 'Yield loss')!.valueEur).toBe('10.0000');
  });

  it('rejects yieldPct <= 0', () => {
    expect(() => computeWaterfall({ ...PARAMS, yieldPct: '0' })).toThrow(/yieldPct must be > 0/);
  });

  it('rejects marginPct >= 100 (would div-by-zero / negative price)', () => {
    expect(() => computeWaterfall({ ...PARAMS, marginPct: '100' })).toThrow(/marginPct must be < 100/);
    expect(() => computeWaterfall({ ...PARAMS, marginPct: '150' })).toThrow(/marginPct must be < 100/);
  });

  it('accepts marginPct just below 100', () => {
    const r = computeWaterfall({ ...PARAMS, marginPct: '99.9999' });
    expect(r.status).not.toBe('fail');
  });
});
