/**
 * T-019 — Allergen contamination-risk matrix CRUD + coverage-gap report.
 *
 * Backs /api/technical/allergens/contamination-risk. The cross-contamination
 * grid maps a (line and/or machine) × allergen_code to a risk level — see
 * migration 161 (allergen_contamination_risk).
 *
 * Invariants (PRD §10.5/§10.8):
 *   - risk_level ∈ {high, medium, low, segregated} (V-TEC enum). 'extreme' → 422.
 *   - org-scoped under RLS; writes gated on technical.allergens.edit.
 *   - upsert by the natural key (org_id, line_id, machine_id, allergen_code):
 *     a re-POST of the same key UPDATES the existing row (no duplicate).
 *   - coverage gap = the EU-14 allergen codes (from "Reference"."Allergens")
 *     that have NO risk entry for the given line (V-TEC-43 dashboard input).
 *
 * Out of scope: the 08-PRODUCTION allergen-changeover gate (do not couple here).
 */

import {
  ALLERGENS_EDIT_PERMISSION,
  allergenCodeExists,
  type AllergenResult,
  hasPermission,
  isPgError,
  type OrgActionContext,
  RISK_LEVELS,
  writeAudit,
} from './shared';
import { z } from 'zod';

export const UpsertRiskInput = z
  .object({
    lineId: z.string().uuid().optional(),
    machineId: z.string().uuid().optional(),
    allergenCode: z.string().trim().min(1).max(64),
    riskLevel: z.enum(RISK_LEVELS),
    mitigation: z.string().trim().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    // Mirror the DB CHECK: a risk row must target a line and/or a machine.
    if (!val.lineId && !val.machineId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lineId'],
        message: 'a contamination-risk row must target a line and/or a machine',
      });
    }
  });
export type UpsertRiskInputType = z.input<typeof UpsertRiskInput>;

export const DeleteRiskInput = z.object({ id: z.string().uuid() });
export type DeleteRiskInputType = z.input<typeof DeleteRiskInput>;

export type RiskRow = {
  id: string;
  lineId: string | null;
  machineId: string | null;
  allergenCode: string;
  riskLevel: string;
  mitigation: string | null;
};

export async function upsertRisk(
  ctx: OrgActionContext,
  raw: unknown,
): Promise<AllergenResult<RiskRow>> {
  const parsed = UpsertRiskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  if (!(await hasPermission(ctx, ALLERGENS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

  if (!(await allergenCodeExists(ctx, input.allergenCode))) {
    return { ok: false, error: 'invalid_allergen_code' };
  }

  try {
    // Manual upsert by the natural key (the table only has a PK on id). NULL-safe
    // equality so a line-only row and a machine-only row don't collide.
    const { rows: existing } = await ctx.client.query<{ id: string }>(
      `select id from public.allergen_contamination_risk
        where org_id = $1::uuid
          and allergen_code = $2
          and line_id is not distinct from $3::uuid
          and machine_id is not distinct from $4::uuid
        limit 1`,
      [ctx.orgId, input.allergenCode, input.lineId ?? null, input.machineId ?? null],
    );

    let row: RiskRow | undefined;
    let priorId: string | null = existing[0]?.id ?? null;

    if (priorId) {
      const { rows } = await ctx.client.query<RiskRow>(
        `update public.allergen_contamination_risk
            set risk_level = $2, mitigation = $3, last_assessed_at = pg_catalog.now(), assessed_by = $4::uuid
          where org_id = $1::uuid and id = $5::uuid
          returning id, line_id as "lineId", machine_id as "machineId",
                    allergen_code as "allergenCode", risk_level as "riskLevel", mitigation`,
        [ctx.orgId, input.riskLevel, input.mitigation ?? null, ctx.userId, priorId],
      );
      row = rows[0];
    } else {
      const { rows } = await ctx.client.query<RiskRow>(
        `insert into public.allergen_contamination_risk
           (org_id, line_id, machine_id, allergen_code, risk_level, mitigation, last_assessed_at, assessed_by)
         values (app.current_org_id(), $1::uuid, $2::uuid, $3, $4, $5, pg_catalog.now(), $6::uuid)
         returning id, line_id as "lineId", machine_id as "machineId",
                   allergen_code as "allergenCode", risk_level as "riskLevel", mitigation`,
        [input.lineId ?? null, input.machineId ?? null, input.allergenCode, input.riskLevel, input.mitigation ?? null, ctx.userId],
      );
      row = rows[0];
    }
    if (!row) return { ok: false, error: 'persistence_failed' };

    await writeAudit(ctx.client, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: priorId ? 'contamination_risk.update' : 'contamination_risk.create',
      resourceType: 'allergen_contamination_risk',
      resourceId: row.id,
      beforeState: priorId ? { id: priorId } : null,
      afterState: row,
    });

    return { ok: true, data: row };
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'invalid_input' };
    console.error('[technical/allergens] upsertRisk persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteRisk(
  ctx: OrgActionContext,
  raw: unknown,
): Promise<AllergenResult<{ id: string }>> {
  const parsed = DeleteRiskInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  if (!(await hasPermission(ctx, ALLERGENS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

  try {
    const { rows: deleted } = await ctx.client.query<RiskRow>(
      `delete from public.allergen_contamination_risk
        where org_id = $1::uuid and id = $2::uuid
        returning id, line_id as "lineId", machine_id as "machineId",
                  allergen_code as "allergenCode", risk_level as "riskLevel", mitigation`,
      [ctx.orgId, input.id],
    );
    const old = deleted[0];
    if (!old) return { ok: false, error: 'not_found' };

    await writeAudit(ctx.client, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: 'contamination_risk.delete',
      resourceType: 'allergen_contamination_risk',
      resourceId: old.id,
      beforeState: old,
      afterState: null,
    });

    return { ok: true, data: { id: old.id } };
  } catch (err) {
    console.error('[technical/allergens] deleteRisk persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

// ── Read with coverage-gap report (GET ?line_id=...) ──────────────────────────
export type RiskListResult = {
  entries: RiskRow[];
  // EU-14 (+org custom) allergen codes with NO risk entry for the line.
  gaps: string[];
};

export async function listRiskForLine(
  ctx: OrgActionContext,
  lineId: string,
): Promise<AllergenResult<RiskListResult>> {
  const lineParse = z.string().uuid().safeParse(lineId);
  if (!lineParse.success) return { ok: false, error: 'invalid_input' };

  const { rows: entries } = await ctx.client.query<RiskRow>(
    `select id, line_id as "lineId", machine_id as "machineId",
            allergen_code as "allergenCode", risk_level as "riskLevel", mitigation
       from public.allergen_contamination_risk
      where org_id = $1::uuid and line_id = $2::uuid
      order by allergen_code asc`,
    [ctx.orgId, lineId],
  );

  // gap = LEFT JOIN "Reference"."Allergens" (EU-14 + org custom) × this line
  // minus the codes already present.
  const { rows: gapRows } = await ctx.client.query<{ allergen_code: string }>(
    `select a.allergen_code
       from "Reference"."Allergens" a
      where a.org_id = $1::uuid
        and not exists (
          select 1 from public.allergen_contamination_risk r
           where r.org_id = a.org_id and r.line_id = $2::uuid and r.allergen_code = a.allergen_code
        )
      order by a.allergen_code asc`,
    [ctx.orgId, lineId],
  );

  return { ok: true, data: { entries, gaps: gapRows.map((g) => g.allergen_code) } };
}

export async function listAllRisk(ctx: OrgActionContext): Promise<AllergenResult<RiskRow[]>> {
  const { rows } = await ctx.client.query<RiskRow>(
    `select id, line_id as "lineId", machine_id as "machineId",
            allergen_code as "allergenCode", risk_level as "riskLevel", mitigation
       from public.allergen_contamination_risk
      where org_id = $1::uuid
      order by allergen_code asc`,
    [ctx.orgId],
  );
  return { ok: true, data: rows };
}
