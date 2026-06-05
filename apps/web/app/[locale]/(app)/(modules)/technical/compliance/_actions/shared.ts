/**
 * T-087 — TEC-031 Regulatory Compliance Dashboard: shared types + constants.
 *
 * Plain (non-`'use server'`) module. The `'use server'` action file
 * (load-compliance.ts) may only export async functions, so the const
 * REGULATION_CODES and the data-shape types live here and are imported by both
 * the action and the UI (page + client + tests).
 */

/** Stable regulation codes surfaced as KPI tiles (PRD §0/§5/§17). */
export const REGULATION_CODES = [
  'eu_1169_2011',
  'fsma_204',
  'brcgs_v9',
  'iso_22000',
  'eu_2023_915',
] as const;
export type RegulationCode = (typeof REGULATION_CODES)[number];

export type RegulationTone = 'green' | 'amber' | 'red';

export type RegulationCoverage = {
  code: RegulationCode;
  /** total FG items in scope for this regulation (denominator). */
  total: number;
  /** FG items satisfying the regulation's coverage check (numerator). */
  covered: number;
  /** integer percent 0..100 (100 when total === 0 — vacuously covered). */
  coveragePct: number;
  /** open gaps = total - covered. */
  gaps: number;
  tone: RegulationTone;
};

export type ComplianceFlag = {
  id: string;
  /** FG item code + name (canonical FG, never FA). */
  fg: string;
  regulation: RegulationCode;
  /** stable issue key → i18n copy. */
  issueKey:
    | 'allergen_declaration_missing'
    | 'factory_spec_unapproved'
    | 'shelf_life_missing'
    | 'supplier_spec_missing'
    | 'lab_result_failing';
  severity: 'high' | 'medium' | 'low';
  /** the owning module a "Route →" dispatches to. */
  routeTo: 'quality' | 'technical';
  /** deep-link for the Route action (read-only cross-link). */
  routeHref: string;
};

export type LoadComplianceResult =
  | {
      ok: true;
      state: 'ready' | 'empty';
      regulations: RegulationCoverage[];
      flags: ComplianceFlag[];
      fgTotal: number;
      fgTotalAvailable: number;
      limit: number;
      truncated: boolean;
    }
  | { ok: true; state: 'error'; regulations: []; flags: []; fgTotal: 0; fgTotalAvailable: 0; limit: number; truncated: false };
