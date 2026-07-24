import { describe, expect, it } from 'vitest';

import {
  buildAuthoritativeAdvanceGateInfo,
  deriveRequiredCounts,
  mapGateBlockersToView,
  mapStageGateEvaluationToView,
} from '../map-stage-gate-readiness';

describe('mapStageGateEvaluationToView', () => {
  it('maps hidden duplicate requirements to visible blockers and non-zero required totals', () => {
    const view = mapStageGateEvaluationToView(
      {
        status: 'HARD_BLOCKED',
        hardReason: 'REQUIRED_EVIDENCE_BLOCKED',
        blockers: [
          { code: 'REQUIRED_EVIDENCE_MISSING', message: 'Checklist: Runs/week' },
          { code: 'REQUIRED_EVIDENCE_MISSING', message: 'Checklist: Runs/week' },
        ],
      },
      [
        { required: true, done: true },
        { required: true, done: true },
        { required: false, done: false },
      ],
    );

    expect(view.status).toBe('HARD_BLOCKED');
    expect(view.canAdvance).toBe(false);
    expect(view.blockers).toHaveLength(2);
    expect(view.requiredDone).toBe(2);
    expect(view.requiredTotal).toBe(4);
  });

  it('maps zero-ingredient recipe blockers when the checklist is empty', () => {
    const view = mapStageGateEvaluationToView(
      {
        status: 'HARD_BLOCKED',
        hardReason: 'RECIPE_INGREDIENTS_REQUIRED',
        blockers: [
          {
            code: 'RECIPE_INGREDIENTS_REQUIRED',
            message: 'Add at least one ingredient to the recipe before advancing.',
          },
        ],
      },
      [],
    );

    expect(view.blockers[0]?.text).toContain('ingredient');
    expect(view.requiredDone).toBe(0);
    expect(view.requiredTotal).toBe(1);
    expect(view.canAdvance).toBe(false);
  });

  it('maps launch compliance blockers instead of reporting PASS', () => {
    const view = mapStageGateEvaluationToView(
      {
        status: 'HARD_BLOCKED',
        hardReason: 'LAUNCH_COMPLIANCE_BLOCKED',
        blockers: [
          {
            code: 'LAUNCH_COMPLIANCE_BLOCKED',
            message: 'Compliance documents required before launch.',
            pendingCriteria: 'C7',
          },
        ],
      },
      [],
    );

    expect(view.status).toBe('HARD_BLOCKED');
    expect(view.blockers[0]?.code).toBe('LAUNCH_COMPLIANCE_BLOCKED');
    expect(view.requiredTotal).toBeGreaterThan(0);
  });

  it('passes when the server evaluation is PASS', () => {
    const view = mapStageGateEvaluationToView(
      { status: 'PASS' },
      [
        { required: true, done: true },
        { required: true, done: true },
      ],
    );

    expect(view).toEqual({
      status: 'PASS',
      blockers: [],
      softMissing: [],
      requiredDone: 2,
      requiredTotal: 2,
      canAdvance: true,
    });
  });
});

describe('mapGateBlockersToView', () => {
  it('prefers itemText over message for checklist-derived blockers', () => {
    expect(
      mapGateBlockersToView([
        {
          code: 'REQUIRED_EVIDENCE_MISSING',
          message: 'fallback',
          itemText: 'Checklist: Factory spec approved',
        },
      ]),
    ).toEqual([
      expect.objectContaining({ text: 'Checklist: Factory spec approved' }),
    ]);
  });
});

describe('deriveRequiredCounts', () => {
  it('never returns 0 of 0 when server blockers exist without checklist items', () => {
    expect(
      deriveRequiredCounts(
        [],
        [{ id: 'b1', text: 'Active shared BOM with lines' }],
        'HARD_BLOCKED',
      ),
    ).toEqual({ requiredDone: 0, requiredTotal: 1 });
  });
});

describe('buildAuthoritativeAdvanceGateInfo', () => {
  it('uses stage labels when the gate code does not change (G3 operational steps)', () => {
    const info = buildAuthoritativeAdvanceGateInfo({
      currentGate: 'G3',
      currentStage: 'packaging',
      transition: {
        kind: 'stage',
        nextStage: 'costing_nutrition',
        targetGate: 'G3',
        requiresESign: false,
      },
      stageLabels: {
        packaging: 'Packaging',
        costing_nutrition: 'Costing & Nutrition',
      },
    });

    expect(info.transitionMode).toBe('stage');
    expect(info.currentStageLabel).toBe('Packaging');
    expect(info.nextStageLabel).toBe('Costing & Nutrition');
    expect(info.current).toBe('G3');
    expect(info.next).toBe('G3');
  });

  it('keeps gate transition mode when the gate changes', () => {
    const info = buildAuthoritativeAdvanceGateInfo({
      currentGate: 'G2',
      currentStage: 'recipe',
      transition: {
        kind: 'stage',
        nextStage: 'packaging',
        targetGate: 'G3',
        requiresESign: false,
      },
    });

    expect(info.transitionMode).toBe('gate');
    expect(info.next).toBe('G3');
  });
});
