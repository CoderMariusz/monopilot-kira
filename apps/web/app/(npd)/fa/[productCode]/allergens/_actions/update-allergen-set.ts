'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';

/**
 * T-038 — Allergen cascade ENGINE entry point (thin Server Action wrapper).
 *
 * Delegates to the DB engine function public.update_fa_allergen_set(product_code),
 * which recomputes the derived allergen set for the FG from RM/process/override
 * sources (via the fa_allergen_cascade read-model), MATERIALIZES published_allergens
 * → product.allergens and may_contain_allergens → product.may_contain, and EMITS the
 * canonical outbox event 'fa.allergens_changed' ONLY when the persisted set changes.
 *
 * DERIVED LAW: the engine recomputes from sources; users never author the set here.
 * This action is the trigger surface (call it after any RM / process / override change);
 * it carries no allergen payload of its own.
 *
 * Idempotent: re-invoking with no upstream change persists nothing and emits no event
 * (changed=false).
 *
 * Wave0 lock: org scope comes from withOrgContext → app.current_org_id(); the SQL
 * function is security invoker and re-scopes every statement. No org_id is passed in.
 *
 * PRD: docs/prd/01-NPD-PRD.md §8.5, §8.6, §8.10.
 */

const ALLERGEN_WRITE_PERMISSION = 'npd.allergen.write';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type EngineRow = {
  product_code: string;
  allergens: string[] | null;
  may_contain: string[] | null;
  changed: boolean;
};

export type UpdateFaAllergenSetInput = {
  productCode: string;
};

export type UpdateFaAllergenSetResult =
  | { ok: true; productCode: string; allergens: string[]; mayContain: string[]; changed: boolean }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED' };

export async function updateFaAllergenSet(
  input: UpdateFaAllergenSetInput,
): Promise<UpdateFaAllergenSetResult> {
  const productCode = normalizeText(input?.productCode);
  if (!productCode) return { ok: false, code: 'INVALID_INPUT' };

  return withOrgContext<UpdateFaAllergenSetResult>(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;
    try {
      if (!(await hasAllergenWritePermission(queryClient, userId, orgId))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const res = await queryClient.query<EngineRow>(
        `select product_code, allergens, may_contain, changed
           from public.update_fa_allergen_set($1)`,
        [productCode],
      );

      const row = res.rows[0];
      if (!row) return { ok: false, code: 'NOT_FOUND' };

      if (row.changed) {
        revalidateLocalized(`/npd/fg/${productCode}/allergens`, 'page');
      }

      return {
        ok: true,
        productCode: row.product_code,
        allergens: row.allergens ?? [],
        mayContain: row.may_contain ?? [],
        changed: row.changed,
      };
    } catch (error) {
      // The engine raises when the FG is not visible/owned in the current org.
      if (error instanceof Error && /not found in current org/i.test(error.message)) {
        return { ok: false, code: 'NOT_FOUND' };
      }
      return { ok: false, code: 'PERSISTENCE_FAILED' };
    }
  });
}

async function hasAllergenWritePermission(
  client: QueryClient,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { rows, rowCount } = await client.query<{ ok: boolean }>(
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
    [userId, orgId, ALLERGEN_WRITE_PERMISSION],
  );
  return (rowCount ?? rows.length) > 0;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
