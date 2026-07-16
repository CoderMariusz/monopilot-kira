import { describe, expect, it } from 'vitest';

import {
  ATP_STEP_MINUTES,
  CLEANING_STEP_MINUTES,
  effectiveChangeoverMinutes,
  resolveChangeoverTransition,
  transitionScore,
} from '../changeover-matrix-lookup';
import type { ChangeoverMatrixEntry } from '../scheduler-types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function matrix(
  from: string,
  to: string,
  minutes: number,
  over: Partial<ChangeoverMatrixEntry> = {},
): ChangeoverMatrixEntry {
  return {
    id: `${from}-${to}`,
    org_id: ORG_ID,
    site_id: null,
    version_id: '44444444-4444-4444-8444-444444444444',
    line_id: null,
    allergen_from: from,
    allergen_to: to,
    changeover_minutes: minutes,
    requires_cleaning: false,
    requires_atp: false,
    risk_level: 'low',
    notes: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

describe('resolveChangeoverTransition', () => {
  it('marks partial allergen-profile coverage infeasible when any pair is missing', () => {
    const entries = [matrix('milk', 'nuts', 20)];

    const transition = resolveChangeoverTransition(['milk', 'soy'], ['nuts'], null, entries);

    expect(transition.feasible).toBe(false);
    expect(transition.risk_level).toBe('segregated');
  });

  it('matches single-code matrix rows against multi-allergen profiles', () => {
    const entries = [
      matrix('milk', 'nuts', 20),
      matrix('soy', 'nuts', 40),
      matrix('milk', 'soy', 0),
    ];

    const transition = resolveChangeoverTransition(['milk', 'soy'], ['nuts'], null, entries);

    expect(transition.minutes).toBe(40);
    expect(transition.feasible).toBe(true);
  });

  it('prefers a line-specific override over the org default for the same pair', () => {
    const lineId = '22222222-2222-4222-8222-222222222222';
    const entries = [
      matrix('milk', 'soy', 30, { line_id: null, risk_level: 'high' }),
      matrix('milk', 'soy', 5, { line_id: lineId, risk_level: 'low' }),
    ];

    const transition = resolveChangeoverTransition(['milk'], ['soy'], lineId, entries);

    expect(transition.minutes).toBe(5);
    expect(transition.risk_level).toBe('low');
  });

  it('uses the configured reverse direction when the requested direction is missing', () => {
    const entries = [
      matrix('nuts', 'milk', 35, {
        requires_cleaning: true,
        risk_level: 'high',
      }),
    ];

    const transition = resolveChangeoverTransition(['milk'], ['nuts'], null, entries);

    expect(transition.minutes).toBe(35);
    expect(transition.requires_cleaning).toBe(true);
    expect(transition.risk_level).toBe('high');
    expect(transition.feasible).toBe(true);
  });

  it('falls back to org default per pair when only some pairs have a line override', () => {
    const lineId = '22222222-2222-4222-8222-222222222222';
    const entries = [
      matrix('milk', 'nuts', 5, { line_id: lineId, risk_level: 'low' }),
      matrix('soy', 'nuts', 40, { line_id: null, risk_level: 'segregated' }),
    ];

    const transition = resolveChangeoverTransition(['milk', 'soy'], ['nuts'], lineId, entries);

    expect(transition.minutes).toBe(40);
    expect(transition.risk_level).toBe('segregated');
    expect(transition.feasible).toBe(false);
  });

  it('aggregates requires_cleaning, requires_atp, and worst risk across matched pairs', () => {
    const entries = [
      matrix('milk', 'soy', 10, { requires_cleaning: true, risk_level: 'medium' }),
      matrix('egg', 'soy', 15, { requires_atp: true, risk_level: 'high' }),
    ];

    const transition = resolveChangeoverTransition(['milk', 'egg'], ['soy'], null, entries);

    expect(transition.minutes).toBe(15);
    expect(transition.requires_cleaning).toBe(true);
    expect(transition.requires_atp).toBe(true);
    expect(transition.risk_level).toBe('high');
    expect(transition.step_minutes).toBe(CLEANING_STEP_MINUTES + ATP_STEP_MINUTES);
    expect(effectiveChangeoverMinutes(transition)).toBe(15 + CLEANING_STEP_MINUTES + ATP_STEP_MINUTES);
  });

  it('marks segregated configured transitions infeasible', () => {
    const transition = resolveChangeoverTransition(
      ['milk'],
      ['nuts'],
      null,
      [matrix('milk', 'nuts', 10, { risk_level: 'segregated' })],
    );

    expect(transition.feasible).toBe(false);
    expect(transitionScore(transition, 1)).toBe(Number.POSITIVE_INFINITY);
  });

  it('marks unmatched non-empty allergen pairs infeasible when a matrix is configured', () => {
    const transition = resolveChangeoverTransition(['milk'], ['nuts'], null, [], {
      matrixConfigured: true,
    });

    expect(transition.minutes).toBe(0);
    expect(transition.feasible).toBe(false);
    expect(transition.risk_level).toBe('segregated');
  });

  it('treats unmatched pairs as permissive when no matrix is configured', () => {
    const transition = resolveChangeoverTransition(['milk'], ['nuts'], null, [], {
      matrixConfigured: false,
    });

    expect(transition.minutes).toBe(0);
    expect(transition.feasible).toBe(true);
  });

  it('keeps both-empty allergen profiles as a free transition', () => {
    const transition = resolveChangeoverTransition([], [], null, []);

    expect(transition.minutes).toBe(0);
    expect(transition.feasible).toBe(true);
  });
});

describe('transitionScore', () => {
  it('includes mandatory cleaning and ATP step minutes in the score base', () => {
    const score = transitionScore(
      {
        minutes: 10,
        step_minutes: CLEANING_STEP_MINUTES + ATP_STEP_MINUTES,
        requires_cleaning: true,
        requires_atp: true,
        risk_level: 'low',
        feasible: true,
      },
      1,
    );

    expect(score).toBe(10 + CLEANING_STEP_MINUTES + ATP_STEP_MINUTES);
  });

  it('applies risk multipliers on top of effective minutes', () => {
    const base = transitionScore(
      {
        minutes: 10,
        step_minutes: 0,
        requires_cleaning: false,
        requires_atp: false,
        risk_level: 'high',
        feasible: true,
      },
      1,
    );

    expect(base).toBe(15);
  });
});
