/**
 * T-018 — Manufacturing-operation allergen additions CRUD service.
 *
 * Backs /api/technical/manufacturing-operations/allergens. Process-added
 * allergens are keyed by the composite (org_id, manufacturing_operation_name,
 * allergen_code) — see migration 161.
 *
 * Invariants (PRD §10.4/§6.5/§10.7):
 *   - manufacturing_operation_name must reference
 *     "Reference"."ManufacturingOperations" (V-TEC-63) — no ad-hoc values.
 *   - allergen_code must reference "Reference"."Allergens" (V-TEC-40 family).
 *   - org-scoped under RLS; writes gated on technical.allergens.edit.
 *   - DELETE records action='manufacturing_op.allergen.delete' in audit_log.
 *
 * Consumed by the allergen cascade rule (T-024) when computing FG allergens
 * (UNION of RM component allergens via BOM + manufacturing-op additions).
 */

import {
  ALLERGENS_EDIT_PERMISSION,
  allergenCodeExists,
  type AllergenResult,
  hasPermission,
  isPgError,
  manufacturingOperationExists,
  type OrgActionContext,
  writeAudit,
} from './shared';
import { z } from 'zod';

export const UpsertMfgOpAllergenInput = z.object({
  manufacturingOperationName: z.string().trim().min(1).max(128),
  allergenCode: z.string().trim().min(1).max(64),
  reason: z.string().trim().max(2000).optional(),
});
export type UpsertMfgOpAllergenInputType = z.input<typeof UpsertMfgOpAllergenInput>;

export const DeleteMfgOpAllergenInput = z.object({
  manufacturingOperationName: z.string().trim().min(1).max(128),
  allergenCode: z.string().trim().min(1).max(64),
});
export type DeleteMfgOpAllergenInputType = z.input<typeof DeleteMfgOpAllergenInput>;

export type MfgOpAllergenRow = {
  manufacturingOperationName: string;
  allergenCode: string;
  reason: string | null;
};

export async function upsertMfgOpAllergen(
  ctx: OrgActionContext,
  raw: unknown,
): Promise<AllergenResult<MfgOpAllergenRow>> {
  const parsed = UpsertMfgOpAllergenInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  if (!(await hasPermission(ctx, ALLERGENS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

  // V-TEC-63: the manufacturing operation must exist in the Reference table.
  if (!(await manufacturingOperationExists(ctx, input.manufacturingOperationName))) {
    return { ok: false, error: 'invalid_manufacturing_operation' };
  }
  // allergen_code soft-reference guard.
  if (!(await allergenCodeExists(ctx, input.allergenCode))) {
    return { ok: false, error: 'invalid_allergen_code' };
  }

  try {
    const { rows: priorRows } = await ctx.client.query<MfgOpAllergenRow>(
      `select manufacturing_operation_name as "manufacturingOperationName",
              allergen_code as "allergenCode", reason
         from public.manufacturing_operation_allergen_additions
        where org_id = $1::uuid and manufacturing_operation_name = $2 and allergen_code = $3`,
      [ctx.orgId, input.manufacturingOperationName, input.allergenCode],
    );
    const prior = priorRows[0] ?? null;

    const { rows: upserted } = await ctx.client.query<MfgOpAllergenRow>(
      `insert into public.manufacturing_operation_allergen_additions
         (org_id, manufacturing_operation_name, allergen_code, reason, created_by)
       values (app.current_org_id(), $1, $2, $3, $4::uuid)
       on conflict (org_id, manufacturing_operation_name, allergen_code) do update
         set reason = excluded.reason
       returning manufacturing_operation_name as "manufacturingOperationName",
                 allergen_code as "allergenCode", reason`,
      [input.manufacturingOperationName, input.allergenCode, input.reason ?? null, ctx.userId],
    );
    const row = upserted[0];
    if (!row) return { ok: false, error: 'persistence_failed' };

    await writeAudit(ctx.client, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: prior ? 'manufacturing_op.allergen.update' : 'manufacturing_op.allergen.create',
      resourceType: 'manufacturing_operation_allergen_addition',
      resourceId: `${input.manufacturingOperationName}:${input.allergenCode}`,
      beforeState: prior,
      afterState: row,
    });

    return { ok: true, data: row };
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/allergens] upsertMfgOpAllergen persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteMfgOpAllergen(
  ctx: OrgActionContext,
  raw: unknown,
): Promise<AllergenResult<{ manufacturingOperationName: string; allergenCode: string }>> {
  const parsed = DeleteMfgOpAllergenInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  if (!(await hasPermission(ctx, ALLERGENS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

  try {
    const { rows: deleted } = await ctx.client.query<MfgOpAllergenRow>(
      `delete from public.manufacturing_operation_allergen_additions
        where org_id = $1::uuid and manufacturing_operation_name = $2 and allergen_code = $3
        returning manufacturing_operation_name as "manufacturingOperationName",
                  allergen_code as "allergenCode", reason`,
      [ctx.orgId, input.manufacturingOperationName, input.allergenCode],
    );
    const old = deleted[0];
    if (!old) return { ok: false, error: 'not_found' };

    await writeAudit(ctx.client, {
      orgId: ctx.orgId,
      actorUserId: ctx.userId,
      action: 'manufacturing_op.allergen.delete',
      resourceType: 'manufacturing_operation_allergen_addition',
      resourceId: `${input.manufacturingOperationName}:${input.allergenCode}`,
      beforeState: old,
      afterState: null,
    });

    return {
      ok: true,
      data: {
        manufacturingOperationName: input.manufacturingOperationName,
        allergenCode: input.allergenCode,
      },
    };
  } catch (err) {
    console.error('[technical/allergens] deleteMfgOpAllergen persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function listMfgOpAllergens(
  ctx: OrgActionContext,
  operationName?: string,
): Promise<AllergenResult<MfgOpAllergenRow[]>> {
  const params: unknown[] = [ctx.orgId];
  let where = `org_id = $1::uuid`;
  if (operationName) {
    params.push(operationName);
    where += ` and manufacturing_operation_name = $2`;
  }
  const { rows } = await ctx.client.query<MfgOpAllergenRow>(
    `select manufacturing_operation_name as "manufacturingOperationName",
            allergen_code as "allergenCode", reason
       from public.manufacturing_operation_allergen_additions
      where ${where}
      order by manufacturing_operation_name asc, allergen_code asc`,
    params,
  );
  return { ok: true, data: rows };
}
