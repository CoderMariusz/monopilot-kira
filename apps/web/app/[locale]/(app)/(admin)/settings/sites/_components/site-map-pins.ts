/** Input pin on the sites map (percentage coordinates). */
export type SitePinInput = { id: string; map_x: number; map_y: number };

/** Resolved pin position — may be spider-offset when overlapping siblings share coords. */
export type SitePinPosition = {
  id: string;
  map_x: number;
  map_y: number;
  cluster_size?: number;
  cluster_index?: number;
};

/** Pins within this % distance are treated as co-located (default map_x/map_y = 50). */
const COORD_GRID = 0.5;

/** Radial offset (% of map box) for spider layout around a shared coordinate. */
const SPIDER_RADIUS = 5;

function clampPercent(value: number): number {
  return Math.min(98, Math.max(2, value));
}

function coordBucket(x: number, y: number): string {
  const bx = Math.round(x / COORD_GRID) * COORD_GRID;
  const by = Math.round(y / COORD_GRID) * COORD_GRID;
  return `${bx}:${by}`;
}

/**
 * Deterministically spreads pins that share (or nearly share) map coordinates so
 * none are fully hidden. Groups are keyed by rounded coords; members are sorted
 * by `id` before angle assignment so repeated renders stay stable.
 */
export function resolveSitePinPositions(pins: SitePinInput[]): SitePinPosition[] {
  const sorted = [...pins].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, SitePinInput[]>();

  for (const pin of sorted) {
    const key = coordBucket(pin.map_x, pin.map_y);
    const group = groups.get(key) ?? [];
    group.push(pin);
    groups.set(key, group);
  }

  const resolved: SitePinPosition[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = group[0];
      resolved.push({ id: only.id, map_x: only.map_x, map_y: only.map_y });
      continue;
    }

    const centerX = group[0].map_x;
    const centerY = group[0].map_y;
    const count = group.length;

    group.forEach((pin, index) => {
      const angle = (2 * Math.PI * index) / count - Math.PI / 2;
      resolved.push({
        id: pin.id,
        map_x: clampPercent(centerX + SPIDER_RADIUS * Math.cos(angle)),
        map_y: clampPercent(centerY + SPIDER_RADIUS * Math.sin(angle)),
        cluster_size: count,
        cluster_index: index + 1,
      });
    });
  }

  return resolved.sort((a, b) => a.id.localeCompare(b.id));
}
