'use server';

/**
 * T-059 — TEC-091 D365 Drift Resolution server actions.
 *
 * Decision D-1: D365 surfaces live under settings/integrations/d365/*.
 *
 * Drift events are the V-TEC-73 audit rows written by the D365 pull worker when
 * a local item is newer than the incoming D365 record (`audit_log.action =
 * 'd365_drift'`, `resource_type = 'item'`). The worker LOGS + SKIPS the
 * overwrite — local edits win by default. This screen lets an authorized
 * operator *resolve* the logged drift:
 *
 *   - resolve(direction='mp_wins'):  keep the MonoPilot value, mark the item
 *     `d365_sync_status='synced'`. No D365 mutation here (the export worker will
 *     push the MP value on its next tick — D365 is export-only per R15).
 *   - resolve(direction='d365_wins'): an explicit, authorized, audited overwrite
 *     of the Monopilot-owned item with the D365 value recorded in the drift's
 *     after_state. Never silent / never canonical-by-default.
 *   - reject: acknowledge the drift with no data change (status back to synced
 *     after manual reconciliation), recorded with a reason.
 *
 * Every resolution writes a NEW append-only `audit_log` row (action
 * 'd365_drift_resolved') with the actor, direction and reason — the original
 * drift row is immutable. RBAC `technical.d365.sync_trigger` is enforced FIRST.
 */

import { withOrgContext } from '../../../../../../../../../lib/auth/with-org-context';
import { hasD365SyncPermission } from '../../../../../../../../../lib/integrations/d365/rbac';

export type DriftDirection = 'mp_wins' | 'd365_wins';

export type DriftResolveResult =
  | { ok: true; warning?: string }
  | { ok: false; error: 'forbidden' | 'not_found' | 'invalid' | 'unavailable' };

export type BulkResolveResult =
  | { ok: true; resolved: number; blocked: number; warnings: number }
  | { ok: false; error: 'forbidden' | 'invalid' | 'unavailable' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_REASON = 10;

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type DriftRow = {
  id: string;
  occurred_at: string;
  resource_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
};

const IDENTITY_RENAME_BLOCKED =
  'Cannot rename a referenced FG; identity is local-owned';

type ResolveOneOutcome = { status: 'ok' | 'not_found'; warning?: string };

async function resolveOne(
  client: QueryClient,
  userId: string,
  orgId: string,
  driftId: string,
  occurredAt: string,
  resolution: 'accept' | 'reject',
  direction: DriftDirection,
  reason: string,
): Promise<ResolveOneOutcome> {
  // Drift PK is (id, occurred_at) on the partitioned audit_log — both are needed.
  const found = await client.query<DriftRow>(
    `select id, occurred_at, resource_id, before_state, after_state
       from public.audit_log
      where org_id = app.current_org_id()
        and id = $1::uuid
        and occurred_at = $2::timestamptz
        and action = 'd365_drift'
        and resource_type = 'item'`,
    [driftId, occurredAt],
  );
  const drift = found.rows[0];
  if (!drift) return { status: 'not_found' };

  let warning: string | undefined;

  if (resolution === 'accept' && direction === 'd365_wins') {
    // Authorized, audited overwrite of the Monopilot item with the D365 value.
    const after = drift.after_state ?? {};
    const proposedCode = typeof after.item_code === 'string' ? after.item_code : null;

    const current = await client.query<{ item_code: string }>(
      `select item_code
         from public.items
        where org_id = app.current_org_id() and id = $1::uuid`,
      [drift.resource_id],
    );
    const currentCode = current.rows[0]?.item_code ?? null;

    const wantsRename = proposedCode !== null && proposedCode !== currentCode;
    let allowRename = true;
    if (wantsRename) {
      const mutable = await client.query<{ mutable: boolean }>(
        `select public.items_is_item_code_mutable($1::uuid) as mutable`,
        [drift.resource_id],
      );
      allowRename = mutable.rows[0]?.mutable === true;
      if (!allowRename) {
        warning = IDENTITY_RENAME_BLOCKED;
      }
    }

    if (allowRename) {
      await client.query(
        `update public.items
            set item_code = coalesce($2, item_code),
                name = coalesce($3, name),
                item_type = coalesce($4, item_type),
                d365_sync_status = 'synced',
                d365_last_sync_at = pg_catalog.now()
          where org_id = app.current_org_id() and id = $1::uuid`,
        [drift.resource_id, after.item_code ?? null, after.name ?? null, after.item_type ?? null],
      );
    } else {
      // Identity blocked: sync only safe mirror fields (never item_code or item_type).
      await client.query(
        `update public.items
            set name = coalesce($2, name),
                d365_sync_status = 'synced',
                d365_last_sync_at = pg_catalog.now()
          where org_id = app.current_org_id() and id = $1::uuid`,
        [drift.resource_id, after.name ?? null],
      );
    }
  } else {
    // mp_wins (accept, keep local) or reject (no change): clear the drift flag.
    await client.query(
      `update public.items
          set d365_sync_status = 'synced'
        where org_id = app.current_org_id() and id = $1::uuid`,
      [drift.resource_id],
    );
  }

  const afterState: Record<string, unknown> = {
    resolution,
    direction: resolution === 'accept' ? direction : null,
    reason,
  };
  if (warning) {
    afterState.warning = warning;
    afterState.partial = { item_code_preserved: true, item_type_preserved: true };
  }

  // Append-only resolution audit row — original drift row stays immutable.
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, retention_class)
     values
       ($1::uuid, $2, 'user', 'd365_drift_resolved', 'item', $3,
        $4::jsonb, $5::jsonb, 'standard')`,
    [
      orgId,
      userId,
      drift.resource_id,
      JSON.stringify({ drift_id: drift.id, before_state: drift.before_state, after_state: drift.after_state }),
      JSON.stringify(afterState),
    ],
  );

  return warning ? { status: 'ok', warning } : { status: 'ok' };
}

/** Resolve a single drift event (per-row modal). */
export async function resolveDriftAction(input: {
  driftId: string;
  occurredAt: string;
  resolution: 'accept' | 'reject';
  direction: DriftDirection;
  reason: string;
}): Promise<DriftResolveResult> {
  if (!input?.driftId || !UUID_RE.test(input.driftId)) return { ok: false, error: 'invalid' };
  if (!input.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) return { ok: false, error: 'invalid' };
  if (typeof input.reason !== 'string' || input.reason.trim().length < MIN_REASON) return { ok: false, error: 'invalid' };
  if (input.resolution !== 'accept' && input.resolution !== 'reject') return { ok: false, error: 'invalid' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;
      const allowed = await hasD365SyncPermission(queryClient as never, userId, orgId);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const outcome = await resolveOne(
        queryClient, userId, orgId, input.driftId, input.occurredAt,
        input.resolution, input.direction, input.reason.trim(),
      );
      if (outcome.status === 'not_found') return { ok: false, error: 'not_found' };
      return outcome.warning ? { ok: true, warning: outcome.warning } : { ok: true };
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

/** Bulk accept/reject a selection of drift events with one shared reason. */
export async function bulkResolveDriftAction(input: {
  drifts: Array<{ driftId: string; occurredAt: string }>;
  resolution: 'accept' | 'reject';
  direction: DriftDirection;
  reason: string;
}): Promise<BulkResolveResult> {
  if (!Array.isArray(input?.drifts) || input.drifts.length === 0) return { ok: false, error: 'invalid' };
  if (typeof input.reason !== 'string' || input.reason.trim().length < MIN_REASON) return { ok: false, error: 'invalid' };
  if (input.resolution !== 'accept' && input.resolution !== 'reject') return { ok: false, error: 'invalid' };
  const invalid = input.drifts.some(
    (d) => !d?.driftId || !UUID_RE.test(d.driftId) || !d.occurredAt || Number.isNaN(Date.parse(d.occurredAt)),
  );
  if (invalid) return { ok: false, error: 'invalid' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;
      const allowed = await hasD365SyncPermission(queryClient as never, userId, orgId);
      if (!allowed) return { ok: false, error: 'forbidden' };

      let resolved = 0;
      let blocked = 0;
      let warnings = 0;
      for (const drift of input.drifts) {
        const outcome = await resolveOne(
          queryClient, userId, orgId, drift.driftId, drift.occurredAt,
          input.resolution, input.direction, input.reason.trim(),
        );
        if (outcome.status === 'ok') {
          resolved += 1;
          if (outcome.warning) {
            warnings += 1;
            blocked += 1;
          }
        }
      }
      return { ok: true, resolved, blocked, warnings };
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}
