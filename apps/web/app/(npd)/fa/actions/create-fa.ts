'use server';

import { revalidatePath } from 'next/cache';
import { validateProductCodeV01, validateProductNameV02 } from '@monopilot/validation';
import { z } from 'zod';

import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthError, DuplicateError, ValidationError } from './errors';

// RBAC source-of-truth normalizes legacy fa.create to canonical fg.create.
const FA_CREATE_PERMISSION = 'fg.create';
const FA_CREATED_EVENT = 'fa.created';
const APP_VERSION = 'create-fa-v1';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type CreateFaInput = {
  productCode: string;
  productName: string;
};

export type CreateFaResult = {
  productCode: string;
};

const createFaInputSchema = z.object({
  productCode: z.string(),
  productName: z.string(),
});

export async function createFa(input: CreateFaInput): Promise<CreateFaResult> {
  return withOrgContext<CreateFaResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    if (!(await hasPermission(context, FA_CREATE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', 'fa.create is required to create an FA product');
    }

    const parsed = createFaInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError('INVALID_INPUT', 'Invalid FA creation input');

    const productCode = validateProductCodeV01(parsed.data.productCode);
    if (!productCode.ok) throw new ValidationError(productCode.code, 'Product_Code must match ^FA[A-Z0-9]+$');

    const productName = validateProductNameV02(parsed.data.productName);
    if (!productName.ok) throw new ValidationError(productName.code, 'Product_Name is required');

    try {
      await insertProduct(context, productCode.productCode, productName.productName);
      await writeOutbox(context, productCode.productCode, productName.productName);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateError('DUPLICATE_PRODUCT_CODE', 'Product_Code already exists');
      }
      throw error;
    }

    safeRevalidatePath('/npd/fg');
    return { productCode: productCode.productCode };
  });
}

async function insertProduct(ctx: OrgContextLike, productCode: string, productName: string): Promise<void> {
  // product is a VIEW post-merge-cut: a duplicate INSERT no longer raises a PK 23505 (the INSTEAD-OF
  // insert reuses the items twin and would silently overwrite fg_npd_ext). Pre-check + re-raise the
  // same 23505 contract isUniqueViolation() relies on, so a duplicate FA code is still rejected.
  const existing = await ctx.client.query(
    `select 1 from public.product where org_id = app.current_org_id() and product_code = $1 limit 1`,
    [productCode],
  );
  if (existing.rows.length > 0) {
    const err = new Error(`product ${productCode} already exists`) as Error & { code?: string };
    err.code = '23505';
    throw err;
  }
  await ctx.client.query(
    `insert into public.product
       (org_id, product_code, product_name, created_by_user, app_version)
     values
       (app.current_org_id(), $1, $2, $3::uuid, $4)`,
    [productCode, productName, ctx.userId, APP_VERSION],
  );
}

async function writeOutbox(ctx: OrgContextLike, productCode: string, productName: string): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4, $5)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      FA_CREATED_EVENT,
      productCode,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        product_code: productCode,
        product_name: productName,
      }),
      APP_VERSION,
      `${FA_CREATED_EVENT}:${productCode}`,
    ],
  );
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
