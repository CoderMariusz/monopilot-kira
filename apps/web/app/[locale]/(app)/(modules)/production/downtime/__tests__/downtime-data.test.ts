/**
 * C079 — downtime event log resolves line + shift labels (never raw UUIDs).
 */
import { describe, expect, it } from 'vitest';

import { resolveDowntimeLineLabel, resolveDowntimeShiftLabel } from '../_actions/downtime-data';

const LINE_UUID = '948c099f-8054-49ae-99a1-dd5bb9410cd4';

describe('downtime label resolvers (C079)', () => {
  it('resolves line code/name and shift label without exposing raw UUIDs', () => {
    expect(resolveDowntimeLineLabel('LINE1', 'Packing Line 1', LINE_UUID)).toBe('LINE1 — Packing Line 1');
    expect(resolveDowntimeLineLabel(null, null, LINE_UUID)).toBe('—');
    expect(resolveDowntimeLineLabel(null, null, 'LINE-LEGACY')).toBe('LINE-LEGACY');
    expect(resolveDowntimeShiftLabel('AM Shift', 'morning')).toBe('AM Shift');
    expect(resolveDowntimeShiftLabel(null, 'morning')).toBe('morning');
    expect(resolveDowntimeShiftLabel(null, null)).toBeNull();
  });
});
