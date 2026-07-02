/**
 * ROADMAP 2.5 — merge org-scoped audit_log + audit_events (+ optional status-history
 * ledger) into one chronological document timeline.
 *
 * Read-only; RLS via the caller's withOrgContext client (app.current_org_id()).
 */

import {
  DEFAULT_TIMELINE_PAGE_SIZE,
  ENTITY_AUDIT_CONFIG,
  type DocumentAuditEntityType,
  type DocumentAuditTimelineResult,
  type DocumentAuditTimelineRow,
  type GetDocumentAuditTimelineOptions,
} from './document-audit-timeline.types';

type AuditEventsDbRow = {
  id: string;
  action: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_type: string | null;
  before_state: unknown;
  after_state: unknown;
};

type AuditLogDbRow = {
  id: string;
  action: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_type: string | null;
  before_state: unknown;
  after_state: unknown;
};

type StatusHistoryDbRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  details: unknown;
};

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function hasDetails(before: unknown, after: unknown, extra?: unknown): boolean {
  const values = [before, after, extra];
  return values.some((v) => v !== null && v !== undefined);
}

function buildResourceMatchSql(
  entityId: string,
  resourceTypes: readonly string[],
  grnItemScope: boolean,
): { sql: string; params: unknown[] } {
  const typeParams = resourceTypes.map((_, i) => `$${i + 2}`).join(', ');
  const params: unknown[] = [entityId, ...resourceTypes];

  if (!grnItemScope) {
    return {
      sql: `resource_type in (${typeParams}) and resource_id = $1`,
      params,
    };
  }

  const grnIdParam = `$${params.length + 1}`;
  params.push(entityId);
  return {
    sql: `(
      resource_type in (${typeParams})
      and (
        resource_id = $1
        or (
          resource_type = 'grn_item'
          and resource_id in (
            select gi.id::text
              from public.grn_items gi
             where gi.org_id = app.current_org_id()
               and gi.grn_id = ${grnIdParam}::uuid
          )
        )
      )
    )`,
    params,
  };
}

async function fetchAuditEvents(
  options: GetDocumentAuditTimelineOptions,
  entityType: DocumentAuditEntityType,
  entityId: string,
  fetchLimit: number,
): Promise<DocumentAuditTimelineRow[]> {
  const config = ENTITY_AUDIT_CONFIG[entityType];
  const match = buildResourceMatchSql(entityId, config.resourceTypes, Boolean(config.grnItemScope));

  const { rows } = await options.client.query<AuditEventsDbRow>(
    `select ae.id::text as id,
            ae.action,
            ae.occurred_at,
            ae.actor_user_id::text as actor_user_id,
            u.display_name as actor_name,
            ae.actor_type,
            ae.before_state,
            ae.after_state
       from public.audit_events ae
       left join public.users u
         on u.id = ae.actor_user_id
        and u.org_id = ae.org_id
      where ae.org_id = app.current_org_id()
        and ${match.sql}
      order by ae.occurred_at desc, ae.id desc
      limit $${match.params.length + 1}`,
    [...match.params, fetchLimit],
  );

  return rows.map((row) => ({
    id: `audit_events:${row.id}`,
    source: 'audit_events' as const,
    occurredAt: toIso(row.occurred_at),
    actorName: row.actor_name ?? (row.actor_type ? `(${row.actor_type})` : null),
    actorUserId: row.actor_user_id,
    action: row.action,
    details: hasDetails(row.before_state, row.after_state)
      ? { before: row.before_state ?? null, after: row.after_state ?? null }
      : null,
  }));
}

async function fetchAuditLog(
  options: GetDocumentAuditTimelineOptions,
  entityType: DocumentAuditEntityType,
  entityId: string,
  fetchLimit: number,
): Promise<DocumentAuditTimelineRow[]> {
  const config = ENTITY_AUDIT_CONFIG[entityType];
  const match = buildResourceMatchSql(entityId, config.resourceTypes, Boolean(config.grnItemScope));

  const { rows } = await options.client.query<AuditLogDbRow>(
    `select al.id::text as id,
            al.action,
            al.occurred_at,
            al.actor_user_id::text as actor_user_id,
            u.display_name as actor_name,
            al.actor_type,
            al.before_state,
            al.after_state
       from public.audit_log al
       left join public.users u
         on u.id = al.actor_user_id
        and u.org_id = al.org_id
      where al.org_id = app.current_org_id()
        and ${match.sql}
      order by al.occurred_at desc, al.id desc
      limit $${match.params.length + 1}`,
    [...match.params, fetchLimit],
  );

  return rows.map((row) => ({
    id: `audit_log:${row.id}`,
    source: 'audit_log' as const,
    occurredAt: toIso(row.occurred_at),
    actorName: row.actor_name ?? (row.actor_type ? `(${row.actor_type})` : null),
    actorUserId: row.actor_user_id,
    action: row.action,
    details: hasDetails(row.before_state, row.after_state)
      ? { before: row.before_state ?? null, after: row.after_state ?? null }
      : null,
  }));
}

async function fetchStatusHistory(
  options: GetDocumentAuditTimelineOptions,
  entityType: DocumentAuditEntityType,
  entityId: string,
  fetchLimit: number,
): Promise<DocumentAuditTimelineRow[]> {
  const mode = ENTITY_AUDIT_CONFIG[entityType].statusHistory;
  if (!mode) return [];

  const whereClause =
    mode === 'lp'
      ? `h.org_id = app.current_org_id() and h.lp_id = $1::uuid`
      : `h.org_id = app.current_org_id() and h.grn_id = $1::uuid`;

  const { rows } = await options.client.query<StatusHistoryDbRow>(
    `select h.id::text as id,
            h.transitioned_at as occurred_at,
            h.created_by::text as actor_user_id,
            u.display_name as actor_name,
            'lp_state.transition' as action,
            h.from_state as from_status,
            h.to_state as to_status,
            coalesce(h.reason_text, h.reason_code) as reason,
            jsonb_build_object(
              'from', h.from_state,
              'to', h.to_state,
              'reason_code', h.reason_code,
              'reason_text', h.reason_text,
              'ext', h.ext_jsonb
            ) as details
       from public.lp_state_history h
       left join public.users u
         on u.id = h.created_by
        and u.org_id = h.org_id
      where ${whereClause}
      order by h.transitioned_at desc, h.id desc
      limit $2`,
    [entityId, fetchLimit],
  );

  return rows.map((row) => ({
    id: `status_history:${row.id}`,
    source: 'status_history' as const,
    occurredAt: toIso(row.occurred_at),
    actorName: row.actor_name,
    actorUserId: row.actor_user_id,
    action: row.action,
    details: row.details ?? {
      from: row.from_status,
      to: row.to_status,
      reason: row.reason,
    },
  }));
}

function sortRowsDesc(rows: DocumentAuditTimelineRow[]): DocumentAuditTimelineRow[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.occurredAt);
    const tb = Date.parse(b.occurredAt);
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

export async function getDocumentAuditTimeline(
  entityType: DocumentAuditEntityType,
  entityId: string,
  options: GetDocumentAuditTimelineOptions,
): Promise<DocumentAuditTimelineResult> {
  const id = (entityId ?? '').trim();
  if (!id) {
    throw new Error('getDocumentAuditTimeline requires a non-empty entityId');
  }
  if (!(entityType in ENTITY_AUDIT_CONFIG)) {
    throw new Error(`Unsupported document audit entity type: ${entityType}`);
  }

  const limit = Number.isFinite(options.limit) && (options.limit as number) > 0
    ? Math.floor(options.limit as number)
    : DEFAULT_TIMELINE_PAGE_SIZE;
  const offset = Number.isFinite(options.offset) && (options.offset as number) > 0
    ? Math.floor(options.offset as number)
    : 0;

  // Over-fetch so merge + slice still returns a full page after dedupe/sort.
  const fetchLimit = limit + offset + DEFAULT_TIMELINE_PAGE_SIZE;

  const [auditEvents, auditLog, statusHistory] = await Promise.all([
    fetchAuditEvents(options, entityType, id, fetchLimit),
    fetchAuditLog(options, entityType, id, fetchLimit),
    fetchStatusHistory(options, entityType, id, fetchLimit),
  ]);

  const merged = sortRowsDesc([...auditEvents, ...auditLog, ...statusHistory]);
  const page = merged.slice(offset, offset + limit);

  return {
    rows: page,
    total: merged.length,
    hasMore: merged.length > offset + limit,
  };
}
