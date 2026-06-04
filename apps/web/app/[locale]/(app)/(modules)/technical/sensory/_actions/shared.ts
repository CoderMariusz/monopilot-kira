/**
 * T-092 — 03-technical Sensory Evaluation: shared types + the RBAC read-gate
 * helper used by the sensory list Server Action.
 *
 * Plain (non-`'use server'`) module so it may export non-async values.
 *
 * Sensory is a READ-ONLY Technical surface backed by the T-084 read model
 * (migration 166 `public.technical_sensory_evaluations`). It has no dedicated
 * permission string; viewing it is allowed for any caller holding ANY permission
 * in the technical.* family (the org-admin family migration 154 seeds). This file
 * carries the read-gate helper + the subject-type contract.
 *
 * Red lines honoured:
 *   - No sensory WRITE path here (read model only).
 *   - NPD gate ownership is NOT moved into Technical — this only REPORTS state.
 *   - FG is canonical; no FA aliases.
 */

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

// Mirrors technical_sensory_evaluations_subject_type_check (migration 166).
export const SENSORY_SUBJECT_TYPES = ['product', 'project', 'work_order', 'item'] as const;
export type SensorySubjectType = (typeof SENSORY_SUBJECT_TYPES)[number];

/**
 * Read-gate: a caller may VIEW the sensory read model when they hold ANY
 * technical.* permission. Resolved org-scoped under RLS against BOTH the
 * normalized role_permissions table AND the legacy roles.permissions jsonb cache
 * (the same dual-source pattern the Items master uses). Fail-closed: zero
 * technical permissions → no access → permission-denied state, no data leak.
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
