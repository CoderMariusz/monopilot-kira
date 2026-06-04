/**
 * 03-technical BOM Generator (T-016) — pure scope-resolution + job-payload logic.
 *
 * V-TEC-15: only FGs whose product.status_overall = 'Complete' are eligible. The
 * Server Action queries the candidate FG product_codes (already org-scoped under
 * RLS) and uses `resolveEligibleFgs` to apply the 'Complete' filter + optional
 * explicit `selected` list. The result drives `expected_count` and the queued job
 * payload — the request never builds XLSX (that is the worker, async).
 *
 * Pure + DB-free so it is unit-testable in isolation. Distinct from NPD D365 Builder
 * (export-to-ERP); this is internal BOM explode/compose.
 */

import type { GeneratorOutputMode, GeneratorScope } from './shared';

export type FgCandidate = { productCode: string; statusOverall: string | null };

/** The V-TEC-15 'Complete' gate — case-insensitive on status_overall. */
export function isComplete(candidate: FgCandidate): boolean {
  return (candidate.statusOverall ?? '').trim().toLowerCase() === 'complete';
}

/**
 * Resolve the eligible FG product_codes for a generator run.
 * - scope 'all_complete': every candidate with status_overall='Complete'.
 * - scope 'selected': intersection of the requested codes with the 'Complete' set.
 * Returns a stable, de-duplicated, sorted list.
 */
export function resolveEligibleFgs(
  candidates: ReadonlyArray<FgCandidate>,
  scope: GeneratorScope,
  selected?: ReadonlyArray<string>,
): string[] {
  const complete = candidates.filter(isComplete).map((c) => c.productCode);
  const completeSet = new Set(complete);

  let eligible: string[];
  if (scope === 'selected') {
    const requested = new Set((selected ?? []).map((s) => s.trim()).filter(Boolean));
    eligible = [...requested].filter((code) => completeSet.has(code));
  } else {
    eligible = complete;
  }
  return [...new Set(eligible)].sort();
}

export type GeneratorJobPayload = {
  outputMode: GeneratorOutputMode;
  productCodes: string[];
  expectedCount: number;
};

export function buildJobPayload(
  productCodes: ReadonlyArray<string>,
  outputMode: GeneratorOutputMode,
): GeneratorJobPayload {
  const codes = [...productCodes];
  return { outputMode, productCodes: codes, expectedCount: codes.length };
}
