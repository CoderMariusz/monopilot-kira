'use server';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createLogger } from '@monopilot/observability';
import { NUTRIENT_CODES } from '@monopilot/domain';
import type { SubmitForTrialResult } from './submit-for-trial-types';

const logger = createLogger({ name: 'npd-formulation-lifecycle' });

type GateRow = {
  formulation_id: string;
  version_id: string;
  state: string;
  product_code: string | null;
  total_pct: string | null;
  missing_cost_count: string | number;
  missing_nutrition_target_count: string | number;
};

export async function submitForTrial(input: { projectId?: unknown; versionId?: unknown }): Promise<SubmitForTrialResult> {
  const projectId = parseUuid(input?.projectId);
  const versionId = parseUuid(input?.versionId);
  if (!projectId || !versionId) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPermission(ctx, 'npd.recipe.submit_for_trial'))) return { ok: false, error: 'forbidden' };

      const loaded = await ctx.client.query<GateRow>(
        `with requested as (
           select
             f.id as formulation_id,
             fv.id as version_id,
             fv.state,
             f.product_code
           from public.formulations f
           join public.formulation_versions fv on fv.formulation_id = f.id
          where f.project_id = $1::uuid
            and f.org_id = app.current_org_id()
            and fv.id = $2::uuid
         ),
         resolved as (
           select r.formulation_id, r.version_id, r.state, r.product_code, 0 as rank
             from requested r
            where r.state = 'locked'
           union all
           select fb.formulation_id, fb.version_id, fb.state, fb.product_code, 1 as rank
             from requested r
             cross join lateral (
               select f.id as formulation_id, fv.id as version_id, fv.state, f.product_code
                 from public.formulations f
                 join public.formulation_versions fv on fv.formulation_id = f.id
                where f.id = r.formulation_id
                  and fv.state = 'locked'
                order by fv.version_number desc
                limit 1
             ) fb
            where r.state <> 'locked'
              and not exists (select 1 from requested r2 where r2.state = 'locked')
         )
         select
           rv.formulation_id,
           rv.version_id,
           rv.state,
           rv.product_code,
           coalesce(sum(fi.pct), 0)::text as total_pct,
           count(*) filter (where fi.cost_per_kg_eur is null) as missing_cost_count,
           case
             when fcc.version_id is null then cardinality($3::text[])
             else (
               select count(*)
                 from unnest($3::text[]) as required(nutrient_code)
                where not (coalesce(fcc.nutrition_json, '{}'::jsonb) ? required.nutrient_code)
             )
           end as missing_nutrition_target_count
         from resolved rv
         left join public.formulation_ingredients fi on fi.version_id = rv.version_id
         left join public.formulation_calc_cache fcc on fcc.version_id = rv.version_id
        group by rv.formulation_id, rv.version_id, rv.state, rv.product_code, rv.rank, fcc.version_id, fcc.nutrition_json
        order by rv.rank asc
        limit 1`,
        [projectId, versionId, NUTRIENT_CODES],
      );

      const row = loaded.rows[0];
      if (!row?.version_id) {
        const requested = await ctx.client.query<{ state: string }>(
          `select fv.state
             from public.formulations f
             join public.formulation_versions fv on fv.formulation_id = f.id
            where f.project_id = $1::uuid
              and f.org_id = app.current_org_id()
              and fv.id = $2::uuid
            limit 1`,
          [projectId, versionId],
        );
        if (!requested.rows[0]) return { ok: false, error: 'not_found' };
        return { ok: false, error: 'VERSION_NOT_LOCKED' };
      }
      if (row.state !== 'locked') return { ok: false, error: 'VERSION_NOT_LOCKED' };
      const resolvedVersionId = row.version_id;
      if (!isTotalPctInRange(row.total_pct)) return { ok: false, error: 'TOTAL_PCT_OUT_OF_RANGE' };
      if (Number(row.missing_cost_count) > 0) return { ok: false, error: 'MISSING_COST' };
      if (Number(row.missing_nutrition_target_count) > 0) {
        return { ok: false, error: 'MISSING_NUTRITION_TARGET' };
      }

      const existingTrial = await ctx.client.query<{ id: string }>(
        `select id from public.trial_batches
          where project_id = $1::uuid and org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      const trialAlreadyExists = existingTrial.rows.length > 0;

      if (!trialAlreadyExists) {
        await ctx.client.query(
          `insert into public.trial_batches
             (org_id, project_id, trial_no, batch_size_kg, result, created_by, updated_by)
           values (
             app.current_org_id(), $1::uuid, 'T-1',
             (select batch_size_kg from public.formulation_versions where id = $2::uuid),
             'pending', $3::uuid, $3::uuid
           )`,
          [projectId, resolvedVersionId, ctx.userId],
        );
      }

      const stateTransition = await ctx.client.query<{ id: string }>(
        `update public.formulation_versions fv
            set state = 'submitted_for_trial'
           from public.formulations f
          where fv.id = $1::uuid
            and fv.formulation_id = f.id
            and f.org_id = app.current_org_id()
            and fv.state = 'locked'
          returning fv.id`,
        [resolvedVersionId],
      );
      if (!stateTransition.rows[0]) {
        throw new Error('formulation_version_state_transition_failed');
      }

      await ctx.client.query(
        `insert into public.formulation_audit_log
           (org_id, formulation_id, version_id, event_type, event_payload, actor_user_id)
         values (app.current_org_id(), $1::uuid, $2::uuid, 'formulation.submitted_for_trial', $3::jsonb, $4::uuid)`,
        [row.formulation_id, resolvedVersionId, JSON.stringify({ productCode: row.product_code, trialCreated: !trialAlreadyExists }), ctx.userId],
      );
      await ctx.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, dedup_key, app_version)
         values (
           app.current_org_id(),
           'formulation.submitted_for_trial',
           'formulation',
           $1::uuid::text,
           $2::jsonb,
           'formulation.submitted_for_trial:' || $1::uuid::text,
           'npd-formulation-lifecycle-v1'
         )
         on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
        [resolvedVersionId, JSON.stringify({ formulationId: row.formulation_id, productCode: row.product_code, trialCreated: !trialAlreadyExists })],
      );

      return { ok: true, data: { versionId: resolvedVersionId, trialCreated: !trialAlreadyExists } };
    });
  } catch (error) {
    logger.error(
      { err: error, projectId, versionId, action: 'submitForTrial' },
      'formulation lifecycle action failed',
    );
    return { ok: false, error: 'persistence_failed' };
  }
}

function isTotalPctInRange(value: string | null): boolean {
  if (value === null) return false;
  const numeric = Number(value);
  return numeric >= 99.99 && numeric <= 100.01;
}

function parseUuid(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
