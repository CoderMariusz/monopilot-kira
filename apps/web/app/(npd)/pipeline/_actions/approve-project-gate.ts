'use server';

import { revalidatePath } from 'next/cache';
import { signEvent } from '@monopilot/e-sign';
import type { ESignTxOptions } from '@monopilot/e-sign';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  GATE_APPROVE_PERMISSION,
  GATE_APPROVED_EVENT,
  deterministicApprovalHash,
  emitOutbox,
  getBlockers,
  loadProjectForUpdate,
  nextGate,
  requireActionPermission,
  serializeGateError,
  updateProjectGate,
  type GateBlocker,
} from './_lib/gate-helpers';
import { type OrgContextLike, type ProjectGate } from './shared';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  gateCode: z.enum(['G3', 'G4']),
  decision: z.enum(['approved', 'rejected']),
  notes: z.string().trim().min(1).max(2000),
  password: z.string().min(1).max(256),
});

export type ApproveProjectGateResult =
  | {
      ok: true;
      data: {
        projectId: string;
        approvedGate: 'G3' | 'G4';
        decision: 'approved' | 'rejected';
        currentGate: ProjectGate;
        approvalId: string;
        outboxEventType: typeof GATE_APPROVED_EVENT;
      };
    }
  | { ok: false; error: string; status: number; blockers?: GateBlocker[] };

export async function approveProjectGate(rawInput: unknown): Promise<ApproveProjectGateResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext<ApproveProjectGateResult>(async (ctx) => {
      const context = ctx as OrgContextLike;
      await requireActionPermission(context, GATE_APPROVE_PERMISSION);

      const project = await loadProjectForUpdate(context, parsed.data.projectId);
      if (project.current_gate !== parsed.data.gateCode) {
        return { ok: false, error: 'GATE_MISMATCH', status: 409 };
      }

      const targetGate = parsed.data.decision === 'approved' ? nextGate(project.current_gate) : project.current_gate;
      if (!targetGate) return { ok: false, error: 'ADJACENCY_VIOLATION', status: 422 };

      const blockers = parsed.data.decision === 'approved' ? await getBlockers(context, project, targetGate) : [];
      if (blockers.length > 0) return { ok: false, error: 'BLOCKERS_PRESENT', status: 409, blockers };

      const receipt = await signEvent(
        {
          signerUserId: context.userId,
          pin: parsed.data.password,
          intent: `npd.gate.${parsed.data.decision}`,
          subject: {
            projectId: project.id,
            projectCode: project.code,
            gateCode: parsed.data.gateCode,
            decision: parsed.data.decision,
          },
          nonce: `${project.id}:${parsed.data.gateCode}:${parsed.data.decision}:${Date.now()}`,
          reason: parsed.data.notes,
        },
        { client: context.client as ESignTxOptions['client'] },
      );

      const esignedAt = new Date(receipt.signedAt).toISOString();
      const esignHash = deterministicApprovalHash(context.userId, project.id, parsed.data.gateCode, esignedAt);
      const approval = await context.client.query<{ id: string }>(
        `insert into public.gate_approvals
           (org_id, project_id, gate_code, decision, approver_user_id, notes, rejection_reason, esigned_at, esign_hash)
         values
           (app.current_org_id(), $1::uuid, $2, $3, $4::uuid, $5, $6, $7::timestamptz, $8)
         returning id`,
        [
          project.id,
          parsed.data.gateCode,
          parsed.data.decision,
          context.userId,
          parsed.data.notes,
          parsed.data.decision === 'rejected' ? parsed.data.notes : null,
          esignedAt,
          esignHash,
        ],
      );
      const approvalId = approval.rows[0]?.id;
      if (!approvalId) return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };

      if (parsed.data.decision === 'approved' && targetGate !== project.current_gate) {
        await updateProjectGate(context, project.id, targetGate);
      }

      await emitOutbox(context, {
        eventType: GATE_APPROVED_EVENT,
        aggregateType: 'npd_project',
        aggregateId: project.id,
        payload: {
          org_id: context.orgId,
          actor_user_id: context.userId,
          project_id: project.id,
          project_code: project.code,
          gate_code: parsed.data.gateCode,
          decision: parsed.data.decision,
          current_gate: targetGate,
          approval_id: approvalId,
          e_sign_signature_id: receipt.signatureId,
          esign_hash: esignHash,
        },
        dedupKey: `${GATE_APPROVED_EVENT}:${approvalId}`,
      });

      safeRevalidatePath(`/npd/pipeline/${project.id}`);
      return {
        ok: true,
        data: {
          projectId: project.id,
          approvedGate: parsed.data.gateCode,
          decision: parsed.data.decision,
          currentGate: targetGate,
          approvalId,
          outboxEventType: GATE_APPROVED_EVENT,
        },
      };
    });
  } catch (error) {
    const serialized = serializeGateError(error);
    if (serialized) return serialized;
    if (error instanceof Error && /pin|failed|locked/i.test(error.message)) {
      return { ok: false, error: 'ESIGN_FAILED', status: 403 };
    }
    console.error('[approveProjectGate] persistence_failed', {
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
