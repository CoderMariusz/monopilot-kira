'use server';

import { signEvent } from '@monopilot/e-sign';
import type { ESignTxOptions } from '@monopilot/e-sign';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  APP_VERSION,
  GATE_APPROVE_PERMISSION,
  GATE_APPROVED_EVENT,
  deterministicApprovalHash,
  assertAdjacentStage,
  assertGateStageConsistent,
  emitOutbox,
  gateForStage,
  loadProjectForUpdate,
  requireActionPermission,
  seedHandoffChecklist,
  serializeGateError,
  updateProjectStage,
  type AnyStage,
  type GateBlocker,
} from './_lib/gate-helpers';
import { evaluateStageGate } from './_lib/evaluate-stage-gate';
import { type OrgContextLike, type ProjectGate } from './shared';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';

// T-111 reconciliation: the e-signature password is required ONLY when approving
// (G3/G4 require a BRCGS/CFR-21 e-sign). A rejection records the reason WITHOUT a
// password and WITHOUT an e-signature (signEvent is never invoked on the reject path).
// A discriminated union enforces this at the schema boundary: a stray `password` on
// the reject branch is stripped, and a missing `password` on the approve branch is a
// 400 INVALID_INPUT before any DB / e-sign work.
const approveSchema = z.object({
  projectId: z.string().uuid(),
  gateCode: z.enum(['G3', 'G4']),
  decision: z.literal('approved'),
  notes: z.string().trim().min(1).max(2000),
  password: z.string().min(1).max(256),
});

const rejectSchema = z.object({
  projectId: z.string().uuid(),
  gateCode: z.enum(['G3', 'G4']),
  decision: z.literal('rejected'),
  notes: z.string().trim().min(1).max(2000),
});

const inputSchema = z.discriminatedUnion('decision', [approveSchema, rejectSchema]);

export type ApproveProjectGateResult =
  | {
      ok: true;
      data: {
        projectId: string;
        approvedGate: 'G3' | 'G4';
        decision: 'approved' | 'rejected';
        currentGate: ProjectGate;
        currentStage: AnyStage;
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
      assertGateStageConsistent(project);
      // The project's DERIVED gate (from current_stage) must match the gate being
      // approved. G3 → packaging/trial/sensory/pilot; G4 → approval/handoff.
      if (project.current_gate !== parsed.data.gateCode) {
        return { ok: false, error: 'GATE_MISMATCH', status: 409 };
      }

      // G3/G4 e-sign approval records the checkpoint signature. Stage advancement only
      // happens when the target stage is adjacent to the current stage (pilot→approval
      // for G3, approval→handoff for G4) — never by skipping intermediate G3 substages.
      const targetStage =
        parsed.data.decision === 'approved'
          ? approvalTargetStage(project.current_stage, parsed.data.gateCode)
          : null;
      if (parsed.data.decision === 'approved') {
        const gateEvaluation = await evaluateStageGate(
          project.id,
          project.current_stage as AnyStage,
          targetStage ?? (project.current_stage as AnyStage),
          context,
          project,
          { mode: 'formal_approve', approveGateCode: parsed.data.gateCode },
        );
        if (gateEvaluation.status === 'HARD_BLOCKED') {
          return {
            ok: false,
            error: 'BLOCKERS_PRESENT',
            status: 409,
            blockers: gateEvaluation.blockers,
          };
        }
        if (gateEvaluation.status === 'SOFT_GATE_BLOCKED') {
          return {
            ok: false,
            error: 'BLOCKERS_PRESENT',
            status: 409,
            blockers: gateEvaluation.missing.map((item) => ({
              code: 'REQUIRED_EVIDENCE_MISSING' as const,
              message: item,
              itemText: item,
            })),
          };
        }
      }

      let currentGate: ReturnType<typeof gateForStage> = project.current_gate;

      // E-signature is collected ONLY on the approve path (G3/G4 require it). A rejection
      // records the reason with no password and no signature (esigned_at/esign_hash null).
      let esignedAt: string | null = null;
      let esignHash: string | null = null;
      let signatureId: string | null = null;
      if (parsed.data.decision === 'approved') {
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
        esignedAt = new Date(receipt.signedAt).toISOString();
        esignHash = deterministicApprovalHash(context.userId, project.id, parsed.data.gateCode, esignedAt);
        signatureId = receipt.signatureId;
      }

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

      let currentStage = project.current_stage as AnyStage;
      if (parsed.data.decision === 'approved' && targetStage) {
        assertAdjacentStage(project.current_stage, targetStage);
        if (project.current_stage === 'approval' && targetStage === 'handoff') {
          await seedHandoffChecklist(context, project);
        }
        await updateProjectStage(context, project.id, targetStage);
        currentStage = targetStage;
        currentGate = gateForStage(targetStage);
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
          current_gate: currentGate,
          current_stage: currentStage,
          approval_id: approvalId,
          e_sign_signature_id: signatureId,
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
          currentGate,
          currentStage,
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

function approvalTargetStage(currentStage: string, gateCode: 'G3' | 'G4'): AnyStage | null {
  if (gateCode === 'G3' && currentStage === 'pilot') return 'approval';
  if (gateCode === 'G4' && currentStage === 'approval') return 'handoff';
  return null;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
