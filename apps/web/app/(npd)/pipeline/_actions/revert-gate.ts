'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  GATE_ADVANCE_PERMISSION,
  GATE_REVERTED_EVENT,
  emitOutbox,
  loadProjectForUpdate,
  previousGate,
  requireActionPermission,
  serializeGateError,
  updateProjectGate,
} from './_lib/gate-helpers';
import { type OrgContextLike, type ProjectGate } from './shared';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  targetGate: z.enum(['G0', 'G1', 'G2', 'G3', 'G4']),
  reason: z.string().trim().min(10).max(2000),
});

export type RollbackGateResult =
  | {
      ok: true;
      data: {
        projectId: string;
        previousGate: ProjectGate;
        currentGate: ProjectGate;
        outboxEventType: typeof GATE_REVERTED_EVENT;
      };
    }
  | { ok: false; error: string; status: number };

export async function rollbackGate(rawInput: unknown): Promise<RollbackGateResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext<RollbackGateResult>(async (ctx) => {
      const context = ctx as OrgContextLike;
      await requireActionPermission(context, GATE_ADVANCE_PERMISSION);

      const project = await loadProjectForUpdate(context, parsed.data.projectId);
      if (project.current_stage === 'launched' || project.current_gate === 'Launched') {
        return { ok: false, error: 'launched_is_terminal', status: 409 };
      }

      const targetGate = parsed.data.targetGate as ProjectGate;
      if (!isRollbackTarget(project.current_gate, targetGate)) {
        return { ok: false, error: 'ROLLBACK_VIOLATION', status: 422 };
      }

      await updateProjectGate(context, project.id, targetGate);
      await context.client.query(
        `insert into public.audit_events
           (org_id, occurred_at, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, request_id, retention_class)
         values
           (app.current_org_id(), now(), $1::uuid, 'user', 'npd.gate.reverted', 'npd_project', $2, $3::jsonb, $4::jsonb, $5::uuid, 'security')`,
        [
          context.userId,
          project.id,
          JSON.stringify({ current_gate: project.current_gate, current_stage: project.current_stage }),
          JSON.stringify({ current_gate: targetGate, reason: parsed.data.reason }),
          randomUUID(),
        ],
      );
      await emitOutbox(context, {
        eventType: GATE_REVERTED_EVENT,
        aggregateType: 'npd_project',
        aggregateId: project.id,
        payload: {
          org_id: context.orgId,
          actor_user_id: context.userId,
          project_id: project.id,
          project_code: project.code,
          previous_gate: project.current_gate,
          current_gate: targetGate,
          reason: parsed.data.reason,
        },
        dedupKey: `${GATE_REVERTED_EVENT}:${project.id}:${project.current_gate}:${targetGate}:${Date.now()}`,
      });

      safeRevalidatePath(`/npd/pipeline/${project.id}`);
      return {
        ok: true,
        data: {
          projectId: project.id,
          previousGate: project.current_gate,
          currentGate: targetGate,
          outboxEventType: GATE_REVERTED_EVENT,
        },
      };
    });
  } catch (error) {
    const serialized = serializeGateError(error);
    if (serialized) return { ok: false, error: serialized.error, status: serialized.status };
    console.error('[rollbackGate] persistence_failed', {
      appVersion: APP_VERSION,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

export { rollbackGate as revertGate };

function isRollbackTarget(currentGate: ProjectGate, targetGate: ProjectGate): boolean {
  let cursor: ProjectGate | null = previousGate(currentGate);
  while (cursor) {
    if (cursor === targetGate) return true;
    cursor = previousGate(cursor);
  }
  return false;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
