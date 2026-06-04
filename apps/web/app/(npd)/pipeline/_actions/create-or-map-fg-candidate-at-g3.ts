'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  GATE_ADVANCE_PERMISSION,
  createFgCandidate,
  loadProjectForUpdate,
  requireActionPermission,
  serializeGateError,
} from './_lib/gate-helpers';
import { type OrgContextLike } from './shared';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(['create', 'map']).default('create'),
  productCode: z.string().trim().min(1).max(80).optional().nullable(),
});

export type CreateOrMapFgCandidateAtG3Result =
  | { ok: true; data: { projectId: string; productCode: string; created: boolean; mapped: boolean } }
  | { ok: false; error: string; status: number };

export async function createOrMapFgCandidateAtG3(
  rawInput: unknown,
): Promise<CreateOrMapFgCandidateAtG3Result> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext<CreateOrMapFgCandidateAtG3Result>(async (ctx) => {
      const context = ctx as OrgContextLike;
      await requireActionPermission(context, GATE_ADVANCE_PERMISSION);
      const project = await loadProjectForUpdate(context, parsed.data.projectId);
      if (project.current_gate !== 'G2' && project.current_gate !== 'G3') {
        return { ok: false, error: 'G3_ONLY', status: 409 };
      }
      if (parsed.data.mode === 'map' && !parsed.data.productCode) {
        return { ok: false, error: 'INVALID_INPUT', status: 400 };
      }

      const result = await createFgCandidate(context, project, parsed.data.productCode);
      safeRevalidatePath(`/npd/pipeline/${project.id}`);
      return { ok: true, data: { projectId: project.id, ...result } };
    });
  } catch (error) {
    const serialized = serializeGateError(error);
    if (serialized) return { ok: false, error: serialized.error, status: serialized.status };
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
