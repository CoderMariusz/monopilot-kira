'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  GATE_ADVANCE_PERMISSION,
  GATE_ADVANCED_EVENT,
  assertAdjacent,
  createFgCandidate,
  emitOutbox,
  getBlockers,
  loadProjectForUpdate,
  requireActionPermission,
  serializeGateError,
  updateProjectGate,
  type GateBlocker,
} from './_lib/gate-helpers';
import { type OrgContextLike, type ProjectGate } from './shared';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  targetGate: z.enum(['G1', 'G2', 'G3', 'G4', 'Launched']),
  productCode: z.string().trim().min(1).max(80).optional().nullable(),
});

export type AdvanceProjectGateResult =
  | {
      ok: true;
      data: {
        projectId: string;
        previousGate: ProjectGate;
        currentGate: ProjectGate;
        productCode: string | null;
        outboxEventType: typeof GATE_ADVANCED_EVENT;
      };
    }
  | { ok: false; error: string; status: number; blockers?: GateBlocker[] };

export async function advanceProjectGate(rawInput: unknown): Promise<AdvanceProjectGateResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext<AdvanceProjectGateResult>(async (ctx) => {
      const context = ctx as OrgContextLike;
      await requireActionPermission(context, GATE_ADVANCE_PERMISSION);

      const project = await loadProjectForUpdate(context, parsed.data.projectId);
      const targetGate = parsed.data.targetGate as ProjectGate;
      assertAdjacent(project.current_gate, targetGate);

      const blockers = await getBlockers(context, project, targetGate);
      if (blockers.length > 0) return { ok: false, error: 'BLOCKERS_PRESENT', status: 409, blockers };

      let productCode = project.product_code;
      if (targetGate === 'G3') {
        const fg = await createFgCandidate(context, project, parsed.data.productCode);
        productCode = fg.productCode;
      }

      await updateProjectGate(context, project.id, targetGate);
      await emitOutbox(context, {
        eventType: GATE_ADVANCED_EVENT,
        aggregateType: 'npd_project',
        aggregateId: project.id,
        payload: {
          org_id: context.orgId,
          actor_user_id: context.userId,
          project_id: project.id,
          project_code: project.code,
          previous_gate: project.current_gate,
          current_gate: targetGate,
          product_code: productCode,
        },
        dedupKey: `${GATE_ADVANCED_EVENT}:${project.id}:${project.current_gate}:${targetGate}`,
      });

      safeRevalidatePath(`/npd/pipeline/${project.id}`);
      return {
        ok: true,
        data: {
          projectId: project.id,
          previousGate: project.current_gate,
          currentGate: targetGate,
          productCode,
          outboxEventType: GATE_ADVANCED_EVENT,
        },
      };
    });
  } catch (error) {
    const serialized = serializeGateError(error);
    if (serialized) return serialized;
    console.error('[advanceProjectGate] persistence_failed', {
      appVersion: APP_VERSION,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
