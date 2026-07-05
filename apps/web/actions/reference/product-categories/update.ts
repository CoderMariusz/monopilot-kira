'use server';

import { revalidateLocalized } from '../../../lib/i18n/revalidate-localized';
import { hasPermission } from '../../../lib/auth/has-permission';
import {
  normalizeCategoryLabel,
  normalizeDisplayOrder,
  type ProductCategory,
  runWithOrgContext,
  writeProductCategoryAudit,
} from './_shared';

type Input = { id: string; label?: string; displayOrder?: number; isActive?: boolean };

export type UpdateProductCategoryResult =
  | { ok: true; data: ProductCategory }
  | { ok: false; error: 'invalid_input' | 'immutable_field' | 'forbidden' | 'not_found' | 'persistence_failed' };

export async function updateProductCategory(rawInput: unknown): Promise<UpdateProductCategoryResult> {
  const parsed = parseInput(rawInput);
  if (parsed === 'immutable_field') return { ok: false, error: 'immutable_field' };
  if (!parsed) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'settings.reference.edit'))) return { ok: false, error: 'forbidden' };

      const { rows, rowCount } = await ctx.client.query<ProductCategory>(
        `update "Reference"."ProductCategories"
            set label = coalesce($2, label),
                display_order = coalesce($3::integer, display_order),
                is_active = coalesce($4::boolean, is_active)
          where org_id = app.current_org_id()
            and id = $1::uuid
          returning id, org_id, code, label, is_active, display_order`,
        [parsed.id, parsed.label ?? null, parsed.displayOrder ?? null, parsed.isActive ?? null],
      );
      const row = rows[0];
      if ((rowCount ?? rows.length) < 1 || !row) return { ok: false, error: 'not_found' };

      await writeProductCategoryAudit(ctx.client, {
        orgId: ctx.orgId,
        actorUserId: ctx.userId,
        action: 'product_categories.update',
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

function parseInput(raw: unknown): Input | 'immutable_field' | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as { id?: unknown; code?: unknown; label?: unknown; displayOrder?: unknown; isActive?: unknown };
  if (c.code !== undefined) return 'immutable_field';
  if (typeof c.id !== 'string' || c.id.trim().length === 0) return null;
  const out: Input = { id: c.id.trim() };
  if (c.label !== undefined) {
    const label = normalizeCategoryLabel(c.label);
    if (!label) return null;
    out.label = label;
  }
  if (c.displayOrder !== undefined) {
    const displayOrder = normalizeDisplayOrder(c.displayOrder);
    if (displayOrder === null) return null;
    out.displayOrder = displayOrder;
  }
  if (c.isActive !== undefined) {
    if (typeof c.isActive !== 'boolean') return null;
    out.isActive = c.isActive;
  }
  if (out.label === undefined && out.displayOrder === undefined && out.isActive === undefined) return null;
  return out;
}
