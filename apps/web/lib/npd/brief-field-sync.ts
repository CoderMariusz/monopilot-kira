/**
 * W4-B — legacy write-through helpers for deduplicated NPD brief fields.
 * `expected_volume` (free text) is kept for legacy readers; UI writes only
 * `weekly_volume_packs` and mirrors a plain numeric string here when possible.
 */

/** Mirror weekly_volume_packs into expected_volume for legacy consumers. */
export function expectedVolumeFromWeeklyPacks(
  weeklyVolumePacks: string | number | null | undefined,
): string | null {
  if (weeklyVolumePacks === null || weeklyVolumePacks === undefined) return null;
  const trimmed = String(weeklyVolumePacks).trim();
  if (trimmed === '' || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return trimmed;
}
