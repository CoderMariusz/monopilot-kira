/**
 * Option list for the production line "default output location" picker.
 *
 * Extracted from `lines-screen.client.tsx` so the rule can be asserted directly
 * (same reason as `settings/sites/_components/site-map-pins.ts`).
 */

export type LocationOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string | null;
  path: string | null;
  /**
   * Deactivated locations are still delivered to the client (see
   * `loadLocationOptions` / `getLineFormOptions`) but are not offered as a new
   * choice. Undefined means active: the column is NOT NULL DEFAULT true, so only
   * an explicit `false` marks a location as deactivated.
   */
  isActive?: boolean;
};

/**
 * Active locations of the selected warehouse — plus, always, the line's CURRENT
 * location even if it has since been deactivated.
 *
 * Offering an inactive location would let a live line be pointed at a bin that
 * is out of service. Dropping an already-assigned inactive one is just as bad
 * the other way: the Select would have no option matching the stored value, so
 * the line could no longer be edited, and the client's "does the stored value
 * still exist?" reconciliation would null it out and wipe the setting on the
 * next save. `upsertLine` enforces the same rule server-side.
 */
export function buildOutputLocationOptions(
  locations: LocationOption[],
  warehouseId: string | null,
  currentLocationId: string | null,
): Array<{ value: string; label: string }> {
  const selectable = warehouseId
    ? locations.filter(
        (location) =>
          location.warehouseId === warehouseId &&
          (location.isActive !== false || location.id === currentLocationId),
      )
    : [];

  return [
    { value: 'none', label: '— none —' },
    ...selectable.map((location) => ({
      value: location.id,
      label: `${location.code} - ${location.name}${location.path ? ` (${location.path})` : ''}${
        location.isActive === false ? ' — inactive' : ''
      }`,
    })),
  ];
}
