'use server';

/**
 * T-087 — TEC-031 Regulatory Compliance Dashboard: page-load aggregate.
 *
 * Spec-driven (PRD §0/§5/§17, docs/prd/03-TECHNICAL-PRD.md). This is a
 * VISIBILITY + REMEDIATION-ROUTING surface — NOT a legal-advice engine and NOT a
 * lifecycle owner. It reads REAL Supabase data org-scoped via withOrgContext +
 * RLS (`app.current_org_id()`) and derives per-regulation coverage from the
 * Technical master data that already exists:
 *
 *   - EU 1169/2011 (FIC labelling)   → FG items that carry a declared allergen
 *     profile vs. those missing one (allergen declaration coverage).
 *   - FSMA 204 (traceability)        → FG items whose active factory_spec is
 *     bundle-approved (spec approval status) — the KDE/lot linkage proxy.
 *   - BRCGS v9 (GFSI baseline)       → FG items with a completed shelf-life config.
 *   - ISO 22000 (FSMS/HACCP)         → FG items with a valid supplier_spec chain.
 *   - EU 2023/915 (contaminants)     → FG items with at least one non-failing lab
 *     result on record (read-only over the Quality-owned lab read model).
 *
 * Every count is a real aggregate; nothing is hardcoded. Where a backing table is
 * absent for the org the count degrades to 0 of N (an open-gap signal), never a
 * fabricated percentage. Lab/HACCP gaps are ROUTED to 09-QUALITY which owns the
 * lifecycle — this surface only links out.
 *
 * Red lines honoured: FG canonical (no FA aliases); D365 optional + never a hard
 * FK here; no write path; shared BOM/factory_spec read-only.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type {
  ComplianceFlag,
  LoadComplianceResult,
  RegulationCode,
  RegulationCoverage,
  RegulationTone,
} from './shared';

// Re-export the data-shape types so existing importers can pull them from the
// action module (the const REGULATION_CODES is imported from ./shared directly,
// since a 'use server' file may only export async functions).
export type {
  ComplianceFlag,
  LoadComplianceResult,
  RegulationCode,
  RegulationCoverage,
  RegulationTone,
} from './shared';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

function toneFor(pct: number): RegulationTone {
  if (pct >= 95) return 'green';
  if (pct >= 88) return 'amber';
  return 'red';
}

function pct(covered: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((covered / total) * 100);
}

type FgRow = {
  id: string;
  item_code: string;
  name: string;
  has_allergen_profile: boolean;
  has_approved_spec: boolean;
  has_shelf_life: boolean;
  has_supplier_spec: boolean;
  has_failing_lab: boolean;
  lab_result_count: number;
  total_count: string | number;
};

const FG_LIMIT = 500;

/**
 * Aggregate the FG portfolio against each regulation's coverage proxy. One pass
 * over the FG items left-joins the satisfying signals; counting happens in JS on
 * the (small) FG row set. Every join is org-scoped by RLS — no service-role.
 *
 * The query is defensive against tables a given org may not have populated:
 * missing rows simply leave the boolean false (an open-gap signal), which is the
 * correct compliance read (you are NOT covered until proven covered).
 */
export async function loadCompliance(): Promise<LoadComplianceResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<LoadComplianceResult> => {
      const qc = client as QueryClient;

      const { rows } = await qc.query<FgRow>(
        `select
            i.id,
            i.item_code,
            i.name,
            exists (
              select 1 from public.item_allergen_profiles ap
               where ap.org_id = app.current_org_id() and ap.item_id = i.id
            ) as has_allergen_profile,
            exists (
              select 1 from public.factory_specs fs
               where fs.org_id = app.current_org_id() and fs.fg_item_id = i.id
                 and fs.status in ('approved_for_factory', 'released_to_factory')
            ) as has_approved_spec,
            (i.shelf_life_days is not null) as has_shelf_life,
            exists (
              select 1 from public.supplier_specs ss
               where ss.org_id = app.current_org_id() and ss.item_id = i.id
                 and ss.lifecycle_status = 'active'
            ) as has_supplier_spec,
            exists (
              select 1 from public.lab_results lr
               where lr.org_id = app.current_org_id() and lr.item_id = i.id
                 and lr.result_status in ('fail', 'hold')
            ) as has_failing_lab,
            (
              select count(*)::int from public.lab_results lr
               where lr.org_id = app.current_org_id() and lr.item_id = i.id
            ) as lab_result_count,
            count(*) over () as total_count
          from public.items i
         where i.org_id = app.current_org_id()
           and i.item_type = 'fg'
           and i.status = 'active'
         order by i.item_code asc
         limit $1`,
        [FG_LIMIT],
      );

      const fgTotal = rows.length;
      const fgTotalAvailable = rows.length > 0 ? Number(rows[0].total_count) : 0;

      // ── Per-regulation coverage (each numerator is a real FG count) ─────────
      const eu1169Covered = rows.filter((r) => r.has_allergen_profile).length;
      const fsma204Covered = rows.filter((r) => r.has_approved_spec).length;
      const brcgsCovered = rows.filter((r) => r.has_shelf_life).length;
      const isoCovered = rows.filter((r) => r.has_supplier_spec).length;
      // EU 2023/915: covered = FG with at least one lab result AND no failing one.
      const eu2023Covered = rows.filter(
        (r) => r.lab_result_count > 0 && !r.has_failing_lab,
      ).length;

      const mk = (code: RegulationCode, covered: number): RegulationCoverage => {
        const coveragePct = pct(covered, fgTotal);
        return {
          code,
          total: fgTotal,
          covered,
          coveragePct,
          gaps: Math.max(0, fgTotal - covered),
          tone: toneFor(coveragePct),
        };
      };

      const regulations: RegulationCoverage[] = [
        mk('eu_1169_2011', eu1169Covered),
        mk('fsma_204', fsma204Covered),
        mk('brcgs_v9', brcgsCovered),
        mk('iso_22000', isoCovered),
        mk('eu_2023_915', eu2023Covered),
      ];

      // ── Per-FG flags (remediation routing only — never auto-resolved here) ──
      const flags: ComplianceFlag[] = [];
      for (const r of rows) {
        const fg = `${r.item_code} ${r.name}`.trim();
        if (!r.has_allergen_profile) {
          flags.push({
            id: `${r.id}:eu_1169_2011`,
            fg,
            regulation: 'eu_1169_2011',
            issueKey: 'allergen_declaration_missing',
            severity: 'medium',
            routeTo: 'technical',
            routeHref: `/technical/items/${encodeURIComponent(r.item_code)}`,
          });
        }
        if (!r.has_approved_spec) {
          flags.push({
            id: `${r.id}:fsma_204`,
            fg,
            regulation: 'fsma_204',
            issueKey: 'factory_spec_unapproved',
            severity: 'high',
            routeTo: 'technical',
            routeHref: `/technical/factory-specs`,
          });
        }
        if (!r.has_shelf_life) {
          flags.push({
            id: `${r.id}:brcgs_v9`,
            fg,
            regulation: 'brcgs_v9',
            issueKey: 'shelf_life_missing',
            severity: 'low',
            routeTo: 'technical',
            routeHref: `/technical/shelf-life`,
          });
        }
        if (r.has_failing_lab) {
          flags.push({
            id: `${r.id}:eu_2023_915`,
            fg,
            regulation: 'eu_2023_915',
            issueKey: 'lab_result_failing',
            severity: 'high',
            // Lab/HACCP lifecycle is Quality-owned — route out, never fix here.
            routeTo: 'quality',
            routeHref: `/quality/lab`,
          });
        }
      }

      return {
        ok: true,
        state: fgTotal === 0 ? 'empty' : 'ready',
        regulations,
        flags,
        fgTotal,
        fgTotalAvailable,
        limit: FG_LIMIT,
        truncated: fgTotal < fgTotalAvailable,
      };
    });
  } catch (error) {
    console.error('[technical/compliance] loadCompliance failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: true, state: 'error', regulations: [], flags: [], fgTotal: 0, fgTotalAvailable: 0, limit: FG_LIMIT, truncated: false };
  }
}
