'use server';

/**
 * T-044 — UI: TEC-084 Recipe Sheet print view — read Server Action.
 *
 * Resolves the FG's industry variant from the public product `ext_jsonb.industry`
 * (default 'meat'), org-scoped under withOrgContext + RLS. The recipe rows + header
 * come from the EXISTING merged BOM read API (getBomDetailPage) — this reader only
 * adds the industry selector + the public notes; it NEVER reads private_jsonb (the
 * print sheet must not surface sensitive data, red-line).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from './shared';

export type RecipeIndustry = 'meat' | 'bakery' | 'pharma';

const KNOWN: ReadonlySet<RecipeIndustry> = new Set(['meat', 'bakery', 'pharma']);

export type GetRecipeIndustryResult =
  | { ok: true; industry: RecipeIndustry }
  | { ok: false; error: 'load_failed' };

/**
 * Reads `public.product.ext_jsonb->>'industry'` for one FG (org-scoped). Falls
 * back to 'meat' when missing or unrecognised. Never throws into the page.
 */
export async function getRecipeIndustry(productId: string): Promise<GetRecipeIndustryResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<GetRecipeIndustryResult> => {
      const { rows } = await (client as QueryClient).query<{ industry: string | null }>(
        `select lower(trim(coalesce(ext_jsonb->>'industry', ''))) as industry
           from public.product
          where org_id = app.current_org_id() and product_code = $1
          limit 1`,
        [productId],
      );
      const raw = rows[0]?.industry ?? '';
      const industry = KNOWN.has(raw as RecipeIndustry) ? (raw as RecipeIndustry) : 'meat';
      return { ok: true, industry };
    });
  } catch (err) {
    console.error('[technical/bom] getRecipeIndustry load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}
