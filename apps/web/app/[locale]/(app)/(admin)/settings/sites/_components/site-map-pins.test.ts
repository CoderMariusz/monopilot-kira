import { describe, expect, it } from 'vitest';

import { resolveSitePinPositions } from './site-map-pins';

describe('resolveSitePinPositions', () => {
  it('returns the original coordinate for a solitary pin', () => {
    const [pos] = resolveSitePinPositions([{ id: 'a', map_x: 40, map_y: 55 }]);
    expect(pos).toEqual({ id: 'a', map_x: 40, map_y: 55 });
  });

  it('spreads pins that share identical coordinates deterministically by id', () => {
    const pins = [
      { id: 'site-b', map_x: 50, map_y: 50 },
      { id: 'site-a', map_x: 50, map_y: 50 },
      { id: 'site-c', map_x: 50, map_y: 50 },
    ];

    const first = resolveSitePinPositions(pins);
    const second = resolveSitePinPositions([...pins].reverse());

    expect(first).toEqual(second);
    expect(new Set(first.map((p) => `${p.map_x},${p.map_y}`)).size).toBe(3);
    first.forEach((p) => {
      expect(p.cluster_size).toBe(3);
      expect(p.cluster_index).toBeGreaterThanOrEqual(1);
      expect(p.cluster_index).toBeLessThanOrEqual(3);
    });
  });

  it('does not move pins that are far enough apart', () => {
    const result = resolveSitePinPositions([
      { id: 'a', map_x: 10, map_y: 10 },
      { id: 'b', map_x: 80, map_y: 70 },
    ]);
    expect(result).toEqual([
      { id: 'a', map_x: 10, map_y: 10 },
      { id: 'b', map_x: 80, map_y: 70 },
    ]);
  });

  it('groups pins within the proximity grid bucket', () => {
    const result = resolveSitePinPositions([
      { id: 'a', map_x: 50, map_y: 50 },
      { id: 'b', map_x: 50.2, map_y: 50.2 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.cluster_size === 2)).toBe(true);
    expect(new Set(result.map((p) => `${p.map_x},${p.map_y}`)).size).toBe(2);
  });
});
