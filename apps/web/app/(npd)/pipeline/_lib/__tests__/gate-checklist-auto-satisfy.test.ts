import { describe, expect, it } from 'vitest';

import {
  applyGateChecklistAutoSatisfy,
  isGateChecklistAutoSatisfied,
  matchGateChecklistAutoKind,
  type GateChecklistAutoSignals,
} from '../gate-checklist-auto-satisfy';

const SIGNALS: GateChecklistAutoSignals = {
  hasLockedFormulation: true,
  hasFgCandidate: true,
  ingredientCount: 3,
};

describe('matchGateChecklistAutoKind', () => {
  it('maps migration-426 seed texts', () => {
    expect(matchGateChecklistAutoKind('Formulation created and locked')).toBe('formulation_locked');
    expect(matchGateChecklistAutoKind('FG candidate created or mapped in system')).toBe('fg_candidate');
    expect(matchGateChecklistAutoKind('Key ingredients identified')).toBe('ingredients_present');
    expect(matchGateChecklistAutoKind('Detailed ingredient specification')).toBe('ingredients_present');
    expect(matchGateChecklistAutoKind('Initial shared BOM ready and linked to NPD project')).toBe(
      'ingredients_present',
    );
    expect(matchGateChecklistAutoKind('Recipe has at least one ingredient')).toBe(
      'ingredients_present',
    );
  });

  it('returns null for unrelated advisory items', () => {
    expect(matchGateChecklistAutoKind('Recipe costing computed')).toBeNull();
    expect(matchGateChecklistAutoKind('Sensory evaluation passed')).toBeNull();
  });
});

describe('isGateChecklistAutoSatisfied', () => {
  it('requires locked formulation, FG code, and ≥1 ingredient', () => {
    expect(isGateChecklistAutoSatisfied('formulation_locked', SIGNALS)).toBe(true);
    expect(isGateChecklistAutoSatisfied('fg_candidate', SIGNALS)).toBe(true);
    expect(isGateChecklistAutoSatisfied('ingredients_present', SIGNALS)).toBe(true);

    expect(
      isGateChecklistAutoSatisfied('formulation_locked', { ...SIGNALS, hasLockedFormulation: false }),
    ).toBe(false);
    expect(isGateChecklistAutoSatisfied('fg_candidate', { ...SIGNALS, hasFgCandidate: false })).toBe(false);
    expect(isGateChecklistAutoSatisfied('ingredients_present', { ...SIGNALS, ingredientCount: 0 })).toBe(false);
  });
});

describe('applyGateChecklistAutoSatisfy', () => {
  it('auto-ticks unmatched manual rows and sets autoDerived', () => {
    const result = applyGateChecklistAutoSatisfy(
      [
        {
          itemText: 'Formulation created and locked',
          done: false,
          completedAt: null,
        },
        {
          itemText: 'Recipe costing computed',
          done: false,
          completedAt: null,
        },
      ],
      SIGNALS,
    );

    expect(result[0]?.done).toBe(true);
    expect(result[0]?.autoDerived).toBe(true);
    expect(result[1]?.done).toBe(false);
    expect(result[1]?.autoDerived).toBeUndefined();
  });

  it('does not mark autoDerived when the row was manually completed', () => {
    const result = applyGateChecklistAutoSatisfy(
      [
        {
          itemText: 'FG candidate created or mapped in system',
          done: true,
          completedAt: '2026-01-01T00:00:00Z',
        },
      ],
      SIGNALS,
    );

    expect(result[0]?.done).toBe(true);
    expect(result[0]?.autoDerived).toBeUndefined();
  });
});
