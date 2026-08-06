/**
 * Server-side source of truth for `RmQcReleaseInput` (rm-usability.ts §7, AC6).
 *
 * WHY THIS EXISTS (2026-08-06). "Is a QC release required for this RM?" had two
 * answers in the codebase and neither was authoritative:
 *   - technical/bom/_actions/shared.ts hardcoded `{ required: false }`, so the
 *     QC_RELEASE_MISSING check could never fire on any BOM path; and
 *   - actions/technical/boms/validate-component.ts took it from the Server
 *     Action's own argument, i.e. from the CLIENT — anyone posting
 *     `{ requireQcRelease: false }` switched the food-safety check off.
 * Whether quality control is required is org policy. It is resolved here, from
 * the org's own row, and callers do not get to pass it in.
 *
 * The policy flag is `tenant_variations.feature_flags->>'require_grn_qc_inspection'`
 * — the org-admin toggle under Settings → Quality (gated on `settings.flags.edit`,
 * see (admin)/settings/quality/_actions/setRequireGrnQcInspection.ts). It is the
 * only configured QC-required policy in the schema; PRD 03-TECHNICAL §15A.3 says
 * the RM check applies "where configured", and this is what "configured" means.
 *
 * ponytail: one org-wide flag. If QC-required ever has to vary per item or per
 * item_type, add the column and widen `resolveQcRelease` — the two call sites do
 * not change.
 */

import type { RmQcReleaseInput } from './rm-usability';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/**
 * Resolve the QC-release input for one RM item under the CALLER'S org context
 * (RLS via `app.current_org_id()`; no org id is accepted from the caller).
 *
 * `required` false when the org has not enabled the policy — an absent
 * `tenant_variations` row is the expected "not configured" answer, not a
 * failure. A query error is NOT swallowed: it propagates, and every caller
 * turns that into a refusal rather than into a silent "QC not required".
 */
export async function resolveQcRelease(client: QueryClient, itemId: string | null): Promise<RmQcReleaseInput> {
  const { rows } = await client.query<{ require_qc: boolean }>(
    `select coalesce((tv.feature_flags->>'require_grn_qc_inspection') = 'true', false) as require_qc
       from public.tenant_variations tv
      where tv.org_id = app.current_org_id()
      limit 1`,
  );
  if (rows[0]?.require_qc !== true) return { required: false };
  if (!itemId) return { required: true, status: null, evidenceAt: null };

  // Quality-owned read model, read-only (grants narrowed by migration 226).
  // `lab_results.result_status` has no 'released' value — 'pass' IS the release.
  const { rows: qcRows } = await client.query<{
    result_status: string;
    tested_at: string | Date | null;
    created_at: string | Date;
  }>(
    `select result_status, tested_at, created_at
       from public.lab_results
      where org_id = app.current_org_id()
        and item_id = $1::uuid
      order by coalesce(tested_at, created_at) desc
      limit 1`,
    [itemId],
  );
  const qc = qcRows[0];
  return {
    required: true,
    status: qc?.result_status === 'pass' ? 'released' : (qc?.result_status ?? null),
    evidenceAt: qc ? toIso(qc.tested_at ?? qc.created_at) : null,
  };
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
