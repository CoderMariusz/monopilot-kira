'use server';

/**
 * FA Core multi-benchmark editor — Server Actions (migration 241 fa_benchmarks).
 *
 * Replaces the single Core "Benchmark" field with a repeatable per-FG list of
 * {label, price} rows. The separate "Price (Brief)" field is untouched.
 *
 * Contract (mirrors the other fa/* actions, e.g. add-prod-detail-component):
 *   - withOrgContext (app_user + RLS pinned to app.current_org_id());
 *   - zod-validated input (schemas in benchmarks.types.ts);
 *   - server-side RBAC: read = npd.fa.read, write = npd.core.write — byte-identical
 *     to the seeded permissions (migs 149 / 236). The client never grants perm.
 *   - the FA is re-resolved org-scoped (RLS) so a caller cannot touch another org;
 *   - audit cols set (created_by / updated_by from ctx.userId) + outbox
 *     'fa.core_changed' audit event so the FA history reflects the change;
 *   - revalidatePath the FA detail route.
 *
 * 'use server' files may export ONLY async functions — types/consts/zod live in
 * the sibling benchmarks.types.ts.
 */

import { revalidatePath } from 'next/cache';

import { AuthError, ValidationError } from '../../../../../../(npd)/fa/actions/errors';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  BENCHMARK_READ_PERMISSION,
  BENCHMARK_WRITE_PERMISSION,
  FA_CORE_CHANGED_EVENT,
  deleteInputSchema,
  listInputSchema,
  upsertInputSchema,
  type Benchmark,
  type DeleteBenchmarkInput,
  type ListBenchmarksInput,
  type UpsertBenchmarkInput,
} from './benchmarks.types';

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type BenchmarkRow = {
  id: string;
  product_code: string;
  label: string;
  price: string | null;
  display_order: number;
};

function toBenchmark(row: BenchmarkRow): Benchmark {
  return {
    id: row.id,
    productCode: row.product_code,
    label: row.label,
    price: row.price === null ? null : String(row.price),
    displayOrder: Number(row.display_order),
  };
}

async function assertProductVisible(ctx: OrgContextLike, productCode: string): Promise<void> {
  const res = await ctx.client.query<{ ok: boolean }>(
    `select true as ok from public.product
      where org_id = app.current_org_id() and product_code = $1 and deleted_at is null
      limit 1`,
    [productCode],
  );
  if (res.rows.length === 0) {
    throw new ValidationError('PRODUCT_NOT_FOUND', 'Finished Good is not visible in this organisation');
  }
}

async function emitCoreChanged(
  ctx: OrgContextLike,
  productCode: string,
  diff: Record<string, unknown>,
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4)`,
    [
      FA_CORE_CHANGED_EVENT,
      productCode,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        product_code: productCode,
        field: 'benchmarks',
        ...diff,
      }),
      APP_VERSION,
    ],
  );
}

function safeRevalidatePath(path: string, type?: 'page' | 'layout'): void {
  try {
    revalidatePath(path, type);
  } catch {
    // Vitest imports Server Actions outside a Next request/static-generation store.
  }
}

/** List all benchmark rows for an FA, org-scoped + RBAC-gated (read). */
export async function listBenchmarks(input: ListBenchmarksInput): Promise<Benchmark[]> {
  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid list-benchmarks input');
  }
  const { productCode } = parsed.data;

  return withOrgContext<Benchmark[]>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, BENCHMARK_READ_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${BENCHMARK_READ_PERMISSION} is required to view benchmarks`);
    }
    await assertProductVisible(ctx, productCode);

    const { rows } = await ctx.client.query<BenchmarkRow>(
      `select id, product_code, label, price::text as price, display_order
         from public.fa_benchmarks
        where org_id = app.current_org_id() and product_code = $1
        order by display_order asc, created_at asc`,
      [productCode],
    );
    return rows.map(toBenchmark);
  });
}

/** Insert (no id) or update (with id) a single benchmark row. RBAC: npd.core.write. */
export async function upsertBenchmark(input: UpsertBenchmarkInput): Promise<Benchmark> {
  const parsed = upsertInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid upsert-benchmark input');
  }
  const { productCode, id, label, price, displayOrder } = parsed.data;

  return withOrgContext<Benchmark>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, BENCHMARK_WRITE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${BENCHMARK_WRITE_PERMISSION} is required to edit benchmarks`);
    }
    await assertProductVisible(ctx, productCode);

    if (id) {
      // Update — RLS + explicit org/product scope; bump updated_by.
      const updated = await ctx.client.query<BenchmarkRow>(
        `update public.fa_benchmarks
            set label = $3,
                price = $4::numeric,
                display_order = coalesce($5, display_order),
                updated_by = $6::uuid
          where org_id = app.current_org_id()
            and product_code = $1
            and id = $2::uuid
          returning id, product_code, label, price::text as price, display_order`,
        [productCode, id, label, price, displayOrder ?? null, ctx.userId],
      );
      const row = updated.rows[0];
      if (!row) {
        throw new ValidationError('BENCHMARK_NOT_FOUND', 'Benchmark row is not visible in this organisation');
      }
      await emitCoreChanged(ctx, productCode, { op: 'update', id, label });
      safeRevalidatePath('/[locale]/fg/[productCode]', 'page');
      return toBenchmark(row);
    }

    // Insert — default display_order to append at the end when not supplied.
    const nextOrder =
      displayOrder ??
      Number(
        (
          await ctx.client.query<{ next_order: number }>(
            `select coalesce(max(display_order), -1) + 1 as next_order
               from public.fa_benchmarks
              where org_id = app.current_org_id() and product_code = $1`,
            [productCode],
          )
        ).rows[0]?.next_order ?? 0,
      );

    const inserted = await ctx.client.query<BenchmarkRow>(
      `insert into public.fa_benchmarks
         (org_id, product_code, label, price, display_order, created_by, updated_by)
       values
         (app.current_org_id(), $1, $2, $3::numeric, $4, $5::uuid, $5::uuid)
       returning id, product_code, label, price::text as price, display_order`,
      [productCode, label, price, nextOrder, ctx.userId],
    );
    const row = inserted.rows[0];
    if (!row) {
      throw new ValidationError('INSERT_FAILED', 'Could not add the benchmark');
    }
    await emitCoreChanged(ctx, productCode, { op: 'insert', id: row.id, label });
    safeRevalidatePath('/[locale]/fg/[productCode]', 'page');
    return toBenchmark(row);
  });
}

/** Delete a benchmark row, org-scoped + RBAC-gated (npd.core.write). */
export async function deleteBenchmark(input: DeleteBenchmarkInput): Promise<{ removed: boolean }> {
  const parsed = deleteInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid delete-benchmark input');
  }
  const { productCode, id } = parsed.data;

  return withOrgContext<{ removed: boolean }>(async (rawCtx) => {
    const ctx = rawCtx as OrgContextLike;
    if (!(await hasPermission(ctx, BENCHMARK_WRITE_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${BENCHMARK_WRITE_PERMISSION} is required to delete benchmarks`);
    }

    const deleted = await ctx.client.query<{ id: string; label: string }>(
      `delete from public.fa_benchmarks
        where org_id = app.current_org_id()
          and product_code = $1
          and id = $2::uuid
        returning id, label`,
      [productCode, id],
    );
    if (deleted.rows.length === 0) {
      return { removed: false };
    }
    await emitCoreChanged(ctx, productCode, { op: 'delete', id, label: deleted.rows[0].label });
    safeRevalidatePath('/[locale]/fg/[productCode]', 'page');
    return { removed: true };
  });
}
