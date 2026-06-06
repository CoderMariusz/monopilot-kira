'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const BOMS_ROUTE = '/settings/boms';

export type BomStatus = 'active' | 'draft' | 'archived';

export type BomRow = {
  id: string;
  bomNumber: string;
  product: string;
  version: string;
  ingredientsCount: number;
  lastUpdated: string;
  status: BomStatus;
};

export type BomKpis = {
  active: number;
  draft: number;
  archived: number;
};

export type BomSettings = {
  autoCalculateNutrition: boolean;
  requireAllergenReview: boolean;
  retention: '5' | '10' | '25' | 'all';
};

export type BomsResult = {
  kpis: BomKpis;
  rows: BomRow[];
};

export type UpdateBomSettingsResult =
  | { ok: true; settings: BomSettings }
  | { ok: false; error: 'invalid' | 'forbidden' | 'persistence_failed' };

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type BomDbRow = {
  id: string;
  bom_number: string;
  product: string | null;
  version: number | string;
  ingredients_count: number | string;
  last_updated: string | Date;
  status: string;
};

type BomSettingsDbRow = {
  auto_calculate_nutrition: boolean | null;
  require_allergen_review: boolean | null;
  retention: string | null;
};

const DEFAULT_BOM_SETTINGS: BomSettings = {
  autoCalculateNutrition: true,
  requireAllergenReview: true,
  retention: '10',
};

const bomSettingsSchema = z
  .object({
    autoCalculateNutrition: z.boolean(),
    requireAllergenReview: z.boolean(),
    retention: z.enum(['5', '10', '25', 'all']),
  })
  .strict();

function revalidateBomsRoute() {
  try {
    revalidatePath(BOMS_ROUTE);
  } catch {
    /* no request store in action unit tests */
  }
}

function normalizeBomStatus(value: string): BomStatus {
  if (value === 'active' || value === 'technical_approved') return 'active';
  if (value === 'archived' || value === 'superseded') return 'archived';
  return 'draft';
}

function toBomRow(row: BomDbRow): BomRow {
  return {
    id: row.id,
    bomNumber: row.bom_number,
    product: row.product?.trim() || 'Unassigned product',
    version: `v${String(row.version)}`,
    ingredientsCount: Number(row.ingredients_count) || 0,
    lastUpdated: row.last_updated instanceof Date ? row.last_updated.toISOString() : String(row.last_updated),
    status: normalizeBomStatus(row.status),
  };
}

function toBomSettings(row: BomSettingsDbRow | undefined): BomSettings {
  if (!row) return DEFAULT_BOM_SETTINGS;
  const retention = row.retention === '5' || row.retention === '10' || row.retention === '25' || row.retention === 'all'
    ? row.retention
    : DEFAULT_BOM_SETTINGS.retention;
  return {
    autoCalculateNutrition: row.auto_calculate_nutrition ?? DEFAULT_BOM_SETTINGS.autoCalculateNutrition,
    requireAllergenReview: row.require_allergen_review ?? DEFAULT_BOM_SETTINGS.requireAllergenReview,
    retention,
  };
}

async function hasBomSettingsUpdatePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, 'technical.bom.create'],
  );
  return rows.length > 0;
}

export async function getBoms(orgId: string | null = null): Promise<BomsResult> {
  try {
    return await withOrgContext<BomsResult>(async (ctx): Promise<BomsResult> => {
      const context = ctx as OrgContextLike;
      const scopedOrgId = orgId ?? context.orgId;
      const { rows } = await context.client.query<BomDbRow>(
        `select h.id::text,
                'BOM-' || upper(left(h.id::text, 8)) as bom_number,
                coalesce(i.name, p.name, h.product_id, h.fa_code) as product,
                h.version,
                count(bl.id)::int as ingredients_count,
                to_char(h.updated_at at time zone 'UTC', 'YYYY-MM-DD') as last_updated,
                h.status
           from public.bom_headers h
           left join public.items i
             on i.org_id = app.current_org_id()
            and i.item_code = h.product_id
           left join public.product p
             on p.org_id = app.current_org_id()
            and p.product_code = h.product_id
           left join public.bom_lines bl
             on bl.org_id = app.current_org_id()
            and bl.bom_header_id = h.id
          where h.org_id = app.current_org_id()
            and h.org_id = $1::uuid
          group by h.id, h.product_id, h.fa_code, h.version, h.updated_at, h.status, i.name, p.name
          order by h.updated_at desc, h.version desc`,
        [scopedOrgId],
      );

      const mappedRows = rows.map(toBomRow);
      const kpis = mappedRows.reduce<BomKpis>(
        (acc, row) => {
          acc[row.status] += 1;
          return acc;
        },
        { active: 0, draft: 0, archived: 0 },
      );

      return { kpis, rows: mappedRows };
    });
  } catch (error) {
    console.error('[settings/boms] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { kpis: { active: 0, draft: 0, archived: 0 }, rows: [] };
  }
}

export async function getBomSettings(orgId: string | null = null): Promise<BomSettings> {
  try {
    return await withOrgContext<BomSettings>(async (ctx): Promise<BomSettings> => {
      const context = ctx as OrgContextLike;
      const scopedOrgId = orgId ?? context.orgId;
      const { rows } = await context.client.query<BomSettingsDbRow>(
        `select auto_calculate_nutrition, require_allergen_review, retention
           from public.bom_settings
          where org_id = app.current_org_id()
            and org_id = $1::uuid
          limit 1`,
        [scopedOrgId],
      );
      return toBomSettings(rows[0]);
    });
  } catch (error) {
    console.error('[settings/boms] settings_load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return DEFAULT_BOM_SETTINGS;
  }
}

export async function updateBomSettings(
  orgId: string | null,
  rawSettings: unknown,
): Promise<UpdateBomSettingsResult> {
  const parsed = bomSettingsSchema.safeParse(rawSettings);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  try {
    return await withOrgContext<UpdateBomSettingsResult>(async (ctx): Promise<UpdateBomSettingsResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasBomSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const scopedOrgId = orgId ?? context.orgId;
      const input = parsed.data;
      const { rows } = await context.client.query<BomSettingsDbRow>(
        `insert into public.bom_settings
           (org_id, auto_calculate_nutrition, require_allergen_review, retention, updated_by)
         values ($1::uuid, $2, $3, $4, $5::uuid)
         on conflict (org_id) do update
           set auto_calculate_nutrition = excluded.auto_calculate_nutrition,
               require_allergen_review = excluded.require_allergen_review,
               retention = excluded.retention,
               updated_by = excluded.updated_by,
               updated_at = now()
         where public.bom_settings.org_id = app.current_org_id()
         returning auto_calculate_nutrition, require_allergen_review, retention`,
        [scopedOrgId, input.autoCalculateNutrition, input.requireAllergenReview, input.retention, context.userId],
      );
      revalidateBomsRoute();
      return { ok: true, settings: toBomSettings(rows[0]) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
