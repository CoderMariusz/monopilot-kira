/**
 * T-027 — `listFaHistory(productCode)` — read-only FA mutation timeline.
 *
 * Returns a union of the two REAL, org-scoped event sources for a single FA,
 * ordered DESC by event time. NO mocks, NO hard-coded rows.
 *
 *   1. public.outbox_events  WHERE aggregate_type = 'fa' AND aggregate_id = $code
 *      — this is the canonical sink that EVERY FA mutation Server Action writes
 *        (fa.created / fa.dept_closed / fa.dept_reopened / fa.built /
 *         fa.built_reset / fa.allergens_changed / fa.edit / fa.deleted / …).
 *        See apps/web/app/(npd)/fa/actions/*.ts — each `writeOutbox` emits a
 *        fa.* event with aggregate_type='fa', aggregate_id=<productCode>.
 *   2. public.audit_events   WHERE resource_type IN ('fa','product')
 *                              AND resource_id = $code
 *      — the generic append-only audit log; folded in so any FA mutation that is
 *        recorded there (rather than in the outbox) still surfaces.
 *
 * Both reads are RLS-scoped to the caller's org via `app.current_org_id()` —
 * the query NEVER filters by org_id in app code (RLS does it) and NEVER returns
 * another FA's rows (aggregate_id / resource_id is pinned to `productCode`).
 *
 * The actor display name is resolved from public.users:
 *   - outbox: payload->>'actor_user_id'  (the writers stamp it into the payload)
 *   - audit:  actor_user_id column
 * A missing/unknown actor falls back to actor_type ('system') or null.
 *
 * Red lines (T-027 risk_red_lines):
 *   - read-only: this module only SELECTs, never mutates history.
 *   - does NOT bypass RLS (app_user connection + app.current_org_id()).
 *   - does NOT include other FAs (resource pinned to productCode).
 */

import pg from 'pg';

const { Pool } = pg;

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

export type ListFaHistoryOptions = {
  /** Optional injected RLS-scoped client (tests / Server Actions). */
  client?: QueryClient;
  /** Hard cap on returned rows (default 200). */
  limit?: number;
};

/** Canonical, source-agnostic event categories for icon + filter mapping. */
export type FaHistoryEventSource = 'outbox' | 'audit';

export type FaHistoryEvent = {
  /** Stable composite id (source + native id) for React keys. */
  id: string;
  source: FaHistoryEventSource;
  /** Raw event type, e.g. 'fa.created', 'fa.dept_closed'. */
  eventType: string;
  /** ISO-8601 timestamp of the event. */
  occurredAt: string;
  /** Resolved actor display name (or null when unknown / system). */
  actorName: string | null;
  /** Raw actor user id when present (uuid string) — null for system/unknown. */
  actorUserId: string | null;
  /**
   * Structured payload / diff for the event. For outbox rows this is the
   * `payload` jsonb; for audit rows it is `{ before, after }`. May be null.
   */
  payload: unknown;
};

type OutboxDbRow = {
  id: string;
  event_type: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  payload: unknown;
};

type AuditDbRow = {
  id: string;
  event_type: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_type: string | null;
  payload: unknown;
};

const DEFAULT_LIMIT = 200;

export async function listFaHistory(
  productCode: string,
  options: ListFaHistoryOptions = {},
): Promise<FaHistoryEvent[]> {
  const code = (productCode ?? '').trim();
  if (!code) {
    throw new Error('listFaHistory requires a non-empty productCode');
  }
  const limit = Number.isFinite(options.limit) && (options.limit as number) > 0
    ? Math.floor(options.limit as number)
    : DEFAULT_LIMIT;

  const ownedPool = options.client ? null : getAppConnection();
  const client = options.client ?? ownedPool;
  if (!client) throw new Error('listFaHistory requires a query client or app connection');

  try {
    // 1. Outbox events for this FA (the canonical FA mutation sink). RLS scopes
    //    to the org; aggregate_id pins to this productCode only.
    const outbox = await client.query<OutboxDbRow>(
      `select oe.id::text                                            as id,
              oe.event_type                                         as event_type,
              oe.created_at                                         as occurred_at,
              nullif(oe.payload ->> 'actor_user_id', '')            as actor_user_id,
              u.display_name                                        as actor_name,
              oe.payload                                            as payload
         from public.outbox_events oe
         left join public.users u
           on u.id = nullif(oe.payload ->> 'actor_user_id', '')::uuid
          and u.org_id = oe.org_id
        where oe.aggregate_type = 'fa'
          and oe.aggregate_id = $1
        order by oe.created_at desc, oe.id desc
        limit $2`,
      [code, limit],
    );

    // 2. Generic audit_events recorded against this FA (resource_type fa/product).
    const audit = await client.query<AuditDbRow>(
      `select ae.id::text                                           as id,
              ae.action                                             as event_type,
              ae.occurred_at                                        as occurred_at,
              ae.actor_user_id::text                                as actor_user_id,
              u.display_name                                        as actor_name,
              ae.actor_type                                         as actor_type,
              jsonb_build_object('before', ae.before_state, 'after', ae.after_state) as payload
         from public.audit_events ae
         left join public.users u
           on u.id = ae.actor_user_id
          and u.org_id = ae.org_id
        where ae.resource_type in ('fa', 'product')
          and ae.resource_id = $1
        order by ae.occurred_at desc, ae.id desc
        limit $2`,
      [code, limit],
    );

    const merged: FaHistoryEvent[] = [
      ...outbox.rows.map(fromOutboxRow),
      ...audit.rows.map(fromAuditRow),
    ];

    merged.sort((a, b) => {
      const ta = Date.parse(a.occurredAt);
      const tb = Date.parse(b.occurredAt);
      if (tb !== ta) return tb - ta;
      // Stable tiebreak: source then native id (DESC) so equal timestamps are deterministic.
      return b.id.localeCompare(a.id);
    });

    return merged.slice(0, limit);
  } finally {
    await ownedPool?.end();
  }
}

function fromOutboxRow(row: OutboxDbRow): FaHistoryEvent {
  return {
    id: `outbox:${row.id}`,
    source: 'outbox',
    eventType: row.event_type,
    occurredAt: toIso(row.occurred_at),
    actorName: row.actor_name ?? null,
    actorUserId: row.actor_user_id ?? null,
    payload: row.payload ?? null,
  };
}

function fromAuditRow(row: AuditDbRow): FaHistoryEvent {
  return {
    id: `audit:${row.id}`,
    source: 'audit',
    eventType: row.event_type,
    occurredAt: toIso(row.occurred_at),
    actorName: row.actor_name ?? (row.actor_type ? `(${row.actor_type})` : null),
    actorUserId: row.actor_user_id ?? null,
    payload: row.payload ?? null,
  };
}

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  // pg returns timestamptz as a string when not parsed by a type-parser; keep
  // it normalized to ISO when possible, else return as-is.
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function getAppConnection(): pg.Pool {
  const connectionString = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_APP or DATABASE_URL is required for listFaHistory');
  }

  const url = new URL(connectionString);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
  }

  return new Pool({ connectionString: url.toString() });
}
