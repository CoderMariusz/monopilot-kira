import { describe, expect, it } from 'vitest';

import { DEFAULT_PM_BLOCK_HOURS, pmBlockHoursFromConfigParams } from '../pm-windows';

describe('pmBlockHoursFromConfigParams', () => {
  it('returns the default when params are missing or invalid', () => {
    expect(pmBlockHoursFromConfigParams(null)).toBe(DEFAULT_PM_BLOCK_HOURS);
    expect(pmBlockHoursFromConfigParams({})).toBe(DEFAULT_PM_BLOCK_HOURS);
    expect(pmBlockHoursFromConfigParams({ pm_block_hours: 0 })).toBe(DEFAULT_PM_BLOCK_HOURS);
    expect(pmBlockHoursFromConfigParams({ pm_block_hours: 'nope' })).toBe(DEFAULT_PM_BLOCK_HOURS);
  });

  it('reads pm_block_hours from scheduler_config.params', () => {
    expect(pmBlockHoursFromConfigParams({ pm_block_hours: 6 })).toBe(6);
    expect(pmBlockHoursFromConfigParams({ pm_block_hours: '2.5' })).toBe(2.5);
  });
});
