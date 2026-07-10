'use server';

/**
 * QA release for production-owned `wo_outputs`.
 *
 * Permission note: `wo_outputs` is owned by 08-production, but the existing RBAC
 * enum has no production-side batch QA release write permission. The closest
 * already-seeded write gate is `quality.batch.release` (migration 198), so this
 * action uses it while keeping the data mutation in the production module.
 */
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  transitionWoOutputQaForContext,
  type TransitionWoOutputQaDecision,
  type TransitionWoOutputQaInput,
  type TransitionWoOutputQaResult,
} from '../../../../../../lib/production/output/transition-output-qa';
import {
  hasPermission,
  type ProductionContext,
  type QueryClient,
} from '../../../../../../lib/production/shared';

export type ReleaseWoOutputQaDecision = TransitionWoOutputQaDecision;
export type ReleaseWoOutputQaInput = TransitionWoOutputQaInput;
export type ReleaseWoOutputQaResult = TransitionWoOutputQaResult;

export type OutputQaActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'error'; message?: string };

const QUALITY_BATCH_RELEASE_PERMISSION = 'quality.batch.release';

function asTrimmed(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isDecision(value: string | null): value is ReleaseWoOutputQaDecision {
  return value === 'PASSED' || value === 'FAILED';
}

export async function releaseWoOutputQa(
  input: ReleaseWoOutputQaInput,
): Promise<OutputQaActionResult<ReleaseWoOutputQaResult>> {
  const outputId = asTrimmed(input?.outputId);
  const decision = asTrimmed(input?.decision);
  const note = asTrimmed(input?.note);
  if (!outputId || !isUuid(outputId) || !isDecision(decision)) {
    return { ok: false, reason: 'error', message: 'invalid_input' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<OutputQaActionResult<ReleaseWoOutputQaResult>> => {
      const ctx: ProductionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, QUALITY_BATCH_RELEASE_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const result = await transitionWoOutputQaForContext(ctx, {
        outputId,
        decision,
        ...(note ? { note } : {}),
      });
      if (!result.ok) {
        if (result.reason === 'not_found') return { ok: false, reason: 'not_found' };
        if (result.reason === 'quality_hold_active') {
          return { ok: false, reason: 'error', message: 'quality_hold_active' };
        }
        return { ok: false, reason: 'error', message: result.message };
      }

      return { ok: true, data: result.data };
    });
  } catch (error) {
    console.error('[production] releaseWoOutputQa failed', error);
    if (error instanceof Error && error.message === 'quality_hold_active') {
      return { ok: false, reason: 'error', message: 'quality_hold_active' };
    }
    return { ok: false, reason: 'error' };
  }
}
