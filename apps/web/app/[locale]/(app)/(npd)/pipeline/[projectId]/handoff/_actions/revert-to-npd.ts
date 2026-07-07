'use server';

/**
 * NPD HANDOFF — `revertToNpd` Server Action.
 *
 * Reverses a promote-to-production / factory-release wedge: unlocks the NPD
 * project back to the handoff stage without deleting versioned BOMs or specs.
 *
 * Preconditions: the linked product is release-locked (`npd_locked_for_release_at`)
 * and/or the handoff checklist was promoted / factory release is active.
 *
 * When a released factory spec still exists, recalls it (same guards as
 * recallFactorySpec) before clearing the NPD lock. Active released/in-progress
 * work orders referencing the spec block the revert with the same message.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  GATE_APPROVE_PERMISSION,
  updateProjectStage,
} from '../../../../../../../(npd)/pipeline/_actions/_lib/gate-helpers';
import { hasPermission } from '../../../../../../../(npd)/pipeline/_actions/shared';
import {
  formatBlockingWorkOrdersError,
  recallFactorySpecInTransaction,
} from '../../../../../../../../lib/technical/recall-factory-spec-core';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';

import type { RevertToNpdResult } from './revert-to-npd.types';

const REVERT_TO_NPD_AUDIT_ACTION = 'npd.project.reverted_to_npd';

const Input = z.object({
  projectId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
});

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

type OrgCtx = { userId: string; orgId: string; client: QueryClient };

type ProjectRevertRow = {
  id: string;
  code: string;
  product_code: string | null;
  current_stage: string;
  current_gate: string;
  npd_locked_for_release_at: string | null;
};

type HandoffRow = {
  id: string;
  bom_verification_status: string | null;
  promote_to_production_date: string | null;
};

type ReleaseRow = {
  release_status: string | null;
  active_factory_spec_id: string | null;
};

type BlockingWorkOrderRow = { wo_number: string };

export async function revertToNpd(raw: unknown): Promise<RevertToNpdResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }

  const { projectId, reason } = parsed.data;

  try {
    const result = await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgCtx;

      if (!(await hasPermission(ctx, GATE_APPROVE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      const project = await loadProjectForRevert(ctx, projectId);
      const handoff = await loadHandoffForUpdate(ctx, projectId);
      if (!handoff) return { ok: false as const, error: 'not_found' as const };

      const release = await loadReleaseStatus(ctx, projectId);
      const releaseLocked =
        project.npd_locked_for_release_at !== null ||
        handoff.bom_verification_status === 'promoted' ||
        handoff.promote_to_production_date !== null ||
        release?.release_status === 'released_to_factory';

      if (!releaseLocked) {
        return { ok: false as const, error: 'not_release_locked' as const };
      }

      let factorySpecRecalled = false;
      const activeFactorySpecId = release?.active_factory_spec_id ?? null;

      if (activeFactorySpecId) {
        const blockingWoCodes = await loadBlockingWorkOrders(ctx, activeFactorySpecId);
        if (blockingWoCodes.length > 0) {
          return {
            ok: false as const,
            error: 'active_work_orders' as const,
            message: formatBlockingWorkOrdersError(blockingWoCodes),
          };
        }

        const recall = await recallFactorySpecInTransaction(ctx, {
          specId: activeFactorySpecId,
          reason,
          requireReleased: false,
        });
        if (!recall.ok) {
          if (recall.error.includes('work orders reference it')) {
            return {
              ok: false as const,
              error: 'active_work_orders' as const,
              message: recall.error,
            };
          }
          return { ok: false as const, error: 'persistence_failed' as const, message: recall.error };
        }
        factorySpecRecalled = recall.recalled;
      }

      if (project.product_code) {
        await ctx.client.query(
          `update public.product
              set private_jsonb = private_jsonb - 'npd_locked_for_release_at'
            where org_id = app.current_org_id()
              and product_code = $1`,
          [project.product_code],
        );
      }

      await ctx.client.query(
        `update public.handoff_checklists
            set bom_verification_status = case
                  when bom_verification_status = 'promoted' then 'pending'
                  else bom_verification_status
                end,
                promote_to_production_date = null,
                updated_by = $2::uuid
          where id = $1::uuid
            and org_id = app.current_org_id()`,
        [handoff.id, ctx.userId],
      );

      if (project.current_stage === 'launched' || project.current_gate === 'Launched') {
        await updateProjectStage(ctx, project.id, 'handoff');
      } else if (project.current_stage !== 'handoff') {
        await updateProjectStage(ctx, project.id, 'handoff');
      }

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user', $2, 'npd_project', $3,
                 $4::jsonb, $5::jsonb, $6::uuid, 'security')`,
        [
          ctx.userId,
          REVERT_TO_NPD_AUDIT_ACTION,
          project.id,
          JSON.stringify({
            projectId: project.id,
            projectCode: project.code,
            productCode: project.product_code,
            previousStage: project.current_stage,
            previousGate: project.current_gate,
            npdLockedForReleaseAt: project.npd_locked_for_release_at,
            handoffBomVerificationStatus: handoff.bom_verification_status,
            promoteToProductionDate: handoff.promote_to_production_date,
            releaseStatus: release?.release_status ?? null,
            activeFactorySpecId,
          }),
          JSON.stringify({
            currentStage: 'handoff',
            currentGate: 'G4',
            reason,
            factorySpecRecalled,
          }),
          randomUUID(),
        ],
      );

      return { ok: true as const, factorySpecRecalled };
    });

    if (!result.ok) return result;

    safeRevalidatePath(`/[locale]/(app)/(npd)/pipeline/${projectId}/handoff`);
    safeRevalidatePath(`/npd/pipeline/${projectId}`);
    safeRevalidatePath('/technical/factory-specs');

    return {
      ok: true,
      data: { projectId, factorySpecRecalled: result.factorySpecRecalled },
    };
  } catch (error) {
    console.error('[revertToNpd] persistence_failed:', error);
    const pg = error as { code?: string; constraint?: string; message?: string };
    const detail = [pg.code, pg.constraint ?? pg.message?.slice(0, 120)].filter(Boolean).join(' ');
    return { ok: false, error: 'persistence_failed', message: detail || undefined };
  }
}

async function loadProjectForRevert(ctx: OrgCtx, projectId: string): Promise<ProjectRevertRow> {
  const { rows } = await ctx.client.query<ProjectRevertRow>(
    `select p.id,
            p.code,
            p.product_code,
            p.current_stage,
            p.current_gate,
            product.private_jsonb ->> 'npd_locked_for_release_at' as npd_locked_for_release_at
       from public.npd_projects p
       left join public.product product
         on product.org_id = p.org_id
        and product.product_code = p.product_code
      where p.id = $1::uuid
        and p.org_id = app.current_org_id()
      for update of p`,
    [projectId],
  );
  const project = rows[0];
  if (!project) throw new Error('NOT_FOUND');
  return project;
}

async function loadHandoffForUpdate(ctx: OrgCtx, projectId: string): Promise<HandoffRow | null> {
  const { rows } = await ctx.client.query<HandoffRow>(
    `select id,
            bom_verification_status,
            promote_to_production_date::text as promote_to_production_date
       from public.handoff_checklists
      where project_id = $1::uuid
        and org_id = app.current_org_id()
      limit 1
      for update`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function loadReleaseStatus(ctx: OrgCtx, projectId: string): Promise<ReleaseRow | null> {
  const { rows } = await ctx.client.query<ReleaseRow>(
    `select release_status,
            active_factory_spec_id::text as active_factory_spec_id
       from public.factory_release_status
      where project_id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [projectId],
  );
  return rows[0] ?? null;
}

async function loadBlockingWorkOrders(ctx: OrgCtx, specId: string): Promise<string[]> {
  const { rows } = await ctx.client.query<BlockingWorkOrderRow>(
    `select wo_number
       from public.work_orders
      where org_id = app.current_org_id()
        and active_factory_spec_id = $1::uuid
        and upper(status) in ('RELEASED', 'IN_PROGRESS')
      order by wo_number asc
      limit 25`,
    [specId],
  );
  return rows.map((row) => row.wo_number);
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path, 'page');
  } catch {
    // Vitest imports Server Actions outside a Next request store.
  }
}
