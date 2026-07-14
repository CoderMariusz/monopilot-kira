'use server';

/**
 * NPD PILOT stage — `deletePilotRun` write Server Action.
 *
 * Org-scoped hard delete of a planned pilot run. RBAC: `npd.pilot.write`.
 * Rejects runs that have progressed past `planned` (`has_progressed`).
 * Child materials/checklist rows cascade via FK ON DELETE CASCADE.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasPilotPermission } from './get-pilot-run';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';

const Input = z.object({
  pilotRunId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export type DeletePilotRunError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'has_progressed'
  | 'persistence_failed';

export type DeletePilotRunResult =
  | { ok: true; data: { pilotRunId: string } }
  | { ok: false; error: DeletePilotRunError; message?: string };

const WRITE_PERMISSION = 'npd.pilot.write';

export async function deletePilotRun(raw: unknown): Promise<DeletePilotRunResult> {
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

      const deleted = await ctx.client.query<{
        id: string;
        status: string;
        line: string | null;
        deleted: boolean;
      }>(
        `with target as (
           select id, status, line
             from public.pilot_runs
            where id = $1::uuid
              and project_id = $2::uuid
              and org_id = app.current_org_id()
         ), removed as (
           delete from public.pilot_runs pr
            using target t
            where pr.id = t.id
              and pr.status = 'planned'
            returning pr.id
         )
         select t.id::text as id, t.status, t.line,
                (r.id is not null) as deleted
           from target t
           left join removed r on r.id = t.id`,
        [input.pilotRunId, input.projectId],
      );
      const row = deleted.rows[0];
      if (!row) return { ok: false as const, error: 'not_found' as const };
      if (!row.deleted) return { ok: false as const, error: 'has_progressed' as const };
      const pilotRunId = row.id;

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 'npd.pilot.run.deleted', 'pilot_run', $2,
                 $3::jsonb, null, gen_random_uuid(), 'standard')`,
        [ctx.userId, pilotRunId, JSON.stringify({ status: row.status, line: row.line })],
      );

      revalidateLocalized(`/pipeline/${input.projectId}/pilot`, 'page');
      return { ok: true as const, data: { pilotRunId } };
    });
  } catch (error) {
    console.error('[deletePilotRun] persistence_failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
