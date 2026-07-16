export type LocationHierarchyRow = {
  id: string;
  warehouseId: string;
  parentId: string | null;
  level: number;
};

/** Warehouse uses the 3-level model (root → zone → bin) when any location reaches level 3. */
export function warehouseUsesThreeLevelHierarchy(
  warehouseId: string,
  rows: LocationHierarchyRow[],
): boolean {
  return rows.some((row) => row.warehouseId === warehouseId && row.level >= 3);
}

/**
 * A zone is the parent tier that holds bins — not a bin leaf and not the warehouse root.
 * 3-tier: zone at level 2 (parent at level 1). 2-tier: zone at level 1 (no parent).
 */
export function isLocationZone(location: LocationHierarchyRow, rows: LocationHierarchyRow[]): boolean {
  const parent = location.parentId ? rows.find((row) => row.id === location.parentId) : null;
  if (warehouseUsesThreeLevelHierarchy(location.warehouseId, rows)) {
    return location.level === 2 && parent != null && parent.level === 1;
  }
  return location.level === 1 && !location.parentId;
}

export function childBinsForZone<T extends LocationHierarchyRow>(
  location: LocationHierarchyRow,
  rows: T[],
): T[] {
  if (!isLocationZone(location, rows)) return [];
  return rows.filter((row) => row.parentId === location.id);
}
