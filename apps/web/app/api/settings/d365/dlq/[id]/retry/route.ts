/**
 * T-029 — POST /api/settings/d365/dlq/[id]/retry
 *
 * Manual DLQ retry (TEC-073 DLQ Manager). Route namespace = SETTINGS per
 * decision D-1.
 *
 * Contract:
 *   - RBAC `technical.d365.sync_trigger` → 403 otherwise (AC4).
 *   - Gated by `assertD365Enabled` (412 when off / incomplete).
 *   - Re-submits the dead-lettered WO confirmation to D365. On success the DLQ
 *     row is marked resolved (`resolved_at` set, status='retried') and the job
 *     flips back to 'completed' (AC2).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { assertD365Enabled, D365DisabledError } from '../../../../../../../lib/integrations/d365/gate';
import { hasD365SyncPermission } from '../../../../../../../lib/integrations/d365/rbac';
import { retryDlqEntry } from '../../../../../../../lib/integrations/d365/push';
import { makeD365PushClient } from '../../../../../../../lib/integrations/d365/client';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  if (!id || !UUID_RE.test(id)) return json({ error: 'invalid_input' }, 400);

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      // RBAC FIRST (AC4): a caller without the permission must never trigger a push.
      const allowed = await hasD365SyncPermission(client, userId, orgId);
      if (!allowed) return json({ error: 'forbidden' }, 403);

      try {
        await assertD365Enabled(client);
      } catch (err) {
        if (err instanceof D365DisabledError) {
          return json({ error: 'precondition_failed', code: err.code, missing: err.missingConstants }, 412);
        }
        throw err;
      }

      const result = await retryDlqEntry(client, makeD365PushClient(), id, userId);
      if (!result.ok) {
        const status = result.error === 'not_found' ? 404 : result.error === 'already_resolved' ? 409 : 502;
        return json({ error: result.error }, status);
      }
      return json({ ok: true, resolved: true, jobId: result.jobId }, 200);
    });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}
