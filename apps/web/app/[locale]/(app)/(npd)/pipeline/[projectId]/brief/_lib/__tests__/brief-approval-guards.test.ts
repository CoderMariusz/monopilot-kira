import { describe, expect, it } from 'vitest';

import {
  getBlockedCriticalBriefPatchKeys,
  guardBriefPatchAfterSignedApproval,
  hasSignedBriefGateApproval,
} from '../brief-approval-guards';

const BEFORE = {
  name: 'Ham 480g',
  type: 'Deli',
  target_launch: '2026-06-01',
  pack_format: 'Tray',
  pack_weight_g: '480',
  packs_per_case: 12,
  output_unit: 'pieces',
  weekly_volume_packs: '1000',
  runs_per_week: '2',
  marketing_claims: 'High protein',
  target_retail_price_eur: '4.99',
  sales_channel: 'Retail',
  target_audience: 'Families',
  constraints: 'No nuts',
  notes: 'Baseline note',
};

describe('brief-approval-guards', () => {
  it('detects signed G4 gate approvals only', () => {
    expect(hasSignedBriefGateApproval(['G2'])).toBe(false);
    expect(hasSignedBriefGateApproval(['G3'])).toBe(false);
    expect(hasSignedBriefGateApproval(['G4'])).toBe(true);
  });

  it('blocks critical field changes after a signed gate approval', () => {
    const result = guardBriefPatchAfterSignedApproval(
      { packWeightG: '500', notes: 'Updated note' },
      BEFORE,
      ['G4'],
    );
    expect(result).toEqual({
      ok: false,
      blockedFields: ['packWeightG'],
      signedGateCodes: ['G4'],
    });
  });

  it('allows notes-only edits after a signed gate approval', () => {
    const result = guardBriefPatchAfterSignedApproval({ notes: 'New note only' }, BEFORE, ['G4']);
    expect(result).toEqual({ ok: true });
    expect(getBlockedCriticalBriefPatchKeys({ notes: 'New note only' }, BEFORE)).toEqual([]);
  });

  it('allows critical edits when no signed gate approval exists', () => {
    const result = guardBriefPatchAfterSignedApproval({ packWeightG: '500' }, BEFORE, []);
    expect(result).toEqual({ ok: true });
  });

  it('treats unchanged critical values as a no-op', () => {
    const result = guardBriefPatchAfterSignedApproval(
      { packWeightG: '480', productName: 'Ham 480g' },
      BEFORE,
      ['G4'],
    );
    expect(result).toEqual({ ok: true });
  });
});
