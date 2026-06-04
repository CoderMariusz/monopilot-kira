'use server';

/**
 * T-088 — TEC-045 Lab Results Log: page-load read action.
 *
 * Consumes the EXISTING T-020 Technical lab READ MODEL
 * (apps/web/lib/technical/lab/read-model.ts) over the Quality-OWNED
 * `public.lab_results` table. Org isolation is enforced by RLS
 * (`app.current_org_id()`); the read model shapes the WHERE + projects rows.
 *
 * Ownership red-line (CLAUDE.md + MON-domain-technical): Technical READS
 * lab_results READ-ONLY — there is NO Technical write/approve/NCR/sign-off path.
 * Any add/request flow delegates through the Quality bridge or surfaces
 * QUALITY_BRIDGE_MISSING (see quality-bridge-client.ts) — this loader is read-only.
 *
 * No mocks: real Supabase read via withOrgContext. result_status + ATP
 * threshold_rlu are surfaced VERBATIM from Quality (never recomputed). FG
 * canonical (no FA aliases).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  type LabResultDbRow,
  type LabResultReadRow,
  type LabResultsFilter,
  type LabResultsFilterError,
  buildLabResultsQuery,
  parseLabResultsFilter,
  toLabResultReadRow,
} from '../../../../../../../lib/technical/lab/read-model';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Row enriched with the item code/name for display (joined Technical-side). */
export type LabResultLogRow = LabResultReadRow & {
  itemCode: string | null;
  itemName: string | null;
};

export type ListLabResultsResult =
  | { ok: true; state: 'ready' | 'empty'; rows: LabResultLogRow[] }
  | { ok: false; state: 'invalid_filter'; field: LabResultsFilterError['field'] }
  | { ok: false; state: 'error' };

type LabResultDbRowWithItem = LabResultDbRow & {
  item_code: string | null;
  item_name: string | null;
};

/**
 * List lab results for the Technical read-model log. The raw query string is
 * derived from the validated filter via the read model; we splice the item
 * code/name LEFT JOIN around the read-model SELECT body so the contract that
 * shapes the WHERE/limit stays the single source of truth.
 */
export async function listLabResults(
  params: Record<string, string | undefined>,
): Promise<ListLabResultsResult> {
  const parsed = parseLabResultsFilter(params);
  if (!parsed.ok) {
    return { ok: false, state: 'invalid_filter', field: parsed.field };
  }

  const filter: LabResultsFilter = parsed.filter;

  try {
    return await withOrgContext(async ({ client }): Promise<ListLabResultsResult> => {
      const qc = client as QueryClient;
      const built = buildLabResultsQuery(filter);

      // Wrap the read-model SELECT as a subquery and LEFT JOIN items for the FG
      // code/name display column (read-only; item linkage is a soft display
      // join). The read model already org-scopes + orders + limits.
      const sql = `
        select lr.*, i.item_code, i.name as item_name
          from (${built.text}) as lr
          left join public.items i
                 on i.id = lr.item_id
                and i.org_id = app.current_org_id()`;

      const { rows } = await qc.query<LabResultDbRowWithItem>(sql, built.values);

      const mapped: LabResultLogRow[] = [];
      for (const raw of rows) {
        const base = toLabResultReadRow(raw);
        if (!base) continue; // defensive: skip rows outside the canonical enum set
        mapped.push({ ...base, itemCode: raw.item_code, itemName: raw.item_name });
      }

      return { ok: true, state: mapped.length ? 'ready' : 'empty', rows: mapped };
    });
  } catch (error) {
    console.error('[technical/lab-results] listLabResults load_failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, state: 'error' };
  }
}
