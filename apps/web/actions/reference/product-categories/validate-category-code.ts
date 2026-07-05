import type { OrgContext } from './_shared';

type QueryClient = OrgContext['client'];

export type ValidateCategoryCodeResult = { ok: true } | { ok: false; error: 'invalid_category' };

/**
 * Server-side guard for items.category_code: empty/undefined passes; otherwise the
 * code must exist and be active in the caller's org (RLS-scoped).
 */
export async function validateActiveCategoryCode(
  client: QueryClient,
  categoryCode: string | null | undefined,
): Promise<ValidateCategoryCodeResult> {
  if (categoryCode === undefined || categoryCode === null || categoryCode.trim() === '') {
    return { ok: true };
  }
  const code = categoryCode.trim();
  const { rows } = await client.query<{ code: string }>(
    `select code
       from "Reference"."ProductCategories"
      where org_id = app.current_org_id()
        and code = $1
        and is_active = true
      limit 1`,
    [code],
  );
  return rows.length > 0 ? { ok: true } : { ok: false, error: 'invalid_category' };
}
