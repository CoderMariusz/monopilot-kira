'use server';

import { revalidatePath } from 'next/cache';
import { signEvent } from '@monopilot/e-sign';
import type { ESignTxOptions } from '@monopilot/e-sign';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  GATE_ADVANCE_PERMISSION,
  GateActionError,
  emitOutbox,
  previousGate,
  requireActionPermission,
  serializeGateError,
  updateProjectGate,
} from './_lib/gate-helpers';
import { type OrgContextLike, type ProjectGate } from './shared';

const GATE_REVERTED_EVENT = 'npd.gate.reverted';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  pin: z.string().min(1).max(256),
});

type RevertProjectRow = {
  id: string;
  code: string;
  current_gate: ProjectGate;
  current_stage: string;
  product_code: string | null;
  npd_locked_for_release_at: string | null;
};

type RevertNpdGateResult =
  | { success: true }
  | { success: false; error: string; status: number };

export async function revertNpdGate(rawInput: unknown): Promise<RevertNpdGateResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { success: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext<RevertNpdGateResult>(async (ctx) => {
      const context = ctx as OrgContextLike;
      await requireActionPermission(context, GATE_ADVANCE_PERMISSION);

      const project = await loadProjectForRevert(context, parsed.data.projectId);
      if (project.npd_locked_for_release_at) {
        return { success: false, error: 'NPD_RELEASE_LOCKED', status: 409 };
      }

      const targetGate = previousGate(project.current_gate);
      if (!targetGate) {
        return { success: false, error: 'ALREADY_AT_FIRST_GATE', status: 409 };
      }

      await signEvent(
        {
          signerUserId: context.userId,
          pin: parsed.data.pin,
          intent: GATE_REVERTED_EVENT,
          subject: {
            projectId: project.id,
            projectCode: project.code,
            fromGate: project.current_gate,
            toGate: targetGate,
          },
          nonce: `${GATE_REVERTED_EVENT}:${project.id}:${project.current_gate}:${targetGate}:${Date.now()}`,
          reason: parsed.data.reason,
        },
        { client: context.client as ESignTxOptions['client'] },
      );

      await updateProjectGate(context, project.id, targetGate);
      await emitOutbox(context, {
        eventType: GATE_REVERTED_EVENT,
        aggregateType: 'npd_project',
        aggregateId: project.id,
        payload: {
          project_id: project.id,
          from_gate: project.current_gate,
          to_gate: targetGate,
          reason: parsed.data.reason,
          actor_user_id: context.userId,
        },
        dedupKey: `${GATE_REVERTED_EVENT}:${project.id}:${project.current_gate}:${targetGate}:${Date.now()}`,
      });

      safeRevalidatePath(`/npd/pipeline/${project.id}`);
      return { success: true };
    });
  } catch (error) {
    const serialized = serializeGateError(error);
    if (serialized) return { success: false, error: serialized.error, status: serialized.status };
    if (error instanceof Error && /pin|failed|locked/i.test(error.message)) {
      return { success: false, error: 'ESIGN_FAILED', status: 403 };
    }
    console.error('[revertNpdGate] persistence_failed', {
      appVersion: APP_VERSION,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

async function loadProjectForRevert(ctx: OrgContextLike, projectId: string): Promise<RevertProjectRow> {
  const { rows } = await ctx.client.query<RevertProjectRow>(
    `select p.id,
            p.code,
            p.current_gate,
            p.current_stage,
            p.product_code,
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
  if (!project) throw new GateActionError('NOT_FOUND', 404);
  return project;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
