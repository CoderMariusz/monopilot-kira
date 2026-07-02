// Legacy fixed-slot process-column filter (S5b) — shared by the SERVER page
// loader (loadFaDetail) and the CLIENT FaProductionTab. Must live in a plain
// module: importing a function from a 'use client' file into a Server
// Component turns it into a client reference, and CALLING it server-side
// throws at runtime in the production Turbopack build (the FG-detail
// "Nie można wczytać tego wyrobu gotowego" crash) while passing local builds.

const LEGACY_PROCESS_COLUMN_RE =
  /^(manufacturing_operation_\d+|operation_yield_\d+|intermediate_code_p\d+|intermediate_code_final|yield_line|pr_code)/;

/** True when a production column key is a legacy fixed-slot process column (S5b filter). */
export function isLegacyProcessColumn(key: string): boolean {
  return LEGACY_PROCESS_COLUMN_RE.test(key);
}
