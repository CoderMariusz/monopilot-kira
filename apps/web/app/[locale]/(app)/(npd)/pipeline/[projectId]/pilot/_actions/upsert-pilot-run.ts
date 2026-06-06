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
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasPilotPermission } from './get-pilot-run';

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
  line: z.string().trim().max(120).nullable().optional(),
  batchSizeKg: OPTIONAL_DECIMAL,
  expectedYieldPct: DECIMAL.refine((s) => Number(s) <= 100, { message: 'yield must be <= 100' })
    .nullable()
    .optional(),
  durationHours: OPTIONAL_DECIMAL,
  supervisorUserId: z.string().uuid().nullable().optional(),
  status: z.enum(['planned', 'in_progress', 'completed']).optional(),
});

export type UpsertPilotRunInput = z.infer<typeof Input>;

export type UpsertPilotRunError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'persistence_failed';

export type UpsertPilotRunResult =
  | { ok: true; data: { pilotRunId: string } }
  | { ok: false; error: UpsertPilotRunError; message?: string };

const WRITE_PERMISSION = 'npd.pilot.write';

export async function upsertPilotRun(raw: unknown): Promise<UpsertPilotRunResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPilotPermission(ctx, WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      // Guard: the project must exist within this org (RLS scopes the lookup).
      const project = await ctx.client.query<{ id: string }>(
        `select id from public.npd_projects
          where id = $1::uuid and org_id = app.current_org_id() limit 1`,
        [input.projectId],
      );
      if (project.rows.length === 0) {
        return { ok: false as const, error: 'not_found' as const };
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
          : `insert into public.pilot_runs
                (org_id, project_id, planned_date, line, batch_size_kg, expected_yield_pct,
                 duration_hours, supervisor_user_id, status, created_by, updated_by)
              values (app.current_org_id(), $2::uuid, $3::date, $4, $5::numeric, $6::numeric,
                 $7::numeric, $8::uuid, coalesce($9, 'planned'), $10::uuid, $10::uuid)
              returning id`,
        [
          input.pilotRunId ?? null,
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

      revalidatePath(`/[locale]/(app)/(npd)/pipeline/${input.projectId}/pilot`, 'page');

      return { ok: true as const, data: { pilotRunId } };
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '23503') return { ok: false, error: 'not_found' };
    console.error('[upsertPilotRun] persistence_failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
