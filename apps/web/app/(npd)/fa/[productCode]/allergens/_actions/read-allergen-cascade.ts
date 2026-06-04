'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

/**
 * T-040 — Allergen cascade READ prefetch (Server Component data source).
 *
 * Thin org-scoped reader of the T-038 read-model VIEW public.fa_allergen_cascade.
 * The widget (apps/web/app/(npd)/fa/[productCode]/_components/allergen-cascade-widget.tsx)
 * renders the returned shape; no mocks, no client DB access.
 *
 * The VIEW is `security_invoker = true` and org-scoped via the underlying RLS
 * (app.current_org_id()); withOrgContext binds the app_user session + org before the
 * SELECT runs. Returns the four derived arrays plus a code→display-name map (locale
 * resolved from Reference."Allergens") so the widget never inlines allergen strings.
 *
 * READ-only: this action never writes. Override writes go through setAllergenOverride
 * (T-039); the cascade engine recompute goes through updateFaAllergenSet (T-038).
 *
 * PRD: docs/prd/01-NPD-PRD.md §8.5, §8.6, §8.7, §8.10.
 */

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type CascadeRow = {
  product_code: string;
  derived_allergens: string[] | null;
  published_allergens: string[] | null;
  may_contain_allergens: string[] | null;
  conditional_process_allergens: string[] | null;
};

type AllergenNameRow = {
  allergen_code: string;
  display_name: string;
};

export type AllergenCascadeReadModel = {
  productCode: string;
  derivedAllergens: string[];
  publishedAllergens: string[];
  mayContainAllergens: string[];
  conditionalProcessAllergens: string[];
  displayNames: Record<string, string>;
  /** Server-resolved write gate (npd.allergen.write). Never trusted from the client. */
  canWrite: boolean;
};

const ALLERGEN_WRITE_PERMISSION = 'npd.allergen.write';

export type ReadAllergenCascadeResult =
  | { ok: true; data: AllergenCascadeReadModel }
  | { ok: false; code: 'INVALID_INPUT' | 'NOT_FOUND' | 'FORBIDDEN' | 'READ_FAILED' };

/** locale → Reference."Allergens" display-name column. */
const DISPLAY_NAME_COLUMN: Record<string, string> = {
  en: 'display_name',
  pl: 'display_name_pl',
  ro: 'display_name_ro',
  uk: 'display_name_uk',
};

export async function readAllergenCascade(
  productCode: string,
  locale = 'en',
): Promise<ReadAllergenCascadeResult> {
  const code = typeof productCode === 'string' ? productCode.trim() : '';
  if (!code) return { ok: false, code: 'INVALID_INPUT' };

  const nameColumn = DISPLAY_NAME_COLUMN[locale] ?? 'display_name';

  return withOrgContext<ReadAllergenCascadeResult>(async ({ client, userId, orgId }) => {
    const queryClient = client as QueryClient;
    try {
      const res = await queryClient.query<CascadeRow>(
        `select product_code,
                derived_allergens,
                published_allergens,
                may_contain_allergens,
                conditional_process_allergens
           from public.fa_allergen_cascade
          where product_code = $1
          limit 1`,
        [code],
      );

      const row = res.rows[0];
      if (!row) return { ok: false, code: 'NOT_FOUND' };

      const names = await queryClient.query<AllergenNameRow>(
        `select allergen_code,
                coalesce(${nameColumn}, display_name, allergen_code) as display_name
           from "Reference"."Allergens"`,
      );
      const displayNames = names.rows.reduce<Record<string, string>>((acc, r) => {
        acc[r.allergen_code] = r.display_name;
        return acc;
      }, {});

      const canWrite = await hasAllergenWritePermission(queryClient, userId, orgId);

      return {
        ok: true,
        data: {
          productCode: row.product_code,
          derivedAllergens: row.derived_allergens ?? [],
          publishedAllergens: row.published_allergens ?? [],
          mayContainAllergens: row.may_contain_allergens ?? [],
          conditionalProcessAllergens: row.conditional_process_allergens ?? [],
          displayNames,
          canWrite,
        },
      };
    } catch (error) {
      if (error instanceof Error && /forbidden|permission/i.test(error.message)) {
        return { ok: false, code: 'FORBIDDEN' };
      }
      console.error('[allergen-cascade] org-scoped read failed:', error);
      return { ok: false, code: 'READ_FAILED' };
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
