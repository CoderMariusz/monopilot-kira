'use server';

import { z } from 'zod';

import { hasPermission } from '../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from './errors';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';
import {
  APP_VERSION,
  FA_EDIT_EVENT,
  assertProductColumn,
  isAutoColumn,
  loadDeptColumn,
  permissionForDept,
  quoteIdentifier,
  syncProdDetailRows,
  validateValue,
  type OrgContextLike,
  type UpdateFaCellResult,
} from './_lib/fa-cell-shared';

const inputSchema = z.object({
  productCode: z.string().trim().min(1),
  columnName: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
  value: z.unknown(),
});

/**
 * C5 — identity columns are immutable through the generic FA cell writer.
 * `product_code` is set ONCE at creation (createFa → insertProduct); this action
 * only ever UPDATEs an existing row matched BY product_code, so it is never the
 * legitimate path to change it. A rename would otherwise fan down to
 * items.item_code via the mig-359 product_instead_of_update trigger and silently
 * re-key the product.
 *
 * Only `product_code` is denylisted here because it is the ONLY identity field
 * this action can actually write: the `public.product` view (mig 359) projects no
 * unit-of-measure or category/type column, so those live only on the base
 * `items` table and are unreachable through updateFaCell (assertProductColumn
 * would already reject them). If the view ever exposes UoM/category, add their
 * real column_keys here. (Identity mutation via other paths — e.g. D365 pull
 * writing items.item_code directly — is a separate concern, not this action.)
 */
const IDENTITY_COLUMN_KEYS: ReadonlySet<string> = new Set(['product_code']);

type UpdateRow = {
  previous_value: string | null;
  new_value: string | null;
  built_reset: boolean;
};

export async function updateFaCell(
  productCode: string,
  columnName: string,
  value: unknown,
): Promise<UpdateFaCellResult> {
  const parsed = inputSchema.safeParse({ productCode, columnName, value });
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid FA cell update input');
  }

  return withOrgContext<UpdateFaCellResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    const column = await loadDeptColumn(context, parsed.data.columnName);
    const permission = permissionForDept(column.dept_code);
    if (!(await hasPermission(context, permission))) {
      throw new AuthError('FORBIDDEN', `${permission} is required to update ${parsed.data.columnName}`);
    }

    // C5 — reject identity-field edits (product_code, UoM, category) before any
    // write. Immutable for everyone via this path; no dept permission grants it.
    if (IDENTITY_COLUMN_KEYS.has(column.column_key)) {
      throw new ValidationError(
        'IDENTITY_COLUMN_IMMUTABLE',
        'Identity fields (product code, unit of measure, category) cannot be edited after creation',
      );
    }

    // mig 374 — auto-derived columns are READ-TIME mirrors of another field and
    // must NEVER be written. Guard BEFORE assertProductColumn: an auto field may
    // be a non-physical catalog field (no public.product column), so reaching
    // assertProductColumn would mis-reject it as COLUMN_NOT_IN_PRODUCT instead of
    // the correct READ_ONLY_COLUMN, and a physical auto field would otherwise be
    // editable. Mirrors the existing 'formula' READ_ONLY_COLUMN guard.
    if (await isAutoColumn(context, column.column_key)) {
      throw new ValidationError('READ_ONLY_COLUMN', 'Auto-derived columns cannot be edited');
    }

    await assertProductColumn(context, column.column_key);
    const newValue = await validateValue(context, column, parsed.data.value);

    await context.client.query(`select set_config('app.fa_actor_user_id', $1, true)`, [context.userId]);
    const result = await updateProductCell(
      context,
      parsed.data.productCode,
      column.column_key,
      newValue,
    );

    // Lane-B: editing the Core recipe component list must actually MATERIALIZE
    // Production rows. The recipe→prod_detail sync (previously dead code in
    // cascade-engine) is now the org-scoped, idempotent SQL function
    // sync_prod_detail_rows (migration 157): it adds/removes/reorders prod_detail
    // rows to match product.recipe_components and wires item_id from the items
    // master by code. This is what turns "Production rows derive from Core recipe
    // components" from a promise into real rows.
    if (column.column_key === 'recipe_components') {
      await syncProdDetailRows(context, parsed.data.productCode);
    }

    await writeEditOutbox(context, parsed.data.productCode, column.column_key, result);
    safeRevalidatePath('/[locale]/fg/[productCode]', 'page');
    safeRevalidatePath('/[locale]/fg', 'page');

    return result;
  });
}

async function updateProductCell(
  ctx: OrgContextLike,
  productCode: string,
  columnName: string,
  value: string | number | boolean | Date | null,
): Promise<UpdateFaCellResult> {
  // product→items merge (mig 359, §8f finding #1): once public.product is a VIEW, `SELECT … FROM
  // public.product … FOR UPDATE` raises "cannot lock rows in a view". Acquire the row lock on the
  // canonical base row (public.items) instead — that serializes concurrent FA-cell edits per FG exactly
  // as the old single-row FOR UPDATE did. The read of the previous value + the UPDATE still go through
  // public.product (the view's INSTEAD-OF triggers fan the write to items + fg_npd_ext). The lock is
  // best-effort (an FG materialized only into product without an items twin in the pre-cut window still
  // works — the view read below is the authoritative existence check / PRODUCT_NOT_FOUND source).
  await ctx.client.query(
    `select i.id
       from public.items i
      where i.org_id = app.current_org_id()
        and i.item_code = $1
      for update`,
    [productCode],
  );

  const { rows } = await ctx.client.query<UpdateRow>(
    `with current_row as (
       select ${quoteIdentifier(columnName)}::text as previous_value,
              built as previous_built
         from public.product
        where org_id = app.current_org_id()
          and product_code = $1
     ),
     updated as (
       update public.product p
          set ${quoteIdentifier(columnName)} = $2
         from current_row
        where p.org_id = app.current_org_id()
          and p.product_code = $1
        returning p.${quoteIdentifier(columnName)}::text as new_value,
                  p.built as new_built,
                  current_row.previous_value,
                  current_row.previous_built
     )
     select previous_value,
            new_value,
            (previous_built is true and new_built is false) as built_reset
       from updated`,
    [productCode, value],
  );
  const row = rows[0];
  if (!row) {
    throw new ValidationError('PRODUCT_NOT_FOUND', 'Product is not visible in the current organization');
  }
  return {
    previousValue: row.previous_value,
    newValue: row.new_value,
    builtReset: row.built_reset,
  };
}

/**
 * Lane-B: materialize/refresh prod_detail rows from the product's recipe_components
 * via the migration-157 SECURITY DEFINER function. The function is org-scoped to
 * app.current_org_id() internally, so it runs safely inside the app-role transaction.
 */
async function writeEditOutbox(
  ctx: OrgContextLike,
  productCode: string,
  columnName: string,
  result: UpdateFaCellResult,
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4)`,
    [
      FA_EDIT_EVENT,
      productCode,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        product_code: productCode,
        diff: {
          [columnName]: {
            prev: result.previousValue,
            next: result.newValue,
          },
        },
        built_reset: result.builtReset,
      }),
      APP_VERSION,
    ],
  );
}

function safeRevalidatePath(path: string, type?: 'page' | 'layout'): void {
  try {
    revalidateLocalized(path, type);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
