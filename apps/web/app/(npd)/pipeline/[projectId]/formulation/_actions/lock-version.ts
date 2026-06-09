'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createLogger } from '@monopilot/observability';

const logger = createLogger({ name: 'npd-formulation-lifecycle' });

type VersionRow = {
  formulation_id: string;
  version_id: string;
  state: string;
  product_code: string | null;
};

type LockVersionResult =
  | { ok: true; data: { versionId: string; formulationId: string; recipeComponents: string | null } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'VERSION_LOCKED' | 'VERSION_NOT_SUBMITTED' | 'persistence_failed';
    };

export async function lockVersion(input: { projectId?: unknown; versionId?: unknown }): Promise<LockVersionResult> {
  const projectId = parseUuid(input?.projectId);
  const versionId = parseUuid(input?.versionId);
  if (!projectId || !versionId) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'npd.formulation.lock'))) return { ok: false, error: 'forbidden' };

      const loaded = await ctx.client.query<VersionRow>(
        `select
           f.id as formulation_id,
           fv.id as version_id,
           fv.state,
           f.product_code
         from public.formulations f
         join public.formulation_versions fv on fv.formulation_id = f.id
        where f.project_id = $1::uuid
          and f.org_id = app.current_org_id()
          and fv.id = $2::uuid
        for update of f, fv`,
        [projectId, versionId],
      );

      const row = loaded.rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      if (row.state === 'locked') return { ok: false, error: 'VERSION_LOCKED' };
      if (row.state !== 'submitted_for_trial' && row.state !== 'draft') {
        return { ok: false, error: 'VERSION_NOT_SUBMITTED' };
      }

      await ctx.client.query(
        `update public.formulation_versions
            set state = 'locked'
          where id = $1::uuid
            and state in ('submitted_for_trial', 'draft')`,
        [versionId],
      );
      await ctx.client.query(
        `update public.formulations
            set locked_at = now(),
                locked_by_user = $3::uuid
          where id = $1::uuid
            and current_version_id = $2::uuid
            and org_id = app.current_org_id()`,
        [row.formulation_id, versionId, ctx.userId],
      );

      const cascade = row.product_code
        ? await ctx.client.query<{ recipe_components: string | null }>(
            `with generated as (
               select
                 string_agg(fi.rm_code, ', ' order by fi.sequence) as recipe_components,
                 string_agg(
                   'ING' || nullif(regexp_replace(fi.rm_code, '\\D', '', 'g'), ''),
                   ', ' order by fi.sequence
                 ) filter (where nullif(regexp_replace(fi.rm_code, '\\D', '', 'g'), '') is not null) as ingredient_codes
               from public.formulation_ingredients fi
              where fi.version_id = $2::uuid
             )
             update public.product p
                set recipe_components = generated.recipe_components,
                    ingredient_codes = generated.ingredient_codes
               from generated
              where p.product_code = $1
                and p.org_id = app.current_org_id()
              returning p.recipe_components`,
            [row.product_code, versionId],
          )
        : { rows: [{ recipe_components: null }] };
      const recipeComponents = cascade.rows[0]?.recipe_components ?? null;

      await ctx.client.query(
        `insert into public.formulation_audit_log
           (org_id, formulation_id, version_id, event_type, event_payload, actor_user_id)
         values (app.current_org_id(), $1::uuid, $2::uuid, 'formulation.locked', $3::jsonb, $4::uuid)`,
        [row.formulation_id, versionId, JSON.stringify({ productCode: row.product_code, recipeComponents }), ctx.userId],
      );
      await ctx.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, dedup_key, app_version)
         values (
           app.current_org_id(),
           'formulation.locked',
           'formulation',
           $1::uuid::text,
           $2::jsonb,
           'formulation.locked:' || $1::uuid::text,
           'npd-formulation-lifecycle-v1'
         )
         on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
        [
          versionId,
          JSON.stringify({
            formulationId: row.formulation_id,
            productCode: row.product_code,
            recipeComponents,
          }),
        ],
      );

      return { ok: true, data: { versionId, formulationId: row.formulation_id, recipeComponents } };
    });
  } catch (error) {
    logger.error(
      { err: error, projectId, versionId, action: 'lockVersion' },
      'formulation lifecycle action failed',
    );
    return { ok: false, error: 'persistence_failed' };
  }
}

async function hasPermission(
  ctx: { userId: string; orgId: string; client: { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> } },
  permission: string,
): Promise<boolean> {
  const result = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
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
