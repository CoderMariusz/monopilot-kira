/**
 * T-030 — GET /api/settings/d365/health
 *
 * D365 connection-test / health endpoint. Route namespace = SETTINGS per
 * decision D-1 (D365 connection config lives in 02-settings Integrations).
 *
 * Contract:
 *   - Gated by `assertD365Enabled` (V-TEC-70 flag off → 412; V-SET-42 constants
 *     incomplete → 412) AND `technical.d365.sync_trigger` RBAC (403 otherwise).
 *   - Returns a SANITIZED payload only: { connected, latency_ms, last_sync_at }.
 *     NEVER includes secrets (client secret, bearer, tenant/client id).
 *
 * The "connected" signal is derived from the most recent successful sync job for
 * the org; an actual live D365 probe is performed by the existing settings
 * `test-connection` action (which holds the encrypted credentials). This route
 * is the read-only health summary the dashboard polls.
 */

import { withOrgContext } from '../../../../../lib/auth/with-org-context';
import { assertD365Enabled, D365DisabledError } from '../../../../../lib/integrations/d365/gate';
import { hasD365SyncPermission } from '../../../../../lib/integrations/d365/rbac';

type HealthBody = {
  connected: boolean;
  latency_ms: number | null;
  last_sync_at: string | null;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET(): Promise<Response> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const allowed = await hasD365SyncPermission(client, userId, orgId);
      if (!allowed) return json({ error: 'forbidden' }, 403);

      try {
        await assertD365Enabled(client);
      } catch (err) {
        if (err instanceof D365DisabledError) {
          // V-TEC-70 / V-SET-42 → 412 Precondition Failed (no secrets leaked).
          return json(
            { error: 'precondition_failed', code: err.code, missing: err.missingConstants },
            412,
          );
        }
        throw err;
      }

      const summary = await client.query<{
        last_sync_at: string | null;
        last_status: string | null;
        latency_ms: number | null;
      }>(
        `select max(finished_at) filter (where status = 'completed') as last_sync_at,
                (array_agg(status order by coalesce(finished_at, scheduled_at) desc))[1] as last_status,
                (extract(epoch from (max(finished_at) - max(started_at))) * 1000)::int as latency_ms
           from public.d365_sync_jobs
          where org_id = app.current_org_id()`,
      );

      const row = summary.rows[0];
      const body: HealthBody = {
        connected: row?.last_status === 'completed',
        latency_ms: row?.latency_ms ?? null,
        last_sync_at: row?.last_sync_at ?? null,
      };
      return json(body, 200);
    });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}
