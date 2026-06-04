/**
 * T-028 — POST /api/settings/d365/sync  (on-demand "Sync from D365 now")
 *
 * Manual pull trigger (TEC-071). Route namespace = SETTINGS per decision D-1.
 *
 * Contract:
 *   - RBAC `technical.d365.sync_trigger` → 403 otherwise.
 *   - `assertD365Enabled` gate: flag off / constants incomplete → 412
 *     Precondition Failed (V-TEC-70 / V-SET-42, AC1).
 *   - Enqueues a pull job (idempotent) and processes it against the live D365
 *     client. D365 is OPTIONAL + import-only; local Monopilot rows are canonical
 *     and never silently overwritten (drift → log + skip, V-TEC-73).
 *
 * Body (optional): { entity?: 'items' | 'bom' | 'formula' }.
 */

import { withOrgContext } from '../../../../../lib/auth/with-org-context';
import { assertD365Enabled, D365DisabledError } from '../../../../../lib/integrations/d365/gate';
import { hasD365SyncPermission } from '../../../../../lib/integrations/d365/rbac';
import { enqueuePullJob, processPullJob } from '../../../../../lib/integrations/d365/pull';
import { makeD365PullClient } from '../../../../../lib/integrations/d365/client';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type SyncEntity = 'items' | 'bom' | 'formula';

async function readEntity(req: Request): Promise<SyncEntity> {
  try {
    const body = (await req.json()) as { entity?: unknown };
    if (body?.entity === 'bom' || body?.entity === 'formula') return body.entity;
  } catch {
    /* empty/invalid body → default to items */
  }
  return 'items';
}

export async function POST(req: Request): Promise<Response> {
  const entity = await readEntity(req);

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const allowed = await hasD365SyncPermission(client, userId, orgId);
      if (!allowed) return json({ error: 'forbidden' }, 403);

      // AC1 / V-TEC-70: reject when the integration is not fully enabled.
      try {
        await assertD365Enabled(client);
      } catch (err) {
        if (err instanceof D365DisabledError) {
          return json({ error: 'precondition_failed', code: err.code, missing: err.missingConstants }, 412);
        }
        throw err;
      }

      const recordKey = `manual-${new Date().toISOString().slice(0, 10)}-${entity}`;
      const enq = await enqueuePullJob(client, orgId, {
        targetEntity: entity,
        recordKey,
        createdBy: userId,
      });
      if (!enq.ok) return json({ error: 'persistence_failed' }, 500);

      // Compute the incremental cursor: the org's last successful pull.
      const cursor = await client.query<{ since: string | null }>(
        `select max(d365_last_sync_at) as since
           from public.items where org_id = app.current_org_id()`,
      );

      const result = await processPullJob(
        client,
        makeD365PullClient(),
        { id: enq.job.id, org_id: orgId, target_entity: entity },
        { sinceIso: cursor.rows[0]?.since ?? null, actorUserId: userId },
      );

      return json(
        {
          ok: true,
          jobId: result.jobId,
          status: result.status,
          recordsProcessed: result.recordsProcessed,
          recordsFailed: result.recordsFailed,
          drifted: result.drifted,
          duplicate: enq.duplicate,
        },
        200,
      );
    });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}
