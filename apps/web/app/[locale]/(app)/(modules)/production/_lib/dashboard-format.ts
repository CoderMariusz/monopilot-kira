/**
 * Dashboard kg display formatting (C090) — kept out of the `'use server'`
 * dashboard-data module, which may only export async server actions.
 */

/** Format kg quantities for dashboard display — up to 3 dp, no integer rounding. */
export const DASHBOARD_KG_DISPLAY_FMT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatDashboardKg(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return DASHBOARD_KG_DISPLAY_FMT.format(n);
}
