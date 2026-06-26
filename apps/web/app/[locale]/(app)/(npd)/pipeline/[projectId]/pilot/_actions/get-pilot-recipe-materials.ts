'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasPilotPermission } from './get-pilot-run';
import { pilotMaterialStatus, type PilotMaterialStatus } from './_helpers';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

const Input = z.object({
  projectId: z.string().uuid(),
  lineCode: z.string().trim().min(1).nullable().optional(),
});

export type GetPilotRecipeMaterialsInput = z.infer<typeof Input>;

export type PilotRecipeMaterial = {
  ingredientCode: string;
  ingredientName: string;
  requiredKg: string;
  availableKg: string;
  reservedKg: string;
  status: PilotMaterialStatus;
};

const READ_PERMISSION = 'npd.pilot.read';

type IdRow = { id: string };
type WarehouseRow = { warehouse_id: string | null };
type IngredientRow = {
  rm_code: string;
  item_id: string | null;
  qty_kg: string;
  ingredient_name: string | null;
};
type QtyRow = { qty: string };

export async function getPilotRecipeMaterials(raw: unknown): Promise<PilotRecipeMaterial[]> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    throw new Error('invalid_input');
  }

  const { projectId, lineCode } = parsed.data;

  return await withOrgContext(async (rawCtx) => {
    const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

    if (!(await hasPilotPermission(ctx, READ_PERMISSION))) {
      throw new Error('forbidden');
    }

    const formulationRes = await ctx.client.query<IdRow>(
      `select id::text
         from public.formulations
        where project_id = $1::uuid
          and org_id = app.current_org_id()
        limit 1`,
      [projectId],
    );
    const formulationId = formulationRes.rows[0]?.id;
    if (!formulationId) return [];

    const versionRes = await ctx.client.query<IdRow>(
      `select id::text
         from public.formulation_versions
        where formulation_id = $1::uuid
          and state <> 'draft'
        order by version_number desc
        limit 1`,
      [formulationId],
    );
    const versionId = versionRes.rows[0]?.id;
    if (!versionId) return [];

    let warehouseId: string | null = null;
    if (lineCode) {
      const warehouseRes = await ctx.client.query<WarehouseRow>(
        `select warehouse_id::text
           from public.production_lines
          where code = $1
            and org_id = app.current_org_id()
          limit 1`,
        [lineCode],
      );
      warehouseId = warehouseRes.rows[0]?.warehouse_id ?? null;
    }

    const ingredientsRes = await ctx.client.query<IngredientRow>(
      `select fi.rm_code,
              fi.item_id::text as item_id,
              coalesce(fi.qty_kg, 0)::text as qty_kg,
              i.name as ingredient_name
         from public.formulation_ingredients fi
         left join public.items i
           on i.id = fi.item_id
          and i.org_id = app.current_org_id()
        where fi.version_id = $1::uuid
        order by fi.sequence asc, fi.rm_code asc`,
      [versionId],
    );

    const materials: PilotRecipeMaterial[] = [];

    for (const ingredient of ingredientsRes.rows) {
      let availableKg = '0';
      let reservedKg = '0';

      if (warehouseId && ingredient.item_id) {
        const availableRes = await ctx.client.query<QtyRow>(
          `select coalesce(sum(available_qty), 0)::text as qty
             from public.v_inventory_available
            where product_id = $1::uuid
              and warehouse_id = $2::uuid
              and org_id = app.current_org_id()`,
          [ingredient.item_id, warehouseId],
        );
        availableKg = availableRes.rows[0]?.qty ?? '0';

        const reservedRes = await ctx.client.query<QtyRow>(
          `select coalesce(sum(reserved_qty), 0)::text as qty
             from public.license_plates
            where product_id = $1::uuid
              and warehouse_id = $2::uuid
              and status = 'available'
              and org_id = app.current_org_id()`,
          [ingredient.item_id, warehouseId],
        );
        reservedKg = reservedRes.rows[0]?.qty ?? '0';
      }

      materials.push({
        ingredientCode: ingredient.rm_code,
        ingredientName: ingredient.ingredient_name ?? ingredient.rm_code,
        requiredKg: ingredient.qty_kg,
        availableKg,
        reservedKg,
        status: pilotMaterialStatus(Number(ingredient.qty_kg), Number(reservedKg)),
      });
    }

    return materials;
  });
}
