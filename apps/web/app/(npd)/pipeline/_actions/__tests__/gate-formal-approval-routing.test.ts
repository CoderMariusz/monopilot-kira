import { describe, expect, it } from 'vitest';

import {
  formalApprovalGateCode,
  transitionRequiresFormalApproval,
} from '../_lib/gate-helpers';

describe('formal approval routing', () => {
  it('requires formal approval only at pilot→approval and approval→handoff', () => {
    expect(
      transitionRequiresFormalApproval({ current_gate: 'G3', current_stage: 'packaging' }),
    ).toBe(false);
    expect(
      transitionRequiresFormalApproval({ current_gate: 'G3', current_stage: 'pilot' }),
    ).toBe(true);
    expect(
      transitionRequiresFormalApproval({ current_gate: 'G4', current_stage: 'approval' }),
    ).toBe(true);
    expect(
      transitionRequiresFormalApproval({ current_gate: 'G4', current_stage: 'handoff' }),
    ).toBe(false);
  });

  it('maps formal approval checkpoints to G3 and G4 gate codes', () => {
    expect(
      formalApprovalGateCode({ current_gate: 'G3', current_stage: 'pilot' }),
    ).toBe('G3');
    expect(
      formalApprovalGateCode({ current_gate: 'G4', current_stage: 'approval' }),
    ).toBe('G4');
    expect(
      formalApprovalGateCode({ current_gate: 'G3', current_stage: 'trial' }),
    ).toBeNull();
  });
});
