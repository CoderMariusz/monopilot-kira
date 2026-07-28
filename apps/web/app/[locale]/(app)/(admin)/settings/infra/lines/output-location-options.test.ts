import { describe, expect, it } from 'vitest';

import { buildOutputLocationOptions, type LocationOption } from './output-location-options';

const WAREHOUSE = 'wh-1';
const OTHER_WAREHOUSE = 'wh-2';

const ACTIVE_BIN: LocationOption = {
  id: 'loc-active',
  code: 'R02-ZONE',
  name: 'Zone A',
  warehouseId: WAREHOUSE,
  path: 'WH1.ZONE-A',
  isActive: true,
};

const INACTIVE_BIN: LocationOption = {
  id: 'loc-inactive',
  code: 'R02-BIN1',
  name: 'Bin 1',
  warehouseId: WAREHOUSE,
  path: 'WH1.ZONE-A.BIN1',
  isActive: false,
};

const OTHER_WAREHOUSE_BIN: LocationOption = {
  id: 'loc-elsewhere',
  code: 'W2-BIN',
  name: 'Other warehouse bin',
  warehouseId: OTHER_WAREHOUSE,
  path: 'WH2.BIN',
  isActive: true,
};

const ALL = [ACTIVE_BIN, INACTIVE_BIN, OTHER_WAREHOUSE_BIN];

function optionIds(options: Array<{ value: string }>): string[] {
  return options.map((option) => option.value);
}

describe('R02-04 default output location picker', () => {
  it('does not offer a deactivated location', () => {
    const options = buildOutputLocationOptions(ALL, WAREHOUSE, null);

    expect(optionIds(options)).toEqual(['none', ACTIVE_BIN.id]);
    expect(optionIds(options)).not.toContain(INACTIVE_BIN.id);
  });

  it('keeps the line editable when its assigned location was deactivated', () => {
    // Anti-regression: the line already points at INACTIVE_BIN. The option must
    // stay in the list, otherwise the Select has no match for the stored value —
    // the line becomes uneditable and the value is wiped on the next save.
    const options = buildOutputLocationOptions(ALL, WAREHOUSE, INACTIVE_BIN.id);

    expect(optionIds(options)).toContain(INACTIVE_BIN.id);
    expect(options.find((option) => option.value === INACTIVE_BIN.id)?.label).toContain('inactive');
  });

  it('offers only the current inactive location, never another inactive one', () => {
    const secondInactive: LocationOption = { ...INACTIVE_BIN, id: 'loc-inactive-2', code: 'R02-BIN2' };
    const options = buildOutputLocationOptions([...ALL, secondInactive], WAREHOUSE, INACTIVE_BIN.id);

    expect(optionIds(options)).toContain(INACTIVE_BIN.id);
    expect(optionIds(options)).not.toContain(secondInactive.id);
  });

  it('treats a location with no is_active field as active', () => {
    // The column is NOT NULL DEFAULT true; a projection without the field must
    // not silently disappear from the picker.
    const { isActive: _omitted, ...withoutFlag } = ACTIVE_BIN;
    const options = buildOutputLocationOptions([withoutFlag as LocationOption], WAREHOUSE, null);

    expect(optionIds(options)).toContain(ACTIVE_BIN.id);
  });

  it('never offers a location from another warehouse', () => {
    const options = buildOutputLocationOptions(ALL, WAREHOUSE, null);
    expect(optionIds(options)).not.toContain(OTHER_WAREHOUSE_BIN.id);
  });

  it('offers nothing but "none" until a warehouse is chosen', () => {
    expect(optionIds(buildOutputLocationOptions(ALL, null, null))).toEqual(['none']);
  });
});
