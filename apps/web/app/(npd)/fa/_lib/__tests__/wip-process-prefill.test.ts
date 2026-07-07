import { describe, expect, it } from 'vitest';

import { wipProcessPrefillFromDefault } from '../wip-process-prefill';

describe('wipProcessPrefillFromDefault', () => {
  it('maps process-default payload fields to addWipProcess prefill args', () => {
    expect(
      wipProcessPrefillFromDefault({
        defaultDurationHours: 1.5,
        standardCost: 7.5,
        throughputPerHour: 120,
        throughputUom: 'pack',
        setupCost: 42,
        yieldPct: 95,
      }),
    ).toEqual({
      durationHours: 1.5,
      additionalCost: 7.5,
      throughputPerHour: 120,
      throughputUom: 'pack',
      setupCost: 42,
      yieldPct: 95,
    });
  });

  it('falls back to schema defaults when the default row is missing or partial', () => {
    expect(wipProcessPrefillFromDefault(null)).toEqual({
      durationHours: 0,
      additionalCost: 0,
      throughputPerHour: 0,
      throughputUom: 'kg',
      setupCost: 0,
      yieldPct: 100,
    });
    expect(wipProcessPrefillFromDefault({ throughputUom: 'invalid' })).toMatchObject({
      throughputUom: 'kg',
      yieldPct: 100,
    });
  });
});
