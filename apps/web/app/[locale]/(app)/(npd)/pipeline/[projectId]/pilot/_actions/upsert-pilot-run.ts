'use server';

/**
 * NPD PILOT stage — `upsertPilotRun` write Server Action.
 *
 * Creates or updates the pilot run plan (line / batch size / yield / duration /
 * planned date / supervisor) for a project. Org-scoped via withOrgContext → RLS
 * with app.current_org_id(). RBAC write gate = `npd.pilot.write` (BYTE-IDENTICAL
 * to the seeded permission string in migration 236).
 *
 * Numeric inputs stay decimal STRINGS (never floats) and are bound ::numeric.
 * Writes an append-only audit_events row and revalidates the pilot route.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasPilotPermission } from './get-pilot-run';
import { assertPilotWriteStage } from './pilot-stage-guard';
import type { PilotStageNotReachedContext } from './pilot-stage-guard';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import { isPercentWithinRange, percentFieldError } from '../../_lib/yield-percent';

const DECIMAL = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal string');
const OPTIONAL_DECIMAL = DECIMAL.nullable().optional();

const Input = z.object({
  projectId: z.string().uuid(),
  /** When present, update that run; otherwise insert a new run for the project. */
  pilotRunId: z.string().uuid().nullable().optional(),
  plannedDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
    .nullable()
    .optional(),
  line: z.string().trim().min(1, 'line is required').max(120),
  batchSizeKg: OPTIONAL_DECIMAL,
  // Exact 0..100 (Dec, never Number) — mirrors pilot_runs_expected_yield_pct_range.
  expectedYieldPct: DECIMAL.refine(isPercentWithinRange, { message: 'yield must be <= 100' })
    .nullable()
    .optional(),
  durationHours: OPTIONAL_DECIMAL,
  supervisorUserId: z.string().uuid().nullable().optional(),
  status: z.enum(['planned', 'in_progress', 'completed']).optional(),
});

export type UpsertPilotRunInput = z.infer<typeof Input>;

export type UpsertPilotRunError =
  | 'invalid_input'
  /** PF-R04-12: names the field so the modal stops saying "Could not save". */
  | 'yield_out_of_range'
  | 'line_required'
  | 'forbidden'
  | 'not_found'
  | 'stage_not_reached'
  | 'persistence_failed';

export type UpsertPilotRunResult =
  | { ok: true; data: { pilotRunId: string } }
  | { ok: false; error: UpsertPilotRunError; message?: string; stage?: PilotStageNotReachedContext };

const WRITE_PERMISSION = 'npd.pilot.write';

export async function upsertPilotRun(raw: unknown): Promise<UpsertPilotRunResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    // Name the field that failed instead of a bare `invalid_input` (PF-R04-12).
    const failed = new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? '')));
    const rawYield = (raw as { expectedYieldPct?: unknown } | null | undefined)?.expectedYieldPct;
    const error: UpsertPilotRunError = failed.has('expectedYieldPct')
      ? typeof rawYield === 'string' && percentFieldError(rawYield) === 'yield_out_of_range'
        ? 'yield_out_of_range'
        : 'invalid_input'
      : failed.has('line')
        ? 'line_required'
        : 'invalid_input';
    return { ok: false, error, message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPilotPermission(ctx, WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const stageGuard = await assertPilotWriteStage(ctx, input.projectId);
      if (!stageGuard.ok) {
        return stageGuard.error === 'stage_not_reached'
          ? { ok: false as const, error: 'stage_not_reached' as const, stage: stageGuard.stage }
          : { ok: false as const, error: 'not_found' as const };
      }

      const before = input.pilotRunId
        ? (
            await ctx.client.query(
              `select planned_date::text, line, batch_size_kg::text, expected_yield_pct::text,
                      duration_hours::text, supervisor_user_id::text, status
                 from public.pilot_runs
                where id = $1::uuid and project_id = $2::uuid and org_id = app.current_org_id()`,
              [input.pilotRunId, input.projectId],
            )
          ).rows[0] ?? null
        : null;

      if (input.pilotRunId && !before) {
        return { ok: false as const, error: 'not_found' as const };
      }

      const upsert = await ctx.client.query<{ id: string }>(
        input.pilotRunId
          ? `update public.pilot_runs
                set planned_date       = $3::date,
                    line               = $4,
                    batch_size_kg      = $5::numeric,
                    expected_yield_pct = $6::numeric,
                    duration_hours     = $7::numeric,
                    supervisor_user_id = $8::uuid,
                    status             = coalesce($9, status),
                    updated_by         = $10::uuid
              where id = $1::uuid and project_id = $2::uuid and org_id = app.current_org_id()
              returning id`
          : // NOTE: the INSERT branch has its own $1-based numbering — an unreferenced
            // leading parameter is untypable in the extended protocol and fails every
            // insert with "could not determine data type of parameter $1".
            `insert into public.pilot_runs
                (org_id, project_id, planned_date, line, batch_size_kg, expected_yield_pct,
                 duration_hours, supervisor_user_id, status, created_by, updated_by)
              values (app.current_org_id(), $1::uuid, $2::date, $3, $4::numeric, $5::numeric,
                 $6::numeric, $7::uuid, coalesce($8, 'planned'), $9::uuid, $9::uuid)
              returning id`,
        input.pilotRunId
          ? [
              input.pilotRunId,
              input.projectId,
              input.plannedDate ?? null,
              input.line ?? null,
              input.batchSizeKg ?? null,
              input.expectedYieldPct ?? null,
              input.durationHours ?? null,
              input.supervisorUserId ?? null,
              input.status ?? null,
              ctx.userId,
            ]
          : [
              input.projectId,
              input.plannedDate ?? null,
              input.line ?? null,
              input.batchSizeKg ?? null,
              input.expectedYieldPct ?? null,
              input.durationHours ?? null,
              input.supervisorUserId ?? null,
              input.status ?? null,
              ctx.userId,
            ],
      );
      const pilotRunId = upsert.rows[0]?.id;
      if (!pilotRunId) return { ok: false as const, error: 'persistence_failed' as const };

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 $2, 'pilot_run', $3,
                 $4::jsonb, $5::jsonb, gen_random_uuid(), 'standard')`,
        [
          ctx.userId,
          input.pilotRunId ? 'npd.pilot.run.updated' : 'npd.pilot.run.created',
          pilotRunId,
          before ? JSON.stringify(before) : null,
          JSON.stringify({
            plannedDate: input.plannedDate ?? null,
            line: input.line ?? null,
            batchSizeKg: input.batchSizeKg ?? null,
            expectedYieldPct: input.expectedYieldPct ?? null,
            durationHours: input.durationHours ?? null,
            status: input.status ?? null,
          }),
        ],
      );

      revalidateLocalized(`/pipeline/${input.projectId}/pilot`, 'page');

      return { ok: true as const, data: { pilotRunId } };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23503') return { ok: false, error: 'not_found' };
    console.error('[upsertPilotRun] persistence_failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
