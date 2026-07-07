'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { recallFactorySpecInTransaction } from '../../../../../../../lib/technical/recall-factory-spec-core';
import { safeRevalidatePath } from './revalidate';
import {
  hasPermission,
  type OrgActionContext,
  type QueryClient,
} from './shared';

const FACTORY_SPEC_RECALL_PERMISSION = 'technical.factory_spec.recall';

const RecallFactorySpecInput = z.object({
  specId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export type RecallFactorySpecInput = z.input<typeof RecallFactorySpecInput>;

export type RecallFactorySpecResult = { success: true } | { error: string };

function normalizeReason(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

export async function recallFactorySpec(rawInput: unknown): Promise<RecallFactorySpecResult> {
  const parsed = RecallFactorySpecInput.safeParse(rawInput);
  if (!parsed.success) return { error: parsed.error.message };
  const reason = normalizeReason(parsed.data.reason);

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<RecallFactorySpecResult> => {
      const db = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: db };
      if (!(await hasPermission(ctx, FACTORY_SPEC_RECALL_PERMISSION))) {
        return { error: 'forbidden' };
      }

      const recall = await recallFactorySpecInTransaction(ctx, {
        specId: parsed.data.specId,
        reason,
      });
      if (!recall.ok) return { error: recall.error };

      safeRevalidatePath('/technical/factory-specs');
      return { success: true };
    });
  } catch (error) {
    console.error('[technical/factory-specs] recallFactorySpec failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { error: 'persistence_failed' };
  }
}
