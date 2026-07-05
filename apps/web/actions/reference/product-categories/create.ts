'use server';

import { revalidateLocalized } from '../../../lib/i18n/revalidate-localized';
import { hasPermission } from '../../../lib/auth/has-permission';
import {
  normalizeCategoryCode,
  normalizeCategoryLabel,
  normalizeDisplayOrder,
  type ProductCategory,
  runWithOrgContext,
  writeProductCategoryAudit,
} from './_shared';

type Input = { code: string; label: string; displayOrder: number; isActive: boolean };

export type CreateProductCategoryResult =
  | { ok: true; data: ProductCategory }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'duplicate_code' | 'persistence_failed' };

export async function createProductCategory(rawInput: unknown): Promise<CreateProductCategoryResult> {
  const input = parseInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'settings.reference.edit'))) return { ok: false, error: 'forbidden' };

      const duplicate = await ctx.client.query<{ code: string }>(
        `select code
           from "Reference"."ProductCategories"
          where org_id = app.current_org_id()
            and code = $1
          limit 1`,
        [input.code],
      );
      if (duplicate.rows.length > 0) return { ok: false, error: 'duplicate_code' };

      const { rows } = await ctx.client.query<ProductCategory>(
        `insert into "Reference"."ProductCategories"
           (org_id, code, label, is_active, display_order)
         values (app.current_org_id(), $1, $2, $3::boolean, $4::integer)
         returning id, org_id, code, label, is_active, display_order`,
        [input.code, input.label, input.isActive, input.displayOrder],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeProductCategoryAudit(ctx.client, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        action: 'product_categories.create',
        resourceId: row.id,
        afterState: { code: row.code, label: row.label, displayOrder: row.display_order, isActive: row.is_active },
      });

      revalidateLocalized('/settings/reference/product-categories');
      return { ok: true, data: row };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseInput(raw: unknown): Input | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as { code?: unknown; label?: unknown; displayOrder?: unknown; isActive?: unknown };
  const code = normalizeCategoryCode(c.code);
  const label = normalizeCategoryLabel(c.label);
  const displayOrder = normalizeDisplayOrder(c.displayOrder);
  if (!code || !label || displayOrder === null || typeof c.isActive !== 'boolean') return null;
  return { code, label, displayOrder, isActive: c.isActive };
}
