'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

export type CreateVersionResult =
  | { ok: true; data: { versionId: string; versionNumber: number } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

type Ctx = {
  userId: string;
  orgId: string;
  client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> };
};

export async function createFormulationVersion(input: {
  projectId?: unknown;
  sourceVersionId?: unknown;
}): Promise<CreateVersionResult> {
  const projectId = parseUuid(input?.projectId);
  const requestedSourceVersionId = input?.sourceVersionId === undefined || input?.sourceVersionId === null
    ? null
    : parseUuid(input.sourceVersionId);
  if (!projectId || (input?.sourceVersionId !== undefined && input?.sourceVersionId !== null && !requestedSourceVersionId)) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext(async (rawCtx): Promise<CreateVersionResult> => {
      const ctx = rawCtx as Ctx;
      if (!(await hasPermission(ctx, 'npd.formulation.create_draft'))) return { ok: false, error: 'forbidden' };

      const formulation = await ctx.client.query<{ id: string; current_version_id: string | null }>(
        `select f.id, f.current_version_id
           from public.formulations f
          where f.project_id = $1::uuid
            and f.org_id = app.current_org_id()
          for update of f`,
        [projectId],
      );
      const row = formulation.rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      const sourceVersionId = requestedSourceVersionId ?? row.current_version_id;
      if (!sourceVersionId) return { ok: false, error: 'not_found' };

      const nextNum = await ctx.client.query<{ n: number }>(
        `select coalesce(max(version_number), 0) + 1 as n
           from public.formulation_versions
          where formulation_id = $1::uuid`,
        [row.id],
      );
      const versionNumber = nextNum.rows[0]!.n;

      const version = await ctx.client.query<{ id: string; version_number: number }>(
        `insert into public.formulation_versions (
           formulation_id,
           version_number,
           state,
           batch_size_kg,
           target_yield_pct,
           target_price_eur,
           created_by_user,
           schema_version
         )
         select
           $1::uuid,
           $2,
           'draft',
           batch_size_kg,
           target_yield_pct,
           target_price_eur,
           $4::uuid,
           schema_version
           from public.formulation_versions
          where id = $3::uuid
            and formulation_id = $1::uuid
         returning id, version_number`,
        [row.id, versionNumber, sourceVersionId, ctx.userId],
      );
      const created = version.rows[0];
      if (!created) return { ok: false, error: 'not_found' };

      await ctx.client.query(
        `insert into public.formulation_ingredients (
           version_id,
           rm_code,
           item_id,
           qty_kg,
           pct,
           cost_per_kg_eur,
           allergens_inherited,
           sequence,
           schema_version
         )
         select
           $1::uuid,
           rm_code,
           item_id,
           qty_kg,
           pct,
           cost_per_kg_eur,
           allergens_inherited,
           sequence,
           schema_version
           from public.formulation_ingredients
          where version_id = $2::uuid
          order by sequence`,
        [created.id, sourceVersionId],
      );

      await ctx.client.query(
        `update public.formulations
            set current_version_id = $2::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()`,
        [row.id, created.id],
      );

      await ctx.client.query(
        `insert into public.formulation_audit_log
           (org_id, formulation_id, version_id, event_type, event_payload, actor_user_id)
         values (
           app.current_org_id(),
           $1::uuid,
           $2::uuid,
           'formulation.version_created',
           -- $4 MUST be cast: jsonb_build_object args are "any", so an untyped
           -- bind param fails prepare with "could not determine data type of
           -- parameter $4" — which threw the whole action (→ persistence_failed,
           -- silently swallowed by the UI) so NO version was ever created.
           jsonb_build_object('sourceVersionId', $3::uuid::text, 'versionNumber', $4::int),
           $5::uuid
         )`,
        [row.id, created.id, sourceVersionId, created.version_number, ctx.userId],
      );

      return { ok: true, data: { versionId: created.id, versionNumber: created.version_number } };
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
