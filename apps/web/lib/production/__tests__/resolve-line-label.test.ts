import { describe, expect, it } from 'vitest';

import { resolveProductionLineLabel } from '../resolve-line-label';

const LINE_UUID = '9a9d4be6-cda1-45ea-a1e0-5f7ded346c76';

describe('resolveProductionLineLabel (C039)', () => {
  it('prefers code and name when both are present', () => {
    expect(resolveProductionLineLabel({ lineCode: 'LINE01', lineName: 'Main line', lineId: LINE_UUID })).toBe(
      'LINE01 — Main line',
    );
  });

  it('uses code alone when name is missing', () => {
    expect(resolveProductionLineLabel({ lineCode: 'LINE01', lineId: LINE_UUID })).toBe('LINE01');
  });

  it('never returns a full UUID — falls back to an 8-char prefix', () => {
    expect(resolveProductionLineLabel({ lineId: LINE_UUID })).toBe('9a9d4be6');
    expect(resolveProductionLineLabel({ lineId: LINE_UUID })).not.toBe(LINE_UUID);
  });

  it('returns em dash when no line is assigned', () => {
    expect(resolveProductionLineLabel({ lineId: null })).toBe('—');
  });

  it('keeps legacy non-UUID identifiers as-is', () => {
    expect(resolveProductionLineLabel({ lineId: 'LINE-04' })).toBe('LINE-04');
  });
});
