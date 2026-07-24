'use server';

/**
 * 01-NPD TRIAL stage — `releaseTrialLineTime` (unbook).
 *
 * PF-R04-12: booking a trial onto a production line could only ever be
 * RE-pointed ("Re-book"), never undone — a slot booked by mistake stayed on the
 * planning board forever.
 *
 * `planning_capacity_blocks` (migration 423) has no status column and is unique
 * per trial, and every planning/schedule reader treats a present row as an
 * occupied slot. A soft "cancelled" flag would therefore keep the line blocked
 * everywhere until each of those readers learned to filter it — so the row is
 * removed, by the Planning-owned helper that owns that table, and the durable
 * trail is the full `audit_events` pre-image below (who, when, why, and exactly
 * which line + window was freed).
 *
 * RBAC: `npd.planning.write` — the same permission that books the slot in the
 * first place (see the trial page's canBookLineTime gate).
 *
 * The result type lives in `./errors` because a `'use server'` module must
 * export nothing but async server actions.
 */

import { z } from 'zod';

import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import { PLANNING_WO_WRITE_PERMISSION } from '../../../../../(modules)/planning/work-orders/_actions/shared';
import { releaseTrialCapacityBlock } from '../../../../../(modules)/planning/schedule/_lib/release-capacity-block';
import { TRIAL_VOID_REASON_CODES, type ReleaseTrialLineTimeResult } from './errors';

const Input = z.object({
  trialId: z.string().uuid(),
  projectId: z.string().uuid(),
  reasonCode: z.enum(TRIAL_VOID_REASON_CODES),
  note: z.string().trim().max(2000).nullable().optional(),
});

export async function releaseTrialLineTime(raw: unknown): Promise<ReleaseTrialLineTimeResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      if (!(await hasPermission({ userId, orgId, client }, PLANNING_WO_WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      // The trial must belong to this project + org before we touch its slot.
      const trial = await client.query<{ id: string }>(
        `select id::text as id
           from public.trial_batches
          where id = $1::uuid and project_id = $2::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [input.trialId, input.projectId],
      );
      if (trial.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      // Planning owns the reservation table; the helper runs on OUR client so
      // the release and its audit row commit (or roll back) together.
      const block = await releaseTrialCapacityBlock(client, input.trialId);
      if (!block) return { ok: false as const, error: 'not_booked' as const };

      await client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 'npd.trial_line_time.released', 'planning.capacity_block', $2,
                 $3::jsonb, $4::jsonb, gen_random_uuid(), 'operational')`,
        [
          userId,
          block.id,
          JSON.stringify({
            trialId: block.trialId,
            projectId: block.projectId ?? input.projectId,
            lineId: block.lineId,
            lineCode: block.lineCode,
            lineName: block.lineName,
            label: block.label,
            blockDate: block.blockDate,
            startTime: block.startTime,
            endTime: block.endTime,
            blockType: block.blockType,
          }),
          JSON.stringify({
            releasedBy: userId,
            reasonCode: input.reasonCode,
            note: input.note ?? null,
            cause: 'manual_unbook',
          }),
        ],
      );

      revalidateLocalized(`/pipeline/${input.projectId}/trial`, 'page');
      return { ok: true as const, data: { trialId: input.trialId } };
    });
  } catch (err) {
    console.error('[releaseTrialLineTime] persistence_failed', {
      projectId: input.projectId,
      trialId: input.trialId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
