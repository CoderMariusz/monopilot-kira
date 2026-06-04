/**
 * T-110 — `listApprovalHistory(projectId)` — read-only gate-approval timeline.
 *
 * Returns the REAL, org-scoped gate approvals for a single NPD project, ordered
 * reverse-chronologically (newest first) so the producer side of
 * ApprovalHistoryTimeline can render entries as-given. NO mocks, NO hard-coded
 * rows.
 *
 *   public.gate_approvals  WHERE project_id = $projectId
 *     — the canonical sink that every gate approval / rejection Server Action
 *       writes (gate_code, decision, approver_user_id, notes, rejection_reason,
 *       esigned_at, esign_hash). See migration 085-npd-projects-and-gates.sql.
 *
 * The read is RLS-scoped to the caller's org via `app.current_org_id()` — the
 * query NEVER filters by org_id in app code (RLS does it) and NEVER returns
 * another project's rows (project_id is pinned to `projectId`).
 *
 * The approver display name is resolved from public.users and the role from the
 * approver's assigned role (public.user_roles → public.roles.name); a missing /
 * unknown approver or role falls back to null (the UI substitutes a label).
 *
 * Red lines (T-110 risk_red_lines):
 *   - read-only: this module only SELECTs, never mutates history.
 *   - does NOT bypass RLS (app_user connection + app.current_org_id()).
 *   - does NOT include other projects (project_id pinned).
 *   - never fabricates an e-signature: eSigned is derived strictly from a present
 *     esigned_at, and the hash is the real esign_hash column (null otherwise).
 */

import pg from 'pg';

const { Pool } = pg;

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

export type ListApprovalHistoryOptions = {
  /** Optional injected RLS-scoped client (tests / Server Actions). */
  client?: QueryClient;
  /** Hard cap on returned rows (default 200). */
  limit?: number;
};

export type ApprovalDecision = 'approved' | 'rejected';

export type ApprovalHistoryRecord = {
  /** gate_approvals.id — stable id for React keys. */
  id: string;
  /** Gate code, e.g. 'G1'. */
  gate: string;
  result: ApprovalDecision;
  /** Resolved approver display name (or null when unknown). */
  approver: string | null;
  /** Approver role / title (or null). */
  role: string | null;
  /** Approval notes; for rejections this prefers rejection_reason. */
  notes: string | null;
  /** ISO-8601 timestamp the approval was recorded. */
  date: string;
  eSigned: boolean;
  /** Full ISO timestamp the signature was applied (null when not e-signed). */
  eSignedAt: string | null;
  /** SHA-256 certificate hash (null when not e-signed). */
  eSignHash: string | null;
};

type DbRow = {
  id: string;
  gate_code: string;
  decision: string;
  approver_name: string | null;
  approver_role: string | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  esigned_at: string | null;
  esign_hash: string | null;
};

const DEFAULT_LIMIT = 200;

export async function listApprovalHistory(
  projectId: string,
  options: ListApprovalHistoryOptions = {},
): Promise<ApprovalHistoryRecord[]> {
  const id = (projectId ?? '').trim();
  if (!id) {
    throw new Error('listApprovalHistory requires a non-empty projectId');
  }
  const limit =
    Number.isFinite(options.limit) && (options.limit as number) > 0
      ? Math.floor(options.limit as number)
      : DEFAULT_LIMIT;

  const ownedPool = options.client ? null : getAppConnection();
  const client = options.client ?? ownedPool;
  if (!client) {
    throw new Error('listApprovalHistory requires a query client or app connection');
  }

  try {
    const result = await client.query<DbRow>(
      `select ga.id::text                       as id,
              ga.gate_code                      as gate_code,
              ga.decision                       as decision,
              u.display_name                    as approver_name,
              r.role_name                       as approver_role,
              ga.notes                          as notes,
              ga.rejection_reason               as rejection_reason,
              ga.created_at                     as created_at,
              ga.esigned_at                     as esigned_at,
              ga.esign_hash                     as esign_hash
         from public.gate_approvals ga
         left join public.users u
           on u.id = ga.approver_user_id
          and u.org_id = ga.org_id
         left join lateral (
                select ro.name as role_name
                  from public.user_roles ur
                  join public.roles ro
                    on ro.id = ur.role_id
                   and ro.org_id = ur.org_id
                 where ur.user_id = ga.approver_user_id
                   and ur.org_id = ga.org_id
                 order by ro.display_order asc nulls last, ro.name asc
                 limit 1
              ) r on true
        where ga.project_id = $1
        order by ga.created_at desc, ga.id desc
        limit $2`,
      [id, limit],
    );

    return result.rows.map(fromRow);
  } finally {
    await ownedPool?.end();
  }
}

function fromRow(row: DbRow): ApprovalHistoryRecord {
  const result: ApprovalDecision = row.decision === 'rejected' ? 'rejected' : 'approved';
  const eSigned = Boolean(row.esigned_at);
  return {
    id: row.id,
    gate: row.gate_code,
    result,
    approver: row.approver_name ?? null,
    role: row.approver_role ?? null,
    notes:
      result === 'rejected'
        ? row.rejection_reason ?? row.notes ?? null
        : row.notes ?? null,
    date: toIso(row.created_at),
    eSigned,
    eSignedAt: eSigned ? toIso(row.esigned_at as string) : null,
    eSignHash: eSigned ? row.esign_hash ?? null : null,
  };
}

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function getAppConnection(): pg.Pool {
  const connectionString = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL_APP or DATABASE_URL is required for listApprovalHistory');
  }

  const url = new URL(connectionString);
  if (!process.env.DATABASE_URL_APP) {
    url.username = 'app_user';
    url.password = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
  }

  return new Pool({ connectionString: url.toString() });
}
