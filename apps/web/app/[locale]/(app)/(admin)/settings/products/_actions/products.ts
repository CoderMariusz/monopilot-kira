'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const PRODUCTS_ROUTE = '/settings/products';

export type ProductStatus = 'active' | 'development' | 'pilot' | 'discontinued';

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  weight: string;
  bomLink: string;
  status: ProductStatus;
};

export type ProductMutationResult =
  | { ok: true; product: ProductRow }
  | { ok: false; error: 'invalid' | 'forbidden' | 'not_found' | 'persistence_failed' };

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type ProductDbRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  weight: string | null;
  bom_link: string | null;
  status: string;
};

const productInputSchema = z
  .object({
    sku: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(300),
    category: z.string().trim().max(160).optional().default(''),
    unit: z.string().trim().min(1).max(32),
    weight: z.union([z.string().trim().max(40), z.number().nonnegative()]).optional().nullable(),
    lineId: z.string().uuid().optional().nullable(),
    status: z.enum(['active', 'development', 'pilot', 'discontinued']).default('development'),
  })
  .strict();

const updateProductInputSchema = productInputSchema.extend({
  id: z.string().uuid(),
});

function revalidateProductsRoute() {
  try {
    revalidatePath(PRODUCTS_ROUTE);
  } catch {
    /* no request store in action unit tests */
  }
}

function normalizeStatus(value: string): ProductStatus {
  if (value === 'active' || value === 'development' || value === 'pilot' || value === 'discontinued') {
    return value;
  }
  if (value === 'draft') return 'development';
  return 'discontinued';
}

function toProductRow(row: ProductDbRow): ProductRow {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category?.trim() || 'Uncategorized',
    unit: row.unit,
    weight: row.weight ?? '',
    bomLink: row.bom_link ?? '',
    status: normalizeStatus(row.status),
  };
}

async function hasProductWritePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
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
    [userId, orgId, 'technical.items.edit'],
  );
  return rows.length > 0;
}

const PRODUCT_SELECT = `
  select i.id::text,
         i.item_code as sku,
         i.name,
         i.product_group as category,
         i.uom_base as unit,
         trim(trailing '.' from trim(trailing '0' from i.nominal_weight::text)) as weight,
         case
           when bom.id is null then null
           else 'BOM-' || upper(left(bom.id::text, 8))
         end as bom_link,
         i.status
    from public.items i
    left join lateral (
      select h.id, h.version, h.status
        from public.bom_headers h
       where h.org_id = app.current_org_id()
         and h.product_id = i.item_code
       order by
         case h.status
           when 'active' then 1
           when 'technical_approved' then 2
           when 'in_review' then 3
           when 'draft' then 4
           else 5
         end,
         h.version desc,
         h.updated_at desc
       limit 1
    ) bom on true`;

export async function getProducts(orgId: string | null = null): Promise<ProductRow[]> {
  try {
    return await withOrgContext<ProductRow[]>(async (ctx): Promise<ProductRow[]> => {
      const context = ctx as OrgContextLike;
      const scopedOrgId = orgId ?? context.orgId;
      const { rows } = await context.client.query<ProductDbRow>(
        `${PRODUCT_SELECT}
          where i.org_id = app.current_org_id()
            and i.org_id = $1::uuid
            and i.item_type in ('fg', 'intermediate', 'co_product', 'byproduct')
          order by i.item_code`,
        [scopedOrgId],
      );
      return rows.map(toProductRow);
    });
  } catch (error) {
    console.error('[settings/products] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return [];
  }
}

export async function createProduct(rawInput: unknown): Promise<ProductMutationResult> {
  const parsed = productInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  try {
    return await withOrgContext<ProductMutationResult>(async (ctx): Promise<ProductMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasProductWritePermission(context))) return { ok: false, error: 'forbidden' };

      const input = parsed.data;
      const { rows } = await context.client.query<ProductDbRow>(
        `with inserted as (
           insert into public.items
             (org_id, item_code, item_type, name, product_group, uom_base, nominal_weight, status, created_by)
           values
             ($1::uuid, $2, 'fg', $3, nullif($4, ''), $5, nullif($6, '')::numeric, $7, $8::uuid)
           returning *
         )
         ${PRODUCT_SELECT.replaceAll('public.items i', 'inserted i')}
         where i.org_id = app.current_org_id()
           and i.id = (select id from inserted)`,
        [
          context.orgId,
          input.sku,
          input.name,
          input.category,
          input.unit,
          input.weight == null ? '' : String(input.weight),
          input.status,
          context.userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      revalidateProductsRoute();
      return { ok: true, product: toProductRow(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateProduct(rawInput: unknown): Promise<ProductMutationResult> {
  const parsed = updateProductInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid' };

  try {
    return await withOrgContext<ProductMutationResult>(async (ctx): Promise<ProductMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasProductWritePermission(context))) return { ok: false, error: 'forbidden' };

      const input = parsed.data;
      const { rows } = await context.client.query<ProductDbRow>(
        `with updated as (
           update public.items
              set item_code = $3,
                  name = $4,
                  product_group = nullif($5, ''),
                  uom_base = $6,
                  nominal_weight = nullif($7, '')::numeric,
                  status = $8,
                  updated_at = now()
            where org_id = app.current_org_id()
              and org_id = $1::uuid
              and id = $2::uuid
            returning *
         )
         ${PRODUCT_SELECT.replaceAll('public.items i', 'updated i')}
         where i.org_id = app.current_org_id()
           and i.id = (select id from updated)`,
        [
          context.orgId,
          input.id,
          input.sku,
          input.name,
          input.category,
          input.unit,
          input.weight == null ? '' : String(input.weight),
          input.status,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateProductsRoute();
      return { ok: true, product: toProductRow(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
