'use server';

/**
 * T-045 — UI: TEC-089 BOM Change History timeline — read Server Action.
 *
 * Reads the immutable audit_log entries for one FG's BOM versions and the
 * version/approval history from bom_headers, org-scoped under withOrgContext +
 * RLS (`app.current_org_id()`). This is the READ side only — the audit_log
 * WRITER side (writeAudit in shared.ts) is out of scope here; we never insert.
 *
 * Mapping: audit_log rows with resource_type='bom' and resource_id IN (the FG's
 * bom_header ids) are the BOM change events (created / approve / publish). Each
 * row carries actor_user_id (→ display name), action, occurred_at, and the
 * before/after jsonb from which we render a delta summary. RLS guarantees we only
 * ever see this org's rows (red-line: never query audit_log without org RLS).
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import type { QueryClient } from './shared';

export type BomHistoryEntry = {
  id: string;
  occurredAt: string;
  /** Normalised tag for badge colour: bom / approval / release / other. */
  tag: 'created' | 'approve' | 'release' | 'other';
  action: string;
  actorUserId: string | null;
  actorName: string | null;
  /** The bom_headers.version the event targeted, when resolvable from after_state. */
  version: number | null;
  /** Rendered delta summary (status change, etc.) or null. */
  deltaSummary: string | null;
};

export type GetBomHistoryResult =
  | { ok: true; data: { entries: BomHistoryEntry[]; actors: { id: string; name: string }[] } }
  | { ok: false; error: 'not_found' | 'load_failed' };

type AuditSqlRow = {
  id: string;
  occurred_at: string | Date;
  action: string;
  actor_user_id: string | null;
  actor_name: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
};

function tagFor(action: string): BomHistoryEntry['tag'] {
  if (action.endsWith('created')) return 'created';
  if (action.endsWith('approve')) return 'approve';
  if (action.endsWith('publish') || action.endsWith('released')) return 'release';
  return 'other';
}

function versionOf(after: Record<string, unknown> | null): number | null {
  const v = after?.['version'];
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : null;
}

function deltaOf(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string | null {
  const fromStatus = before?.['status'];
  const toStatus = after?.['status'];
  if (typeof toStatus === 'string' && typeof fromStatus === 'string' && fromStatus !== toStatus) {
    return `${fromStatus} → ${toStatus}`;
  }
  if (typeof toStatus === 'string') return String(toStatus);
  return null;
}

/**
 * Loads the BOM change-history timeline for one FG (by item_code). Returns
 * `not_found` when the FG has no BOM versions in this org (route → 404).
 */
export async function getBomHistory(productId: string): Promise<GetBomHistoryResult> {
  try {
    return await withOrgContext(async ({ client }): Promise<GetBomHistoryResult> => {
      const c = client as QueryClient;

      // 1) Resolve this FG's bom_header ids (org-scoped). No versions → 404.
      const headersRes = await c.query<{ id: string }>(
        `select id
           from public.bom_headers
          where org_id = app.current_org_id()
            and item_id = (
              select id
                from public.items
               where org_id = app.current_org_id()
                 and item_code = $1
            )`,
        [productId],
      );
      if (headersRes.rows.length === 0) return { ok: false, error: 'not_found' };
      const headerIds = headersRes.rows.map((r) => String(r.id));

      // 2) audit_log entries for those headers, newest first, with actor name.
      const auditRes = await c.query<AuditSqlRow>(
        `select a.id, a.occurred_at, a.action, a.actor_user_id,
                u.display_name as actor_name,
                a.before_state, a.after_state
           from public.audit_log a
           left join public.users u on u.id = a.actor_user_id
          where a.org_id = app.current_org_id()
            and a.resource_type = 'bom'
            and a.resource_id = any($1::text[])
          order by a.occurred_at desc
          limit 200`,
        [headerIds],
      );

      const entries: BomHistoryEntry[] = auditRes.rows.map((r) => ({
        id: String(r.id),
        occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
        tag: tagFor(r.action),
        action: r.action,
        actorUserId: r.actor_user_id,
        actorName: r.actor_name,
        version: versionOf(r.after_state),
        deltaSummary: deltaOf(r.before_state, r.after_state),
      }));

      // Distinct actor set (for the filter Select), name-sorted.
      const actorMap = new Map<string, string>();
      for (const e of entries) {
        if (e.actorUserId && !actorMap.has(e.actorUserId)) {
          actorMap.set(e.actorUserId, e.actorName ?? e.actorUserId);
        }
      }
      const actors = Array.from(actorMap.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return { ok: true, data: { entries, actors } };
    });
  } catch (err) {
    console.error('[technical/bom] getBomHistory load_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'load_failed' };
  }
}
