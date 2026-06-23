import { describe, expect, it } from 'vitest';

import { evaluateApprovalCriteria } from '../evaluate-criteria.js';

const satisfied = {
  formulation: { lockedAt: new Date('2026-01-01T00:00:00Z') },
  nutrition: { nutriScoreGrade: 'B' },
  costing: { targetMarginPct: '20.00' },
  sensory: { required: false },
  allergens: { audited: true },
  risks: { openHighCount: 0 },
  docs: { activeCount: 1, expiredCount: 0, invalidCount: 0 },
} as const;

describe('evaluateApprovalCriteria', () => {
  it('returns C1 pending when the recipe is not locked', () => {
    expect(
      evaluateApprovalCriteria({
        ...satisfied,
        formulation: { lockedAt: null },
      }).C1,
    ).toBe('pending');
  });

  it('returns C2 pass only for complete Nutri-Score grades A, B, or C', () => {
    expect(evaluateApprovalCriteria({ ...satisfied, nutrition: { nutriScoreGrade: 'A' } }).C2).toBe(
      'pass',
    );
    expect(evaluateApprovalCriteria({ ...satisfied, nutrition: { nutriScoreGrade: 'C' } }).C2).toBe(
      'pass',
    );
    expect(evaluateApprovalCriteria({ ...satisfied, nutrition: { nutriScoreGrade: 'D' } }).C2).toBe(
      'warn',
    );
    expect(evaluateApprovalCriteria({ ...satisfied, nutrition: { nutriScoreGrade: null } }).C2).toBe(
      'pending',
    );
  });

  it('returns C3 pass only when target margin is at least the default 15 percent', () => {
    expect(evaluateApprovalCriteria({ ...satisfied, costing: { targetMarginPct: '15.00' } }).C3).toBe(
      'pass',
    );
    expect(evaluateApprovalCriteria({ ...satisfied, costing: { targetMarginPct: '14.99' } }).C3).toBe(
      'warn',
    );
    expect(evaluateApprovalCriteria({ ...satisfied, costing: { targetMarginPct: null } }).C3).toBe(
      'pending',
    );
  });

  it('returns C3 against the supplied org margin threshold when present', () => {
    expect(
      evaluateApprovalCriteria({
        ...satisfied,
        costing: { targetMarginPct: '18.00', marginThresholdPct: '20' },
      }).C3,
    ).toBe('warn');
    expect(
      evaluateApprovalCriteria({
        ...satisfied,
        costing: { targetMarginPct: '18.00', marginThresholdPct: '18' },
      }).C3,
    ).toBe('pass');
  });

  it('returns C4 not_required when D4 reduces sensory out of NPD approval', () => {
    expect(evaluateApprovalCriteria(satisfied).C4).toBe('not_required');
  });

  it('returns C4 pending for required sensory with no score and warns below 7.0', () => {
    expect(
      evaluateApprovalCriteria({ ...satisfied, sensory: { required: true, meanScore: null } }).C4,
    ).toBe('pending');
    expect(
      evaluateApprovalCriteria({ ...satisfied, sensory: { required: true, meanScore: '6.99' } }).C4,
    ).toBe('warn');
    expect(
      evaluateApprovalCriteria({ ...satisfied, sensory: { required: true, meanScore: '7.00' } }).C4,
    ).toBe('pass');
  });

  it('returns C5 pending before allergen audit and warn when V07 audit failed', () => {
    expect(evaluateApprovalCriteria({ ...satisfied, allergens: { audited: false } }).C5).toBe(
      'pending',
    );
    expect(
      evaluateApprovalCriteria({ ...satisfied, allergens: { audited: true, passed: false } }).C5,
    ).toBe('warn');
  });

  it('returns C6 warn for an Open High V18 risk', () => {
    expect(evaluateApprovalCriteria({ ...satisfied, risks: { openHighCount: 1 } }).C6).toBe('warn');
  });

  it('returns C7 pending when docs are absent and warn when any active doc is expired or invalid', () => {
    expect(evaluateApprovalCriteria({ ...satisfied, docs: { activeCount: 0, expiredCount: 0 } }).C7).toBe(
      'pending',
    );
    expect(evaluateApprovalCriteria({ ...satisfied, docs: { activeCount: 1, expiredCount: 1 } }).C7).toBe(
      'warn',
    );
    expect(
      evaluateApprovalCriteria({ ...satisfied, docs: { activeCount: 1, expiredCount: 0, invalidCount: 1 } })
        .C7,
    ).toBe('warn');
  });

  it('returns pass/not_required deterministically when all required inputs are satisfied', () => {
    expect(evaluateApprovalCriteria(satisfied)).toEqual({
      C1: 'pass',
      C2: 'pass',
      C3: 'pass',
      C4: 'not_required',
      C5: 'pass',
      C6: 'pass',
      C7: 'pass',
    });
  });
});
