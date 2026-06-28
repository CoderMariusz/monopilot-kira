import { describe, expect, it } from 'vitest';

import {
  DEPT_KEYS,
  deriveDeptStatuses,
  type DeptKey,
} from './derive-dept-statuses';

describe('deriveDeptStatuses — Defect A1-2 activeDepts filter', () => {
  it('omits departments not in activeDepts (deactivated non-Core depts produce no status)', () => {
    const active = new Set<DeptKey>(['core', 'planning', 'commercial']);
    const out = deriveDeptStatuses({}, {}, active);

    // Exactly the three active keys are present — production (deactivated) is gone.
    expect(Object.keys(out).sort()).toEqual(['commercial', 'core', 'planning']);
    expect('production' in out).toBe(false);
    expect(out.production).toBeUndefined();
  });

  it('is a pure no-op for the all-7-active state (matches the no-3rd-arg call)', () => {
    const values = {
      closed_core: 'Yes',
      closed_planning: 'Yes',
      product_name: 'X',
    };

    const withFullSet = deriveDeptStatuses(values, {}, new Set<DeptKey>(DEPT_KEYS));
    const withoutArg = deriveDeptStatuses(values, {});

    expect(withFullSet).toEqual(withoutArg);
    // And the full map carries every department (no key dropped).
    expect(Object.keys(withFullSet).sort()).toEqual([...DEPT_KEYS].sort());
  });

  it('undefined activeDepts returns the full 7-dept map (backward-compatible)', () => {
    const out = deriveDeptStatuses({}, {});
    expect(Object.keys(out).sort()).toEqual([...DEPT_KEYS].sort());
  });
});
