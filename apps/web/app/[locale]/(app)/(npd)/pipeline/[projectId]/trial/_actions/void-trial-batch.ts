'use server';

/**
 * 01-NPD TRIAL stage — `voidTrialBatch` (corrective withdrawal).
 *
 * PF-R04-12: a persisted trial only offered Edit / Re-book. `deleteTrialBatch`
 * hard-deletes and refuses anything already graded, so a mistaken trial — the
 * exact case that matters after a G4 approval — could not be reversed at all.
 *
 * Trials are audited evidence, so this is an explicit soft void (migration 518):
 * the row survives with who / when / why, drops out of the active list, and can
 * no longer be edited (`updateTrialBatch` → `voided`), deleted or booked.
 *
 * Guards, in order:
 *   - `npd.trial.write` — the module's existing write gate (edit + delete use it).
 *     There is no seeded `npd.trial.void`; inventing one would deny every role
 *     until an RBAC enum + seed migration lands (outside this change's scope).
 *   - an active, verified, non-superseded G4 e-sign approval BLOCKS the void:
 *     voiding a `pass` a signed gate relied on would leave the signature standing
 *     over vanished evidence. Revert the gate first (revert-npd-gate supersedes
 *     the approval), then void.
 *
 * Line time is released through the Planning-owned helper inside this same
 * transaction — NPD must not DELETE from `planning_capacity_blocks` itself — and
 * the helper's full pre-image is what the audit trail records.
 *
 * The result type lives in `./errors` because a `'use server'` module must export
 * nothing but async server actions.
 */

import { z } from 'zod';

import { hasPermission } from '../../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import { hasActiveVerifiedG4Approval } from '../../../../../../../../lib/npd/g4-definition-freeze';
import { releaseTrialCapacityBlock } from '../../../../../(modules)/planning/schedule/_lib/release-capacity-block';
import {
  TRIAL_VOID_REASON_CODES,
  TRIAL_WRITE_PERMISSION,
  type VoidTrialBatchResult,
} from './errors';

const Input = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  reasonCode: z.enum(TRIAL_VOID_REASON_CODES),
  note: z.string().trim().max(2000).nullable().optional(),
});

export async function voidTrialBatch(raw: unknown): Promise<VoidTrialBatchResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      if (!(await hasPermission({ userId, orgId, client }, TRIAL_WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      // `for update` holds the trial row for the rest of this transaction so a
      // concurrent booking (which takes the same lock) cannot reserve line time
      // for a trial we are about to withdraw.
      const before = await client.query<{
        id: string;
        trial_no: string;
        result: string;
        yield_pct: string | null;
        batch_size_kg: string | null;
        voided_at: string | null;
      }>(
        `select id::text            as id,
                trial_no,
                result,
                yield_pct::text     as yield_pct,
                batch_size_kg::text as batch_size_kg,
                voided_at::text     as voided_at
           from public.trial_batches
          where id = $1::uuid and project_id = $2::uuid
            and org_id = app.current_org_id()
          limit 1
            for update`,
        [input.id, input.projectId],
      );
      const row = before.rows[0];
      if (!row) return { ok: false as const, error: 'not_found' as const };
      if (row.voided_at) return { ok: false as const, error: 'already_voided' as const };

      // A signed gate must never end up standing over withdrawn evidence.
      if (await hasActiveVerifiedG4Approval({ client }, input.projectId)) {
        return { ok: false as const, error: 'gate_approved' as const };
      }

      const voided = await client.query<{ id: string; voided_at: string }>(
        `update public.trial_batches
            set voided_at        = now(),
                voided_by        = $3::uuid,
                void_reason_code = $4,
                void_note        = $5,
                updated_by       = $3::uuid
          where id = $1::uuid and project_id = $2::uuid
            and org_id = app.current_org_id()
            and voided_at is null
          returning id::text as id, voided_at::text as voided_at`,
        [input.id, input.projectId, userId, input.reasonCode, input.note ?? null],
      );
      const updated = voided.rows[0];
      // Lost the race against a concurrent void — report it as such, not as a
      // persistence failure.
      if (!updated) return { ok: false as const, error: 'already_voided' as const };

      // Planning owns the reservation table; the helper runs on OUR client so the
      // release and the void commit (or roll back) together.
      const releasedBlock = await releaseTrialCapacityBlock(client, input.id);

      await client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 'npd.trial_batch.voided', 'npd.trial_batch', $2,
                 $3::jsonb, $4::jsonb, gen_random_uuid(), 'operational')`,
        [
          userId,
          updated.id,
          JSON.stringify({
            trialNo: row.trial_no,
            result: row.result,
            yieldPct: row.yield_pct,
            batchSizeKg: row.batch_size_kg,
            projectId: input.projectId,
          }),
          JSON.stringify({
            voidedAt: updated.voided_at,
            voidedBy: userId,
            reasonCode: input.reasonCode,
            note: input.note ?? null,
            releasedLineTime: releasedBlock !== null,
          }),
        ],
      );

      // The freed slot gets its OWN event carrying the complete pre-image — a
      // bare "releasedLineTime: true" could never tell you which line and which
      // window were handed back.
      if (releasedBlock) {
        await client.query(
          `insert into public.audit_events
             (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
              before_state, after_state, request_id, retention_class)
           values (app.current_org_id(), $1::uuid, 'user',
                   'npd.trial_line_time.released', 'planning.capacity_block', $2,
                   $3::jsonb, $4::jsonb, gen_random_uuid(), 'operational')`,
          [
            userId,
            releasedBlock.id,
            JSON.stringify({
              trialId: releasedBlock.trialId,
              projectId: releasedBlock.projectId ?? input.projectId,
              lineId: releasedBlock.lineId,
              lineCode: releasedBlock.lineCode,
              lineName: releasedBlock.lineName,
              label: releasedBlock.label,
              blockDate: releasedBlock.blockDate,
              startTime: releasedBlock.startTime,
              endTime: releasedBlock.endTime,
              blockType: releasedBlock.blockType,
            }),
            JSON.stringify({
              releasedBy: userId,
              reasonCode: input.reasonCode,
              note: input.note ?? null,
              cause: 'trial_voided',
            }),
          ],
        );
      }

      revalidateLocalized(`/pipeline/${input.projectId}/trial`, 'page');
      return {
        ok: true as const,
        data: { id: updated.id, releasedLineTime: releasedBlock !== null },
      };
    });
  } catch (err) {
    console.error('[voidTrialBatch] persistence_failed', {
      projectId: input.projectId,
      id: input.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
