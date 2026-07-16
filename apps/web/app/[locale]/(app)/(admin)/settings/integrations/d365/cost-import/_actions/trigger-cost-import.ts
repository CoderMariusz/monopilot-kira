'use server';

/**
 * T-089 — TEC-052 Cost Import from D365: trigger the import (enqueue pull job).
 *
 * RELOCATED 2026-06-05: moved with the D365 group into Settings › Integrations ›
 * D365 (old path technical/costs/d365-import/_actions/trigger-cost-import.ts).
 * Behaviour, RBAC, gate and append-only semantics are unchanged — only the
 * import depth to apps/web/lib was adjusted for the new location.
 *
 * Consumes the EXISTING D365 worker (T-028, lib/integrations/d365/pull.ts)
 * `enqueuePullJob` + the `assertD365Enabled` gate (T-030). R15 anti-corruption:
 *
 *   - GATED: `assertD365Enabled` (feature flag ON + reference constants present)
 *     → V-TEC-70 / V-SET-42 surface as `disabled` (the UI maps to the banner).
 *   - RBAC: `technical.d365.sync_trigger` required (hasD365SyncPermission).
 *   - APPEND-ONLY: this only ENQUEUES a pull job (idempotent, V-TEC-72). It never
 *     overwrites a local cost in place — the worker's reconcile path appends and
 *     respects drift (V-TEC-73 local-edits-win). Applying the diff later goes
 *     through the existing postCost path (source='d365_sync').
 *   - The audit `reason` is required (>= 10 chars) when high-variance rows exist;
 *     it is recorded on the job payload for the operator trail.
 *
 * Org-scoped via withOrgContext + RLS. No mocks.
 */

import { withOrgContext } from '../../../../../../../../../lib/auth/with-org-context';
import { isCostImportPermitted } from '../../../../../../../../../actions/d365/export-only-policy';
import { D365DisabledError, assertD365Enabled } from '../../../../../../../../../lib/integrations/d365/gate';
import { enqueuePullJob } from '../../../../../../../../../lib/integrations/d365/pull';
import { hasD365SyncPermission } from '../../../../../../../../../lib/integrations/d365/rbac';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type TriggerCostImportInput = {
  /** Audit-logged sign-off reason; required (>= 10 chars) for high-variance imports. */
  reason: string;
};

export type TriggerCostImportResult =
  | { ok: true; jobId: string; duplicate: boolean }
  | { ok: false; error: 'forbidden' | 'disabled' | 'invalid_input' | 'export_only_violation' | 'persistence_failed'; message?: string };

const MIN_REASON_LEN = 10;

export async function triggerCostImport(input: TriggerCostImportInput): Promise<TriggerCostImportResult> {
  const reason = (input?.reason ?? '').trim();
  if (reason.length < MIN_REASON_LEN) {
    return { ok: false, error: 'invalid_input', message: `reason must be at least ${MIN_REASON_LEN} characters` };
  }

  if (!isCostImportPermitted()) {
    return {
      ok: false,
      error: 'export_only_violation',
      message: 'D365 cost import is blocked per R15 export-only policy (Monopilot → D365 only).',
    };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<TriggerCostImportResult> => {
      const qc = client as QueryClient;

      // RBAC first (cheap, clear 403). Then the integration gate (V-TEC-70/V-SET-42).
      if (!(await hasD365SyncPermission(qc, userId, orgId))) {
        return { ok: false, error: 'forbidden' };
      }

      try {
        await assertD365Enabled(qc);
      } catch (gateErr) {
        if (gateErr instanceof D365DisabledError) {
          return { ok: false, error: 'disabled', message: gateErr.message };
        }
        throw gateErr;
      }

      // Enqueue an idempotent items cost pull. recordKey scopes the dedupe per
      // org+day so re-triggering the same day is a no-op (V-TEC-72).
      const recordKey = `cost-import:${new Date().toISOString().slice(0, 10)}`;
      const result = await enqueuePullJob(qc, orgId, {
        targetEntity: 'items',
        recordKey,
        createdBy: userId,
        payload: { kind: 'cost_import', reason },
      });

      if (!result.ok) {
        return { ok: false, error: 'persistence_failed' };
      }

      return { ok: true, jobId: result.job.id, duplicate: result.duplicate };
    });
  } catch (error) {
    console.error('[settings/integrations/d365/cost-import] triggerCostImport failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
