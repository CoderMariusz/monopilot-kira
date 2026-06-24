'use server';

/**
 * T-058 — TEC-073 D365 DLQ Manager server actions.
 *
 * Decision D-1: D365 surfaces live under settings/integrations/d365/*. These
 * actions back the DLQ Manager screen (retry / mark-resolved / skip).
 *
 * Contract:
 *   - RBAC `technical.d365.sync_trigger` FIRST — a caller without it never
 *     mutates the DLQ (returns { ok:false, error:'forbidden' }).
 *   - Retry is gated by `assertD365Enabled` (D365 is OPTIONAL, export/import
 *     only per R15) and delegates to the reviewed `retryDlqEntry` helper, which
 *     re-submits the dead-lettered job and marks the row resolved on success.
 *   - mark-resolved / skip are local-only state transitions on the operator's
 *     own DLQ row (an authorized, audited acknowledgement after a manual D365
 *     fix or a deliberate drop) — they never push to or pull from D365.
 *   - Every write runs under `withOrgContext` (RLS-scoped; org isolation).
 */

import { withOrgContext } from '../../../../../../../../../lib/auth/with-org-context';
import { assertD365Enabled, D365DisabledError } from '../../../../../../../../../lib/integrations/d365/gate';
import { hasD365SyncPermission } from '../../../../../../../../../lib/integrations/d365/rbac';
import { retryDlqEntry } from '../../../../../../../../../lib/integrations/d365/push';
import { makeD365PushClient } from '../../../../../../../../../lib/integrations/d365/client';

export type DlqActionResult =
  | { ok: true }
  | { ok: false; error: 'forbidden' | 'disabled' | 'not_found' | 'already_resolved' | 'push_failed' | 'invalid' | 'unavailable' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Retry a dead-lettered push job. Re-submits to D365 via the reviewed helper. */
export async function retryDlqEntryAction(dlqId: string): Promise<DlqActionResult> {
  if (!dlqId || !UUID_RE.test(dlqId)) return { ok: false, error: 'invalid' };
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;
      // RBAC FIRST — never let a caller without the permission trigger a push.
      const allowed = await hasD365SyncPermission(queryClient, userId, orgId);
      if (!allowed) return { ok: false, error: 'forbidden' };

      try {
        await assertD365Enabled(queryClient);
      } catch (err) {
        if (err instanceof D365DisabledError) return { ok: false, error: 'disabled' };
        throw err;
      }

      const result = await retryDlqEntry(queryClient, makeD365PushClient(), dlqId, userId);
      if (result.ok) return { ok: true };
      return { ok: false, error: result.error };
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

/**
 * Mark a DLQ row resolved or skipped after an authorized, audited manual fix.
 * Local-only state transition — no D365 call. `resolution_note` records intent.
 */
async function transitionDlq(
  dlqId: string,
  nextStatus: 'resolved' | 'skipped',
  note: string,
): Promise<DlqActionResult> {
  if (!dlqId || !UUID_RE.test(dlqId)) return { ok: false, error: 'invalid' };
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;
      const allowed = await hasD365SyncPermission(queryClient, userId, orgId);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const current = await queryClient.query<{ status: string }>(
        `select status from public.d365_sync_dlq
          where org_id = app.current_org_id() and id = $1::uuid`,
        [dlqId],
      );
      const row = current.rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      if (row.status === 'resolved' || row.status === 'retried' || row.status === 'skipped') {
        return { ok: false, error: 'already_resolved' };
      }

      const updated = await queryClient.query(
        `update public.d365_sync_dlq
            set status = $2, resolved_at = pg_catalog.now(), resolved_by = $3, resolution_note = $4
          where org_id = app.current_org_id() and id = $1::uuid
            and status not in ('resolved', 'retried', 'skipped')`,
        [dlqId, nextStatus, userId, note],
      );
      // 0 rows updated means the row was concurrently resolved/skipped/retried
      // between our pre-check SELECT and this UPDATE (TOCTOU). Don't report a
      // resolution that never landed.
      if ((updated.rowCount ?? 0) === 0) {
        return { ok: false, error: 'already_resolved' };
      }
      return { ok: true };
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

export async function markDlqResolvedAction(dlqId: string): Promise<DlqActionResult> {
  return transitionDlq(dlqId, 'resolved', 'Marked resolved after manual D365 fix (DLQ Manager).');
}

export async function skipDlqEntryAction(dlqId: string): Promise<DlqActionResult> {
  return transitionDlq(dlqId, 'skipped', 'Skipped — entry intentionally dropped by operator (DLQ Manager).');
}
