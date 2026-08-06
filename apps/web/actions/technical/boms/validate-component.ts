'use server';

/**
 * T-074 — BOM component usability ENFORCEMENT seam (Server Action).
 *
 * PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5.1A, §7.1, §7.6.
 *
 * Thin enforcement consumer of the shared `validateRmUsability` decision
 * service. Called at the BOM line add/edit seam: it gathers the REAL inputs
 * (item, supplier_spec, RM allergen profile, target FG forbidden allergens,
 * Quality QC-release read model) under withOrgContext + RLS, runs the single
 * shared decision service, and — for a blocking verdict — REJECTS the change
 * with the SAME machine code and performs NO line mutation (AC5).
 *
 * It deliberately re-uses the central service rather than re-deriving the checks
 * (red line: do not duplicate ad-hoc checks in BOM actions). All non-async
 * exports (types, codes) live in the pure ../../../lib/technical/rm-usability
 * module so this `'use server'` file exports only async functions.
 */

import { withOrgContext } from '../../../lib/auth/with-org-context';
import { resolveQcRelease } from '../../../lib/technical/qc-release-policy';
import {
  validateRmUsability,
  type RmAllergenInput,
  type RmSupplierSpecInput,
  type RmUsabilityVerdict,
} from '../../../lib/technical/rm-usability';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type ValidateComponentResult =
  | { ok: true; verdict: RmUsabilityVerdict }
  | { ok: false; error: 'invalid_input' | 'item_not_found' | 'blocked' | 'persistence_failed'; verdict?: RmUsabilityVerdict; message?: string };

export interface ValidateBomComponentInput {
  /** RM item being added/edited as a BOM line. */
  itemId: string;
  /** Optional explicit supplier to validate against; defaults to the item's active approved spec. */
  supplierCode?: string;
  /** Allergen codes the target FG forbids (free-from claims etc.). */
  targetFgForbiddenAllergens?: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate (and thereby gate) an RM component for a BOM line edit. Returns the
 * full structured verdict so a UI panel / API can render every check row; when
 * the verdict blocks, returns `{ ok: false, error: 'blocked', verdict }` and the
 * caller MUST NOT persist the line.
 */
export async function validateBomComponent(raw: ValidateBomComponentInput): Promise<ValidateComponentResult> {
  if (!raw || typeof raw.itemId !== 'string' || !UUID_RE.test(raw.itemId)) {
    return { ok: false, error: 'invalid_input', message: 'itemId must be a uuid' };
  }
  const targetForbidden = Array.isArray(raw.targetFgForbiddenAllergens) ? raw.targetFgForbiddenAllergens : [];

  try {
    return await withOrgContext(async ({ client }): Promise<ValidateComponentResult> => {
      const c = client as QueryClient;

      // Item (RLS-scoped to the caller's org).
      const itemRes = await c.query<{ id: string; status: string; updated_at: string | Date }>(
        `select id, status, updated_at from public.items where id = $1::uuid`,
        [raw.itemId],
      );
      if (itemRes.rows.length === 0) {
        return { ok: false, error: 'item_not_found' };
      }
      const itemRow = itemRes.rows[0]!;

      // Supplier spec: explicit supplier_code, else the most recently updated spec for the item.
      const specRes = await c.query<{
        supplier_code: string;
        supplier_status: string;
        lifecycle_status: string;
        review_status: string;
        effective_from: string | Date | null;
        expiry_date: string | Date | null;
        cost_review_blocked: boolean;
        spec_review_blocked: boolean;
        updated_at: string | Date;
      }>(
        `select supplier_code, supplier_status, lifecycle_status, review_status,
                effective_from, expiry_date, cost_review_blocked, spec_review_blocked, updated_at
           from public.supplier_specs
          where item_id = $1::uuid
            and ($2::text is null or supplier_code = $2::text)
          order by updated_at desc
          limit 1`,
        [raw.itemId, raw.supplierCode ?? null],
      );
      const specRow = specRes.rows[0];
      const supplier: RmSupplierSpecInput | null = specRow
        ? {
            supplierCode: specRow.supplier_code,
            supplierStatus: specRow.supplier_status,
            lifecycleStatus: specRow.lifecycle_status,
            reviewStatus: specRow.review_status,
            effectiveFrom: toIso(specRow.effective_from),
            expiryDate: toIso(specRow.expiry_date),
            costReviewBlocked: specRow.cost_review_blocked,
            specReviewBlocked: specRow.spec_review_blocked,
            updatedAt: toIso(specRow.updated_at),
          }
        : null;

      // RM allergen profile (the `contains` / `may_contain` set).
      const allergenRes = await c.query<{ allergen_code: string; intensity: string }>(
        `select allergen_code, intensity from public.item_allergen_profiles where item_id = $1::uuid`,
        [raw.itemId],
      );
      const rmAllergens: RmAllergenInput[] = allergenRes.rows.map((r) => ({
        allergenCode: r.allergen_code,
        intensity: r.intensity,
      }));

      // WHETHER a QC release is required is ORG POLICY, resolved server-side —
      // it used to come from `raw.requireQcRelease`, i.e. from the client, so a
      // caller could switch the food-safety check off by posting `false`.
      const qcRelease = await resolveQcRelease(c, raw.itemId);

      const verdict = validateRmUsability({
        context: 'bom_edit',
        item: { id: itemRow.id, status: itemRow.status, updatedAt: toIso(itemRow.updated_at) },
        supplier,
        rmAllergens,
        targetFgForbiddenAllergens: targetForbidden,
        qcRelease,
      });

      if (!verdict.usable) {
        // AC5: reject with the same code; NO line mutation performed here.
        return { ok: false, error: 'blocked', verdict };
      }
      return { ok: true, verdict };
    });
  } catch (err) {
    console.error('[technical/boms] validateBomComponent failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
