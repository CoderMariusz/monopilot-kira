'use server';

import { hasPermission } from '../../../lib/auth/has-permission';
import { type ProductCategory, runWithOrgContext } from './_shared';

type ListInput = { includeInactive?: boolean };

export type ListProductCategoriesResult =
  | { ok: true; data: ProductCategory[] }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export type ListActiveProductCategoriesResult =
  | { ok: true; data: Array<{ code: string; label: string }> }
  | { ok: false; error: 'persistence_failed' };

const SELECT_COLS = `id, org_id, code, label, is_active, display_order`;

export async function listProductCategories(rawInput: unknown = {}): Promise<ListProductCategoriesResult> {
  const input = parseListInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await runWithOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'settings.reference.view'))) return { ok: false, error: 'forbidden' };
      const activeSql = input.includeInactive ? '' : 'and is_active = true';
      const { rows } = await ctx.client.query<ProductCategory>(
        `select ${SELECT_COLS}
           from "Reference"."ProductCategories"
          where org_id = app.current_org_id()
            ${activeSql}
          order by display_order asc, label asc`,
      );
      return { ok: true, data: rows };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

/** Active categories for NPD / items dropdowns — org-scoped via RLS only. */
export async function listActiveProductCategories(): Promise<ListActiveProductCategoriesResult> {
  try {
    return await runWithOrgContext(async ({ client }) => {
      const { rows } = await client.query<{ code: string; label: string }>(
        `select code, label
           from "Reference"."ProductCategories"
          where org_id = app.current_org_id()
            and is_active = true
          order by display_order asc, label asc`,
      );
      return { ok: true, data: rows };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseListInput(raw: unknown): ListInput | null {
  if (raw === undefined || raw === null) return { includeInactive: false };
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as { includeInactive?: unknown };
  return { includeInactive: candidate.includeInactive === true };
}
