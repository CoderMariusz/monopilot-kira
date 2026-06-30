'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from './errors';

const FA_DELETE_PERMISSION = 'npd.core.write';
const FA_DELETED_EVENT = 'fa.deleted';
const APP_VERSION = 'delete-fa-v1';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

// NOTE: types cannot be exported from a 'use server' file (Next build rule);
// kept local to this module.
type DeleteFaResult = {
  productCode: string;
  deleted: true;
};

const deleteFaInputSchema = z.object({
  productCode: z.string().trim().min(1),
  reason: z.string().trim().min(10).default('Deleted from FA detail'),
});

export async function deleteFa(
  inputOrProductCode: { productCode: string; reason?: string } | string,
  legacyReason?: string,
): Promise<DeleteFaResult> {
  return withOrgContext<DeleteFaResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    if (!(await hasPermission(context, FA_DELETE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', 'npd.core.write is required to delete an FA product');
    }

    const parsed = deleteFaInputSchema.safeParse(
      typeof inputOrProductCode === 'string'
        ? { productCode: inputOrProductCode, reason: legacyReason }
        : inputOrProductCode,
    );
    if (!parsed.success) {
      const reasonIssue = parsed.error.issues.find((issue) => issue.path[0] === 'reason');
      if (reasonIssue) {
        throw new ValidationError('REASON_TOO_SHORT', 'Delete reason must be at least 10 characters');
      }
      throw new ValidationError('INVALID_INPUT', 'Invalid FA delete input');
    }

    const normalizedProductCode = parsed.data.productCode;
    const normalizedReason = parsed.data.reason;
    const before = await fetchActiveProduct(context, normalizedProductCode);
    if (!before) {
      throw new ValidationError('PRODUCT_NOT_FOUND', 'FA product is not visible in the current organization');
    }
    if (before.built === true) {
      throw new ValidationError('PRODUCT_BUILT', 'Built FA products cannot be deleted');
    }
    if (isReleasedStatus(before.status_overall) || (await hasFactoryRelease(context, normalizedProductCode))) {
      throw new ValidationError('PRODUCT_RELEASED', 'Released FA products cannot be deleted');
    }

    const deleted = await softDeleteProduct(context, normalizedProductCode);
    if (!deleted) {
      throw new ValidationError('PRODUCT_NOT_FOUND', 'FA product is not visible in the current organization');
    }

    const requestId = randomUUID();
    await writeAudit(context, {
      productCode: normalizedProductCode,
      reason: normalizedReason,
      beforeState: before,
      requestId,
    });
    await writeOutbox(context, normalizedProductCode, normalizedReason);

    safeRevalidatePath('/fg');
    safeRevalidatePath(`/fg/${normalizedProductCode}`);
    safeRevalidatePath('/[locale]/fg', 'page');
    safeRevalidatePath('/[locale]/fg/[productCode]', 'page');
    return { productCode: normalizedProductCode, deleted: true };
  });
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function fetchActiveProduct(
  ctx: OrgContextLike,
  productCode: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await ctx.client.query<Record<string, unknown>>(
    `select product_code, product_name, department_number, status_overall, built, created_by_user, deleted_at
       from public.product
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null
      limit 1`,
    [productCode],
  );
  return rows[0] ?? null;
}

async function hasFactoryRelease(ctx: OrgContextLike, productCode: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.factory_release_status
      where org_id = app.current_org_id()
        and product_code = $1
        and release_status in ('approved_for_factory', 'released_to_factory')
      limit 1`,
    [productCode],
  );
  return rows.length > 0;
}

function isReleasedStatus(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  return ['built', 'released', 'released_to_factory', 'launched'].includes(status.trim().toLowerCase());
}

async function softDeleteProduct(ctx: OrgContextLike, productCode: string): Promise<boolean> {
  const { rowCount, rows } = await ctx.client.query<{ product_code: string }>(
    `update public.product
        set deleted_at = now()
      where org_id = app.current_org_id()
        and product_code = $1
        and deleted_at is null
      returning product_code`,
    [productCode],
  );
  return (rowCount ?? rows.length) > 0;
}

async function writeAudit(
  ctx: OrgContextLike,
  input: {
    productCode: string;
    reason: string;
    beforeState: Record<string, unknown>;
    requestId: string;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values (app.current_org_id(), $1::uuid, 'user', $2, 'fa', $3, $4::jsonb, $5::jsonb, $6::uuid, 'operational')`,
    [
      ctx.userId,
      FA_DELETED_EVENT,
      input.productCode,
      JSON.stringify(input.beforeState),
      JSON.stringify({
        actor: ctx.userId,
        productCode: input.productCode,
        reason: input.reason,
        deleted_at: new Date().toISOString(),
      }),
      input.requestId,
    ],
  );
}

async function writeOutbox(ctx: OrgContextLike, productCode: string, reason: string): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
     values
       (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4, $5)
     on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
    [
      FA_DELETED_EVENT,
      productCode,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        product_code: productCode,
        reason,
      }),
      APP_VERSION,
      `${FA_DELETED_EVENT}:${productCode}`,
    ],
  );
}

function safeRevalidatePath(path: string, type?: 'page' | 'layout'): void {
  try {
    revalidatePath(path, type);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
