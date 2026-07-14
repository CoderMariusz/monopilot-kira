'use server';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createLogger } from '@monopilot/observability';
import { isTotalPctValid, NUTRIENT_CODES } from '@monopilot/domain';

const logger = createLogger({ name: 'npd-formulation-lifecycle' });

type VersionRow = {
  formulation_id: string;
  version_id: string;
  state: string;
  product_code: string | null;
  actual_total_pct: string | null;
  missing_cost_count: string | number;
  missing_nutrition_target_count: string | number;
};

type LockVersionResult =
  | { ok: true; data: { versionId: string; formulationId: string; recipeComponents: string | null } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'VERSION_LOCKED'
        | 'VERSION_NOT_DRAFT'
        | 'TOTAL_PCT_OUT_OF_RANGE'
        | 'MISSING_COST'
        | 'MISSING_NUTRITION_TARGET'
        | 'persistence_failed';
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
           f.product_code,
           case
             when fv.batch_size_kg is null or fv.batch_size_kg = 0 then null
             else (
               coalesce((select sum(fi.qty_kg) from public.formulation_ingredients fi where fi.version_id = fv.id), 0)
               / fv.batch_size_kg * 100
             )::text
           end as actual_total_pct,
           (select count(*) from public.formulation_ingredients fi
             where fi.version_id = fv.id and fi.cost_per_kg_eur is null) as missing_cost_count,
           case
             when fcc.version_id is null then cardinality($3::text[])
             else (
               select count(*)
                 from unnest($3::text[]) as required(nutrient_code)
                where not (coalesce(fcc.nutrition_json, '{}'::jsonb) ? required.nutrient_code)
             )
           end as missing_nutrition_target_count
         from public.formulations f
         join public.formulation_versions fv on fv.formulation_id = f.id
         left join public.formulation_calc_cache fcc on fcc.version_id = fv.id
        where f.project_id = $1::uuid
          and f.org_id = app.current_org_id()
          and fv.id = $2::uuid
        for update of f, fv`,
        [projectId, versionId, NUTRIENT_CODES],
      );

      const row = loaded.rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      if (row.state === 'locked') return { ok: false, error: 'VERSION_LOCKED' };
      if (row.state !== 'draft') {
        return { ok: false, error: 'VERSION_NOT_DRAFT' };
      }
      if (!isTotalPctValid(row.actual_total_pct)) return { ok: false, error: 'TOTAL_PCT_OUT_OF_RANGE' };
      if (Number(row.missing_cost_count) > 0) return { ok: false, error: 'MISSING_COST' };
      if (Number(row.missing_nutrition_target_count) > 0) {
        return { ok: false, error: 'MISSING_NUTRITION_TARGET' };
      }

      await ctx.client.query(
        `update public.formulation_versions
            set state = 'locked'
          where id = $1::uuid
            and state = 'draft'`,
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

function parseUuid(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
