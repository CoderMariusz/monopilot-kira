/**
 * T-079 / SET-013 — Real-data loader for the audit log viewer.
 *
 * Replaces the page's `DEFAULT_CALLER_ACCESS` (permissions: []) +
 * `defaultPartitionAwareAuditQuery` (empty fallback) stubs that previously made
 * every production request fail closed (403) or render empty.
 *
 * - `loadAuditCallerAccess` enters `withOrgContext` (RLS via app.current_org_id())
 *   and resolves the caller's real permission set + org name so the
 *   `settings.audit.read` gate is satisfied for genuinely authorized callers.
 * - `queryPartitionAwareAuditLog` runs the live partition-aware query against
 *   `public.audit_log` (monthly partitioned — migration 043) with the date range
 *   first (to bound the partition scan), the user / action / resource_type /
 *   search filters, and 50-per-page pagination. It returns the real list of
 *   scanned partitions + EXPLAIN text so the partition-scan notice is honest.
 *
 * No mocks, no hard-coded rows — all data comes from Supabase via the RLS-scoped
 * app-role connection inside `withOrgContext`.
 */

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import type {
  AuditAction,
  AuditChange,
  AuditLogEntry,
  AuditQueryInput,
  AuditQueryResult,
} from './page.client';

export type CallerAccess = {
  orgId: string;
  requestedOrgId: string;
  orgName: string;
  permissions: string[];
  roleCodes: string[];
};

export const SETTINGS_AUDIT_READ_PERMISSION = 'settings.audit.read';
export const SETTINGS_IMPERSONATE_TENANT_PERMISSION = 'impersonate.tenant';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
};

type PermissionRow = { permission: string | null };
type RoleCodeRow = { code: string | null };
type OrgRow = { name: string | null };

const KNOWN_AUDIT_ACTIONS: ReadonlySet<string> = new Set<AuditAction>([
  'insert',
  'update',
  'delete',
  'schema_migrate',
  'rule_deploy',
  'tenant_variation_apply',
]);

/**
 * Resolve the caller's effective permission strings + role codes + org name
 * from RLS-scoped tables. This is the populated `callerAccess` the page needs —
 * the previous `DEFAULT_CALLER_ACCESS` had `permissions: []` and therefore
 * tripped the `settings.audit.read` gate on every real request.
 */
export async function loadAuditCallerAccess(
  requestedOrgId?: string,
): Promise<CallerAccess | null> {
  try {
    return await withOrgContext(async ({ client, userId, orgId }) => {
      const [permissions, roleCodes, orgName] = await Promise.all([
        loadEffectivePermissions(client, userId, orgId),
        loadRoleCodes(client, userId, orgId),
        loadOrgName(client),
      ]);

      return {
        orgId,
        // Production callers are always scoped to their own org by withOrgContext;
        // a requestedOrgId override only matters for the (cross-tenant) impersonation
        // path, which is not reachable from the standard route.
        requestedOrgId: requestedOrgId ?? orgId,
        orgName,
        permissions,
        roleCodes,
      } satisfies CallerAccess;
    });
  } catch {
    return null;
  }
}

async function loadEffectivePermissions(
  client: QueryClient,
  userId: string,
  orgId: string,
): Promise<string[]> {
  // Union of explicit role_permissions rows and the role's embedded permissions
  // jsonb array — mirrors the resolution used by loadSettingsUsersPageProps.
  const { rows } = await client.query<PermissionRow>(
    `select distinct perm as permission
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join lateral (
         select rp.permission as perm
           from public.role_permissions rp
          where rp.role_id = r.id
         union
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as perm
       ) perms on true
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and perm is not null`,
    [userId, orgId],
  );
  return rows.map((row) => row.permission).filter((value): value is string => Boolean(value));
}

async function loadRoleCodes(client: QueryClient, userId: string, orgId: string): Promise<string[]> {
  const { rows } = await client.query<RoleCodeRow>(
    `select coalesce(r.code, r.slug) as code
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid`,
    [userId, orgId],
  );
  return rows.map((row) => row.code).filter((value): value is string => Boolean(value));
}

async function loadOrgName(client: QueryClient): Promise<string> {
  const { rows } = await client.query<OrgRow>(
    `select name from public.organizations where id = app.current_org_id() limit 1`,
  );
  return rows[0]?.name ?? 'Your organization';
}

/**
 * Partition-aware paginated query against `public.audit_log`.
 *
 * Date range is applied first (occurred_at BETWEEN) so the planner can prune to
 * the 1-2 monthly partitions the range touches. EXPLAIN is run on the same
 * connection so the page can surface the genuine scanned-partition evidence and
 * the partition-scan notice stays honest.
 */
export async function queryPartitionAwareAuditLog(
  input: AuditQueryInput,
): Promise<AuditQueryResult> {
  return withOrgContext(async ({ client }) => runAuditQuery(client, input));
}

type AuditRow = {
  id: string;
  occurred_at: string | Date;
  actor_name: string | null;
  actor_email: string | null;
  actor_type: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  before_state: unknown;
  after_state: unknown;
  request_id: string | null;
};

type ExplainRow = { 'QUERY PLAN': string };

const FROM_TS = (from: string) => `${from} 00:00:00+00`;
const TO_TS = (to: string) => `${to} 23:59:59.999+00`;

async function runAuditQuery(client: QueryClient, input: AuditQueryInput): Promise<AuditQueryResult> {
  const fromTs = FROM_TS(input.from);
  const toTs = TO_TS(input.to);
  const limit = Math.max(1, input.pageSize);
  const offset = Math.max(0, (Math.max(1, input.page) - 1) * limit);

  // Optional filters — all parameterized; passing nulls means "no filter".
  const userFilter = input.user && input.user !== 'all' ? input.user : null;
  const actionFilter =
    input.action && input.action !== 'all' && KNOWN_AUDIT_ACTIONS.has(input.action) ? input.action : null;
  const tableFilter = input.tableContains?.trim() ? `%${input.tableContains.trim()}%` : null;
  const search = input.search?.trim() ? `%${input.search.trim()}%` : null;

  // Shared predicate. occurred_at range FIRST → partition pruning.
  const where = `
      al.occurred_at >= $1::timestamptz
      and al.occurred_at <= $2::timestamptz
      and ($3::text is null or coalesce(u.name, u.email::text, al.actor_user_id::text) = $3)
      and ($4::text is null or al.action = $4)
      and ($5::text is null or al.resource_type ilike $5)
      and (
        $6::text is null
        or al.resource_type ilike $6
        or al.resource_id ilike $6
        or coalesce(u.name, '') ilike $6
        or coalesce(u.email::text, '') ilike $6
        or coalesce(al.before_state::text, '') ilike $6
        or coalesce(al.after_state::text, '') ilike $6
      )`;

  const baseParams = [fromTs, toTs, userFilter, actionFilter, tableFilter, search] as const;

  const { rows: countRows } = await client.query<{ total: string | number }>(
    `select count(*)::bigint as total
       from public.audit_log al
       left join public.users u on u.id = al.actor_user_id
      where ${where}`,
    [...baseParams],
  );
  const totalCount = Number(countRows[0]?.total ?? 0);

  const { rows } = await client.query<AuditRow>(
    `select
        al.id::text as id,
        al.occurred_at,
        u.name as actor_name,
        u.email::text as actor_email,
        al.actor_type,
        al.action,
        al.resource_type,
        al.resource_id,
        al.before_state,
        al.after_state,
        al.request_id::text as request_id
       from public.audit_log al
       left join public.users u on u.id = al.actor_user_id
      where ${where}
      order by al.occurred_at desc
      limit $7 offset $8`,
    [...baseParams, limit, offset],
  );

  // Genuine partition-scan evidence via EXPLAIN on the same predicate.
  const { partitions, explainText } = await explainScannedPartitions(client, where, [...baseParams]);

  const entries = rows.map(mapAuditRow);

  return {
    entries,
    totalCount,
    scannedPartitions: partitions,
    explainText,
  };
}

async function explainScannedPartitions(
  client: QueryClient,
  where: string,
  params: readonly unknown[],
): Promise<{ partitions: string[]; explainText: string }> {
  try {
    const { rows } = await client.query<ExplainRow>(
      `explain (format text)
       select al.id
         from public.audit_log al
         left join public.users u on u.id = al.actor_user_id
        where ${where}
        order by al.occurred_at desc
        limit 50`,
      [...params],
    );
    const explainText = rows.map((row) => row['QUERY PLAN']).join('\n');
    const partitions = Array.from(
      new Set((explainText.match(/audit_log_\d{4}_\d{2}/g) ?? []) as string[]),
    ).sort();
    return { partitions, explainText };
  } catch {
    // EXPLAIN should never break the page; degrade to an honest empty evidence set.
    return { partitions: [], explainText: '' };
  }
}

function mapAuditRow(row: AuditRow): AuditLogEntry {
  const userName = row.actor_name ?? row.actor_email ?? (row.actor_type === 'system' ? 'System' : 'Unknown');
  return {
    id: row.id,
    occurredAt: formatTimestamp(row.occurred_at),
    userName,
    userEmail: row.actor_email ?? undefined,
    action: normalizeAction(row.action),
    tableName: row.resource_type,
    recordId: row.resource_id,
    changes: diffStates(row.before_state, row.after_state),
    ipAddress: null,
    impersonating: row.actor_type === 'impersonation',
  } satisfies AuditLogEntry;
}

function normalizeAction(action: string): AuditAction {
  return KNOWN_AUDIT_ACTIONS.has(action) ? (action as AuditAction) : 'update';
}

function formatTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Compute field-level changes from before/after JSONB so the expandable diff
 * panel shows the real old/new values for each touched field.
 */
function diffStates(before: unknown, after: unknown): AuditChange[] {
  const beforeObj = asRecord(before);
  const afterObj = asRecord(after);
  const fields = new Set<string>([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const b = beforeObj[field];
    const a = afterObj[field];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    changes.push({ field, before: b ?? null, after: a ?? null });
  }
  return changes.sort((x, y) => x.field.localeCompare(y.field));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
