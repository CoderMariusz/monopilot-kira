'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from '../../_actions/revalidate';
import {
  ITEMS_EDIT_PERMISSION,
  hasPermission,
  isPgError,
  writeAudit,
  type OrgActionContext,
  type QueryClient,
} from '../../_actions/shared';

const NUTRIENT_CODES = [
  'energy_kj',
  'fat_g',
  'saturates_g',
  'carbs_g',
  'sugars_g',
  'protein_g',
  'salt_g',
] as const;

const EU14_CODES = [
  'A01',
  'A02',
  'A03',
  'A04',
  'A05',
  'A06',
  'A07',
  'A08',
  'A09',
  'A10',
  'A11',
  'A12',
  'A13',
  'A14',
] as const;

const DecimalString = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/, 'must be a non-negative decimal string');

const NutritionSchema = z.object({
  energy_kj: DecimalString,
  fat_g: DecimalString,
  saturates_g: DecimalString,
  carbs_g: DecimalString,
  sugars_g: DecimalString,
  protein_g: DecimalString,
  salt_g: DecimalString,
});

const UpsertNutritionInput = z.object({
  itemCode: z.string().trim().min(1).max(64),
  nutrition: NutritionSchema,
  allergensInherited: z.array(z.enum(EU14_CODES)),
});

type Nutrition = z.infer<typeof NutritionSchema>;

type NutritionActionResult =
  | { ok: true; data: { itemCode: string; nutrition: Nutrition; allergensInherited: string[] } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed'; message?: string };

type ItemRow = {
  id: string;
  item_code: string;
  name: string;
  item_type: string;
};

type RawMaterialRow = {
  rm_code: string;
  display_name: string;
  nutrition_per_100g: Record<string, unknown> | null;
  allergens_inherited: string[] | null;
};

function normalizeNutrition(value: Record<string, unknown> | null): Nutrition | null {
  if (!value) return null;
  const out: Partial<Nutrition> = {};
  for (const code of NUTRIENT_CODES) {
    const nutrient = value[code];
    if (typeof nutrient !== 'string') return null;
    out[code] = nutrient;
  }
  return out as Nutrition;
}

export async function upsertNutrition(rawInput: unknown): Promise<NutritionActionResult> {
  const parsed = UpsertNutritionInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<NutritionActionResult> => {
      const queryClient = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: queryClient };
      if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const item = await queryClient.query<ItemRow>(
        `select id, item_code, name, item_type
           from public.items
          where org_id = app.current_org_id()
            and item_code = $1
          limit 1`,
        [input.itemCode],
      );
      const itemRow = item.rows[0];
      if (!itemRow) return { ok: false, error: 'not_found' };
      if (!['rm', 'ingredient', 'intermediate'].includes(itemRow.item_type)) {
        return { ok: false, error: 'forbidden' };
      }

      const before = await queryClient.query<RawMaterialRow>(
        `select rm_code, display_name, nutrition_per_100g, allergens_inherited
           from "Reference"."RawMaterials"
          where org_id = app.current_org_id()
            and rm_code = $1
          limit 1`,
        [input.itemCode],
      );

      const upserted = await queryClient.query<RawMaterialRow>(
        `insert into "Reference"."RawMaterials"
           (org_id, rm_code, display_name, nutrition_per_100g, allergens_inherited)
         values (
           app.current_org_id(),
           $1,
           $2,
           jsonb_build_object(
             'energy_kj', $3::text,
             'fat_g', $4::text,
             'saturates_g', $5::text,
             'carbs_g', $6::text,
             'sugars_g', $7::text,
             'protein_g', $8::text,
             'salt_g', $9::text
           ),
           $10::text[]
         )
         on conflict (org_id, rm_code) do update
           set display_name = excluded.display_name,
               nutrition_per_100g = excluded.nutrition_per_100g,
               allergens_inherited = excluded.allergens_inherited
         returning rm_code, display_name, nutrition_per_100g, allergens_inherited`,
        [
          input.itemCode,
          itemRow.name,
          input.nutrition.energy_kj,
          input.nutrition.fat_g,
          input.nutrition.saturates_g,
          input.nutrition.carbs_g,
          input.nutrition.sugars_g,
          input.nutrition.protein_g,
          input.nutrition.salt_g,
          input.allergensInherited,
        ],
      );
      const row = upserted.rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'item.nutrition_upserted',
        resourceId: itemRow.id,
        beforeState: before.rows[0] ?? null,
        afterState: {
          itemCode: input.itemCode,
          nutrition: input.nutrition,
          allergensInherited: input.allergensInherited,
        },
      });

      safeRevalidatePath('/technical/items');
      safeRevalidatePath(`/technical/items/${input.itemCode}`);

      return {
        ok: true,
        data: {
          itemCode: row.rm_code,
          nutrition: input.nutrition,
          allergensInherited: row.allergens_inherited ?? input.allergensInherited,
        },
      };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'not_found' };
    console.error('[technical/items] upsertNutrition persistence_failed', {
      itemCode: input.itemCode,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getItemNutrition(itemCode: string): Promise<{
  nutrition: Nutrition;
  allergensInherited: string[];
} | null> {
  const parsedItemCode = z.string().trim().min(1).max(64).safeParse(itemCode);
  if (!parsedItemCode.success) return null;

  try {
    return await withOrgContext(async ({ client }): Promise<{
      nutrition: Nutrition;
      allergensInherited: string[];
    } | null> => {
      const { rows } = await (client as QueryClient).query<RawMaterialRow>(
        `select rm_code, display_name, nutrition_per_100g, allergens_inherited
           from "Reference"."RawMaterials"
          where org_id = app.current_org_id()
            and rm_code = $1
          limit 1`,
        [parsedItemCode.data],
      );
      const row = rows[0];
      if (!row) return null;
      const nutrition = normalizeNutrition(row.nutrition_per_100g);
      if (!nutrition) return null;
      return {
        nutrition,
        allergensInherited: row.allergens_inherited ?? [],
      };
    });
  } catch (err) {
    console.error('[technical/items] getItemNutrition load_failed', {
      itemCode: parsedItemCode.data,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
