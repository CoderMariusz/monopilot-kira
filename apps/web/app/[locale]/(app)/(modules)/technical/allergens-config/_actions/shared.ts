/**
 * 03-technical — Allergen-screens page-load shared types + the technical.* read-gate.
 *
 * Plain (non-`'use server'`) module so it may export non-async values + types. The
 * allergen MATRIX / CASCADE / PROCESS-ADDITIONS / CONTAMINATION pages all need the
 * same RBAC read-gate (any technical.* permission) and the same org-scoped query
 * client shape; this is the single home for both so each page-load action stays thin.
 *
 * Red lines honoured:
 *   - allergen cascade source is materialized + read-only at the NPD boundary;
 *   - overrides are additive (handled by the item-level editor, not these surfaces);
 *   - FG is canonical (no FA aliases).
 */

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type LoadState = 'ready' | 'empty' | 'error' | 'denied';

/**
 * Read-gate: a caller may VIEW an allergen surface when they hold ANY technical.*
 * permission. Resolved org-scoped under RLS against BOTH the normalized
 * role_permissions table AND the legacy roles.permissions jsonb cache. Fail-closed.
 */
export async function hasAnyTechnicalAccess(ctx: OrgActionContext): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp
              on rp.role_id = r.id
             and rp.permission like 'technical.%'
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or exists (
            select 1
              from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) perm
             where perm like 'technical.%'
          )
        )
      limit 1`,
    [ctx.userId, ctx.orgId],
  );
  return rows.length > 0;
}

/**
 * Edit-gate: technical.allergens.edit (the write capability). Used only to toggle
 * action affordances on the page — the API/lib re-checks server-side on every write.
 */
export async function hasAllergensEdit(ctx: OrgActionContext): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp
              on rp.role_id = r.id and rp.permission = 'technical.allergens.edit'
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? 'technical.allergens.edit'
        )
      limit 1`,
    [ctx.userId, ctx.orgId],
  );
  return rows.length > 0;
}
