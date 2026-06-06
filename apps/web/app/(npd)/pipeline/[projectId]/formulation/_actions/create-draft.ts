'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export type CreateDraftResult =
  | { ok: true; data: { versionId: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

type Ctx = {
  userId: string;
  orgId: string;
  client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> };
};

/**
 * Create the FIRST formulation draft for a project (the "Create a draft version"
 * affordance on the empty Recipe stage). Inserts a `formulations` row (if none yet)
 * + a `formulation_versions` row (version 1, state 'draft') and points
 * formulations.current_version_id at it. Idempotent: if a draft version already
 * exists it returns that versionId. RBAC: npd.formulation.create_draft.
 */
export async function createFormulationDraft(input: { projectId?: unknown }): Promise<CreateDraftResult> {
  const projectId = parseUuid(input?.projectId);
  if (!projectId) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (rawCtx): Promise<CreateDraftResult> => {
      const ctx = rawCtx as Ctx;
      if (!(await hasPermission(ctx, 'npd.formulation.create_draft'))) return { ok: false, error: 'forbidden' };

      const proj = await ctx.client.query<{ product_code: string | null }>(
        `select product_code from public.npd_projects
          where id = $1::uuid and org_id = app.current_org_id() limit 1`,
        [projectId],
      );
      if (proj.rows.length === 0) return { ok: false, error: 'not_found' };

      const existing = await ctx.client.query<{ formulation_id: string; current_version_id: string | null }>(
        `select id as formulation_id, current_version_id from public.formulations
          where project_id = $1::uuid and org_id = app.current_org_id() limit 1`,
        [projectId],
      );

      let formulationId: string;
      if (existing.rows[0]) {
        formulationId = existing.rows[0].formulation_id;
        if (existing.rows[0].current_version_id) {
          return { ok: true, data: { versionId: existing.rows[0].current_version_id } };
        }
      } else {
        const inserted = await ctx.client.query<{ id: string }>(
          `insert into public.formulations (org_id, project_id, product_code, created_by_user)
           values (app.current_org_id(), $1::uuid, $2, $3::uuid)
           returning id`,
          [projectId, proj.rows[0].product_code ?? null, ctx.userId],
        );
        formulationId = inserted.rows[0]!.id;
      }

      const nextNum = await ctx.client.query<{ n: number }>(
        `select coalesce(max(version_number), 0) + 1 as n
           from public.formulation_versions where formulation_id = $1::uuid`,
        [formulationId],
      );
      const version = await ctx.client.query<{ id: string }>(
        `insert into public.formulation_versions (formulation_id, version_number, state, created_by_user)
         values ($1::uuid, $2, 'draft', $3::uuid)
         returning id`,
        [formulationId, nextNum.rows[0]!.n, ctx.userId],
      );
      const versionId = version.rows[0]!.id;

      await ctx.client.query(
        `update public.formulations set current_version_id = $2::uuid
          where id = $1::uuid and org_id = app.current_org_id()`,
        [formulationId, versionId],
      );

      return { ok: true, data: { versionId } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

async function hasPermission(ctx: Ctx, permission: string): Promise<boolean> {
  const result = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return result.rows.length > 0;
}

function parseUuid(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
