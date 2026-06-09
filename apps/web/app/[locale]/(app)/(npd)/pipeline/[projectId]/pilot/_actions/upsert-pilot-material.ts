'use server';

/**
 * NPD PILOT stage — `upsertPilotMaterial` write Server Action.
 *
 * Creates or updates a material-reservation row for a pilot run. The `status`
 * column is recomputed server-side (reserved >= required → 'reserved', else
 * 'short') so it can never drift from the numbers. Org-scoped via withOrgContext
 * → RLS with app.current_org_id(). RBAC write gate = `npd.pilot.write`
 * (BYTE-IDENTICAL to the seeded permission string).
 *
 * Numeric inputs stay decimal STRINGS (never floats) and are bound ::numeric.
 * Writes an append-only audit_events row and revalidates the pilot route.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasPilotPermission } from './get-pilot-run';

const DECIMAL = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal string');

const Input = z.object({
  projectId: z.string().uuid(),
  pilotRunId: z.string().uuid(),
  materialId: z.string().uuid().nullable().optional(),
  ingredientCode: z.string().trim().min(1).max(120),
  requiredKg: DECIMAL,
  availableKg: DECIMAL,
  reservedKg: DECIMAL,
});

export type UpsertPilotMaterialInput = z.infer<typeof Input>;

export type UpsertPilotMaterialError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'persistence_failed';

export type UpsertPilotMaterialResult =
  | { ok: true; data: { materialId: string; status: 'reserved' | 'short' } }
  | { ok: false; error: UpsertPilotMaterialError; message?: string };

const WRITE_PERMISSION = 'npd.pilot.write';

// ─── Exact decimal-string compare (no float coercion) ─────────────────────────
function gte(a: string, b: string): boolean {
  const norm = (v: string) => {
    const [int, frac = ''] = v.trim().split('.');
    return BigInt(int + frac.slice(0, 8).padEnd(8, '0'));
  };
  return norm(a) >= norm(b);
}

export async function upsertPilotMaterial(raw: unknown): Promise<UpsertPilotMaterialResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  const status: 'reserved' | 'short' = gte(input.reservedKg, input.requiredKg) ? 'reserved' : 'short';

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPilotPermission(ctx, WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      // The run must exist within the org and belong to the project (RLS-scoped).
      const run = await ctx.client.query<{ id: string }>(
        `select id from public.pilot_runs
          where id = $1::uuid and project_id = $2::uuid and org_id = app.current_org_id() limit 1`,
        [input.pilotRunId, input.projectId],
      );
      if (run.rows.length === 0) {
        return { ok: false as const, error: 'not_found' as const };
      }

      const upsert = await ctx.client.query<{ id: string }>(
        input.materialId
          ? `update public.pilot_run_materials
                set ingredient_code = $3,
                    required_kg     = $4::numeric,
                    available_kg    = $5::numeric,
                    reserved_kg     = $6::numeric,
                    status          = $7,
                    updated_by      = $8::uuid
              where id = $1::uuid and pilot_run_id = $2::uuid and org_id = app.current_org_id()
              returning id`
          : // NOTE: the INSERT branch has its own $1-based numbering — an unreferenced
            // leading parameter is untypable in the extended protocol and fails every
            // insert with "could not determine data type of parameter $1" (same bug
            // class as upsert-pilot-run).
            `insert into public.pilot_run_materials
                (org_id, pilot_run_id, ingredient_code, required_kg, available_kg, reserved_kg,
                 status, created_by, updated_by)
              values (app.current_org_id(), $1::uuid, $2, $3::numeric, $4::numeric, $5::numeric,
                 $6, $7::uuid, $7::uuid)
              returning id`,
        input.materialId
          ? [
              input.materialId,
              input.pilotRunId,
              input.ingredientCode,
              input.requiredKg,
              input.availableKg,
              input.reservedKg,
              status,
              ctx.userId,
            ]
          : [
              input.pilotRunId,
              input.ingredientCode,
              input.requiredKg,
              input.availableKg,
              input.reservedKg,
              status,
              ctx.userId,
            ],
      );
      const materialId = upsert.rows[0]?.id;
      if (!materialId) return { ok: false as const, error: 'not_found' as const };

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 $2, 'pilot_run_material', $3, $4::jsonb, gen_random_uuid(), 'standard')`,
        [
          ctx.userId,
          input.materialId ? 'npd.pilot.material.updated' : 'npd.pilot.material.created',
          materialId,
          JSON.stringify({
            ingredientCode: input.ingredientCode,
            requiredKg: input.requiredKg,
            availableKg: input.availableKg,
            reservedKg: input.reservedKg,
            status,
          }),
        ],
      );

      revalidatePath(`/[locale]/(app)/(npd)/pipeline/${input.projectId}/pilot`, 'page');

      return { ok: true as const, data: { materialId, status } };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23503') return { ok: false, error: 'not_found' };
    console.error('[upsertPilotMaterial] persistence_failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
