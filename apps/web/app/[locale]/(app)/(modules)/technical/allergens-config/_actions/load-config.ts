'use server';

/**
 * T-048 — TEC-042 / TEC-043 Allergens config loader + mutations.
 *
 * Drives the EXISTING allergen services (lib/technical/allergens/manufacturing-op.ts
 * + contamination.ts) under withOrgContext + RLS. Real Supabase data, no mocks:
 *   - manufacturing-operation allergen additions (process-added allergens);
 *   - the line × allergen contamination-risk matrix
 *     (public.allergen_contamination_risk);
 *   - the EU-14 + org-custom allergen reference list (matrix columns);
 *   - the production lines (matrix rows) + manufacturing operations (mfg-op picker);
 *   - per-line coverage gaps (EU-14 codes with no risk entry — V-TEC-43);
 *   - the caller's technical.allergens.edit capability (read-only when absent).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  type OrgActionContext,
  type QueryClient,
  type AllergenActionError,
  ALLERGENS_EDIT_PERMISSION,
  hasPermission,
} from '../../../../../../../lib/technical/allergens/shared';
import {
  upsertMfgOpAllergen,
  deleteMfgOpAllergen,
  type MfgOpAllergenRow,
} from '../../../../../../../lib/technical/allergens/manufacturing-op';
import { upsertRisk, deleteRisk } from '../../../../../../../lib/technical/allergens/contamination';

export type AllergenRefCol = { allergenCode: string; allergenName: string };
export type LineRow = { id: string; code: string; name: string };
export type MfgOpRow = { operationName: string };

export type RiskCell = {
  id: string;
  lineId: string;
  allergenCode: string;
  riskLevel: string;
  mitigation: string | null;
};

export type MfgOpAddition = {
  manufacturingOperationName: string;
  allergenCode: string;
  reason: string | null;
};

export type AllergensConfigData = {
  allergens: AllergenRefCol[];
  lines: LineRow[];
  operations: MfgOpRow[];
  risks: RiskCell[];
  mfgOpAdditions: MfgOpAddition[];
  /** Total count of (line × EU-14 allergen) cells with no risk entry (V-TEC-43). */
  coverageGapCount: number;
  canEdit: boolean;
  state: 'ready' | 'empty' | 'error';
};

export async function loadAllergensConfig(): Promise<AllergensConfigData> {
  const empty: AllergensConfigData = {
    allergens: [],
    lines: [],
    operations: [],
    risks: [],
    mfgOpAdditions: [],
    coverageGapCount: 0,
    canEdit: false,
    state: 'error',
  };
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };

      const [allergensResult, linesResult, opsResult, risksResult, mfgResult, canEdit] =
        await Promise.all([
          ctx.client.query<{ allergen_code: string; allergen_name: string }>(
            `select allergen_code, allergen_name from "Reference"."Allergens"
              where org_id = app.current_org_id() order by allergen_name asc`,
          ),
          ctx.client.query<{ id: string; code: string; name: string }>(
            `select id, code, name from public.production_lines
              where org_id = app.current_org_id() and status = 'active'
              order by name asc`,
          ),
          ctx.client.query<{ operation_name: string }>(
            `select operation_name from "Reference"."ManufacturingOperations"
              where org_id = app.current_org_id() and is_active = true
              order by operation_name asc`,
          ),
          ctx.client.query<{
            id: string;
            line_id: string | null;
            allergen_code: string;
            risk_level: string;
            mitigation: string | null;
          }>(
            `select id, line_id, allergen_code, risk_level, mitigation
               from public.allergen_contamination_risk
              where org_id = app.current_org_id() and line_id is not null
              order by allergen_code asc`,
          ),
          ctx.client.query<{
            manufacturing_operation_name: string;
            allergen_code: string;
            reason: string | null;
          }>(
            `select manufacturing_operation_name, allergen_code, reason
               from public.manufacturing_operation_allergen_additions
              where org_id = app.current_org_id()
              order by manufacturing_operation_name asc, allergen_code asc`,
          ),
          hasPermission(ctx, ALLERGENS_EDIT_PERMISSION),
        ]);

      const allergens: AllergenRefCol[] = allergensResult.rows.map((r) => ({
        allergenCode: r.allergen_code,
        allergenName: r.allergen_name,
      }));
      const lines: LineRow[] = linesResult.rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
      const operations: MfgOpRow[] = opsResult.rows.map((r) => ({ operationName: r.operation_name }));
      const risks: RiskCell[] = risksResult.rows
        .filter((r): r is typeof r & { line_id: string } => r.line_id !== null)
        .map((r) => ({
          id: r.id,
          lineId: r.line_id,
          allergenCode: r.allergen_code,
          riskLevel: r.risk_level,
          mitigation: r.mitigation,
        }));
      const mfgOpAdditions: MfgOpAddition[] = mfgResult.rows.map((r) => ({
        manufacturingOperationName: r.manufacturing_operation_name,
        allergenCode: r.allergen_code,
        reason: r.reason,
      }));

      // Coverage gap = (line × allergen) cells with no risk entry (V-TEC-43).
      const present = new Set(risks.map((r) => `${r.lineId}::${r.allergenCode}`));
      let coverageGapCount = 0;
      for (const line of lines) {
        for (const a of allergens) {
          if (!present.has(`${line.id}::${a.allergenCode}`)) coverageGapCount += 1;
        }
      }

      const hasAny = lines.length > 0 || operations.length > 0 || allergens.length > 0;
      return {
        allergens,
        lines,
        operations,
        risks,
        mfgOpAdditions,
        coverageGapCount,
        canEdit,
        state: hasAny ? 'ready' : 'empty',
      };
    });
  } catch (error) {
    console.error('[technical/allergens] loadAllergensConfig failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return empty;
  }
}

type MutationResult = { ok: true } | { ok: false; error: AllergenActionError };

export async function saveRiskCell(input: {
  lineId: string;
  allergenCode: string;
  riskLevel: string;
  mitigation?: string;
}): Promise<MutationResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      const result = await upsertRisk(ctx, input);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
  } catch (error) {
    console.error('[technical/allergens] saveRiskCell failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function removeRiskCell(input: { id: string }): Promise<MutationResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      const result = await deleteRisk(ctx, input);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
  } catch (error) {
    console.error('[technical/allergens] removeRiskCell failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function saveMfgOpAddition(input: {
  manufacturingOperationName: string;
  allergenCode: string;
  reason?: string;
}): Promise<{ ok: true; data: MfgOpAllergenRow } | { ok: false; error: AllergenActionError }> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      const result = await upsertMfgOpAllergen(ctx, input);
      return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
    });
  } catch (error) {
    console.error('[technical/allergens] saveMfgOpAddition failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function removeMfgOpAddition(input: {
  manufacturingOperationName: string;
  allergenCode: string;
}): Promise<MutationResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      const result = await deleteMfgOpAllergen(ctx, input);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
  } catch (error) {
    console.error('[technical/allergens] removeMfgOpAddition failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
