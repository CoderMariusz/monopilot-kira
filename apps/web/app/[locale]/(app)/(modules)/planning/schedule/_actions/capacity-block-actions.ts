'use server';

import { z } from 'zod';

import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  PLANNING_WO_WRITE_PERMISSION,
  hasPermission,
  type OrgActionContext,
} from '../../work-orders/_actions/shared';

const BookCapacityBlockInput = z.object({
  trialId: z.string().uuid(),
  lineId: z.string().uuid(),
  blockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

function minutesSinceMidnight(value: string): number {
  const [h = '0', m = '0'] = value.split(':');
  return Number(h) * 60 + Number(m);
}

function safeRevalidate(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request store.
  }
}

export async function upsertCapacityBlock(rawInput: {
  trialId: string;
  lineId: string;
  blockDate: string;
  startTime: string;
  endTime: string;
}) {
  const parsed = BookCapacityBlockInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false as const, error: 'invalid_input' as const };

  const input = parsed.data;
  if (minutesSinceMidnight(input.endTime) <= minutesSinceMidnight(input.startTime)) {
    return { ok: false as const, error: 'invalid_range' as const };
  }

  try {
    return await withOrgContext(async (ctx: OrgActionContext) => {
      if (!(await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const lineResult = await ctx.client.query<{ id: string }>(
        `select id
           from public.production_lines
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'active'
          limit 1`,
        [input.lineId],
      );
      if (!lineResult.rows[0]) return { ok: false as const, error: 'invalid_line' as const };

      const trialResult = await ctx.client.query<{
        trial_id: string;
        trial_no: string;
        project_id: string;
        project_code: string;
      }>(
        `select tb.id::text as trial_id,
                tb.trial_no,
                p.id::text as project_id,
                p.code as project_code
           from public.trial_batches tb
           join public.npd_projects p
             on p.org_id = tb.org_id
            and p.id = tb.project_id
          where tb.org_id = app.current_org_id()
            and tb.id = $1::uuid
          limit 1`,
        [input.trialId],
      );
      const trial = trialResult.rows[0];
      if (!trial) return { ok: false as const, error: 'trial_not_found' as const };

      const label = `${trial.project_code} trial ${trial.trial_no}`;
      const saved = await ctx.client.query<{ id: string }>(
        `insert into public.planning_capacity_blocks
           (org_id, line_id, project_id, trial_id, label, block_date, start_time, end_time, block_type, created_by)
         values
           (app.current_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6::time, $7::time, 'npd_trial', $8::uuid)
         on conflict (org_id, trial_id) do update
            set line_id = excluded.line_id,
                project_id = excluded.project_id,
                label = excluded.label,
                block_date = excluded.block_date,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                block_type = excluded.block_type
       returning id::text as id`,
        [
          input.lineId,
          trial.project_id,
          input.trialId,
          label,
          input.blockDate,
          input.startTime,
          input.endTime,
          ctx.userId,
        ],
      );

      safeRevalidate('/planning/schedule');
      return { ok: true as const, id: saved.rows[0]?.id ?? null };
    });
  } catch (error) {
    console.error('[upsertCapacityBlock] persistence_failed', error);
    return { ok: false as const, error: 'persistence_failed' as const };
  }
}
