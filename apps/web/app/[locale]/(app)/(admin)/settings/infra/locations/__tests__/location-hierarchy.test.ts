import { describe, expect, it } from 'vitest';

import { childBinsForZone, isLocationZone, warehouseUsesThreeLevelHierarchy } from '../location-hierarchy';
import { mapUpsertLocationError } from '../location-upsert-errors';

const threeTierRows = [
  { id: 'root-apex', warehouseId: 'wh-apex', parentId: null, level: 1 },
  { id: 'zone-a02', warehouseId: 'wh-apex', parentId: 'root-apex', level: 2 },
  { id: 'bin-a02-01', warehouseId: 'wh-apex', parentId: 'zone-a02', level: 3 },
  { id: 'bin-a02-02', warehouseId: 'wh-apex', parentId: 'zone-a02', level: 3 },
];

const twoTierRows = [
  { id: 'zone-r02', warehouseId: 'wh-r02', parentId: null, level: 1 },
  { id: 'bin-r02', warehouseId: 'wh-r02', parentId: 'zone-r02', level: 2 },
];

describe('location hierarchy helpers (C017)', () => {
  it('detects a 3-tier warehouse when any location reaches level 3', () => {
    expect(warehouseUsesThreeLevelHierarchy('wh-apex', threeTierRows)).toBe(true);
    expect(warehouseUsesThreeLevelHierarchy('wh-r02', twoTierRows)).toBe(false);
  });

  it('treats level-2 nodes as zones and level-3 nodes as bins in a 3-tier warehouse', () => {
    const zone = threeTierRows[1]!;
    const bin = threeTierRows[2]!;

    expect(isLocationZone(zone, threeTierRows)).toBe(true);
    expect(isLocationZone(bin, threeTierRows)).toBe(false);
    expect(childBinsForZone(zone, threeTierRows).map((row) => row.id)).toEqual(['bin-a02-01', 'bin-a02-02']);
    expect(childBinsForZone(bin, threeTierRows)).toEqual([]);
  });

  it('does not show bin occupancy for the warehouse root in a 3-tier warehouse', () => {
    expect(isLocationZone(threeTierRows[0]!, threeTierRows)).toBe(false);
  });

  it('treats level-1 nodes as zones and level-2 leaves as bins in a 2-tier warehouse', () => {
    const zone = twoTierRows[0]!;
    const bin = twoTierRows[1]!;

    expect(isLocationZone(zone, twoTierRows)).toBe(true);
    expect(isLocationZone(bin, twoTierRows)).toBe(false);
    expect(childBinsForZone(zone, twoTierRows).map((row) => row.id)).toEqual(['bin-r02']);
    expect(childBinsForZone(bin, twoTierRows)).toEqual([]);
  });
});

describe('mapUpsertLocationError (C016)', () => {
  const labels = {
    upsertError: 'Location save failed.',
    duplicateCodeError: 'A location with this code already exists in this warehouse.',
    depthExceeded: 'Maximum location depth for this tenant is 3 levels (warehouse → zone → bin).',
  };

  it('maps duplicate_code to the warehouse-scoped duplicate message', () => {
    expect(mapUpsertLocationError('duplicate_code', labels)).toBe(labels.duplicateCodeError);
  });

  it('maps depth_exceeded and falls back to the generic save failure', () => {
    expect(mapUpsertLocationError('depth_exceeded', labels)).toBe(labels.depthExceeded);
    expect(mapUpsertLocationError('persistence_failed', labels)).toBe(labels.upsertError);
  });
});
