/**
 * P2-PLANNING — UoM dropdown shape builder for the PO/TO line editors.
 *
 * BUG FIX: the PO/TO line UoM pickers used to be driven by a HARDCODED static
 * {kg,g,l,ml,pcs,pack,box,pallet} list, so custom units an admin adds in
 * Settings → Units (which createUnit writes to public.unit_of_measure) never
 * appeared. This helper turns the REAL org-scoped units (listOrgUnits / listPoUnits
 * / listTransferUnits) into the `{ placeholder, options, units }` shape the
 * UomSelect dropdown consumes — showing code + name, never raw UUIDs.
 *
 * When the org has no readable units (read failure / brand-new org before the seed
 * lands), we fall back to the supplied canonical default labels so the dropdown is
 * never empty. Placeholder copy stays localized (passed in from the page).
 */

import type { OrgUnitOption } from './procurement-shared';

export type UomDropdown = {
  placeholder: string;
  /** Display label keyed by unit code (e.g. { kg: 'kg — Kilogram', … }). */
  options: Record<string, string>;
  /** Ordered unit codes to offer; empty array → caller keeps canonical defaults. */
  units: string[];
};

type CanonicalFallback = {
  placeholder: string;
  options: Record<string, string>;
};

/**
 * Build the UoM dropdown shape from the org's real units. `name` is appended to
 * the code (`code — name`) so the dropdown is self-describing while the stored
 * value stays the stable code. Duplicate/blank codes are dropped; ordering is the
 * caller's (base-first, then code) preserved as given.
 */
export function buildUomDropdown(orgUnits: OrgUnitOption[], fallback: CanonicalFallback): UomDropdown {
  const seen = new Set<string>();
  const units: string[] = [];
  const options: Record<string, string> = {};

  for (const unit of orgUnits) {
    const code = unit.code.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    units.push(code);
    const name = unit.name.trim();
    options[code] = name && name !== code ? `${code} — ${name}` : code;
  }

  // No real units → keep the canonical default labels (and let the dropdown use
  // its built-in default set by returning an empty `units`).
  if (units.length === 0) {
    return { placeholder: fallback.placeholder, options: { ...fallback.options }, units: [] };
  }

  return { placeholder: fallback.placeholder, options, units };
}
