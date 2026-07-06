import { describe, expect, it } from 'vitest';

import {
  isYieldGateOverrideReasonCode,
  YIELD_GATE_OVERRIDE_REASON_CODES,
} from '../yield-gate-override';

describe('yield-gate override taxonomy', () => {
  it('accepts only the controlled reason codes', () => {
    for (const code of YIELD_GATE_OVERRIDE_REASON_CODES) {
      expect(isYieldGateOverrideReasonCode(code)).toBe(true);
    }
    expect(isYieldGateOverrideReasonCode('because I said so')).toBe(false);
  });
});
