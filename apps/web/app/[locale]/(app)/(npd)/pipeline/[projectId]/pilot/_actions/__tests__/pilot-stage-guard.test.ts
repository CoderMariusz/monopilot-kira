import { describe, expect, it } from 'vitest';

import { isPilotWriteStageEligible, PILOT_WRITE_MIN_STAGE } from '../pilot-stage-guard';

describe('pilot-stage-guard', () => {
  it('rejects stages before G3 (packaging)', () => {
    expect(PILOT_WRITE_MIN_STAGE).toBe('packaging');
    expect(isPilotWriteStageEligible('brief')).toBe(false);
    expect(isPilotWriteStageEligible('recipe')).toBe(false);
    expect(isPilotWriteStageEligible('')).toBe(false);
  });

  it('allows packaging (G3 floor) and later stages, including post-revert packaging', () => {
    expect(isPilotWriteStageEligible('packaging')).toBe(true);
    expect(isPilotWriteStageEligible('costing_nutrition')).toBe(true);
    expect(isPilotWriteStageEligible('trial')).toBe(true);
    // sensory sits AFTER packaging in PIPELINE_STAGE_ORDER, so the G3 floor admits it.
    // Asserting false here would re-impose the exact over-block this threshold replaced:
    // a planner must be able to schedule a dated pilot run before reaching the pilot stage.
    expect(isPilotWriteStageEligible('sensory')).toBe(true);
    expect(isPilotWriteStageEligible('pilot')).toBe(true);
    expect(isPilotWriteStageEligible('approval')).toBe(true);
    expect(isPilotWriteStageEligible('handoff')).toBe(true);
    expect(isPilotWriteStageEligible('launched')).toBe(true);
  });
});
