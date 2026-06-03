import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

const AUDIT_READ_PERMISSION = 'settings.audit.read';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number }>;
};

type ExportRow = {
  id: string;
  component: string;
  current_version: string;
  target_version: string;
  status: string;
  canary_pct: string | number | null;
  last_run_at: string | Date | null;
  created_at: string | Date | null;
  scheduled_by_name: string | null;
  scheduled_by_email: string | null;
};

type DateRange = 'all' | 'last_7_days' | 'last_30_days' | 'last_90_days';

const DATE_RANGE_DAYS: Record<DateRange, number | null> = {
  all: null,
  last_7_days: 7,
  last_30_days: 30,
  last_90_days: 90,
};

const STATUS_VALUES = new Set(['canary', 'completed', 'rolled_back', 'scheduled', 'progressive', 'force_scheduled']);

// CWE-1236: defuse spreadsheet formula injection.
const FORMULA_INJECTION_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCsvCell(value: string): string {
  const sanitized = FORMULA_INJECTION_TRIGGERS.includes(value.charAt(0)) ? `'${value}` : value;
  if (!/[",\r\n]/.test(sanitized)) return sanitized;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function toIso(value: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function migrationType(component: string): string {
  return component === 'schema' ? 'schema_upgrade' : component === 'rule_engine' ? 'rules_migration' : 'settings_rollout';
}

async function hasAuditReadPermission(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows, rowCount } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, AUDIT_READ_PERMISSION],
  );
  return (rowCount ?? rows.length) > 0;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') ?? 'all';
  const status = statusParam !== 'all' && STATUS_VALUES.has(statusParam) ? statusParam : 'all';
  const dateRangeParam = (url.searchParams.get('date_range') ?? 'all') as DateRange;
  const dateRange: DateRange = dateRangeParam in DATE_RANGE_DAYS ? dateRangeParam : 'all';

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      if (!(await hasAuditReadPermission(queryClient, userId, orgId))) {
        return new Response('forbidden', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
      }

      const days = DATE_RANGE_DAYS[dateRange];
      const conditions: string[] = ['tm.org_id = app.current_org_id()'];
      const params: unknown[] = [];
      if (status !== 'all') {
        params.push(status);
        conditions.push(`tm.status = $${params.length}`);
      }
      if (days != null) {
        params.push(days);
        conditions.push(`coalesce(tm.last_run_at, tm.created_at) >= now() - ($${params.length}::int * interval '1 day')`);
      }

      const { rows } = await queryClient.query<ExportRow>(
        `select tm.id::text,
                tm.component,
                tm.current_version,
                tm.target_version,
                tm.status,
                tm.canary_pct,
                tm.last_run_at,
                tm.created_at,
                nullif(trim(coalesce(u.name, u.email, '')), '') as scheduled_by_name,
                u.email as scheduled_by_email
           from public.tenant_migrations tm
           left join public.users u on u.id = tm.scheduled_by and u.org_id = app.current_org_id()
          where ${conditions.join(' and ')}
          order by coalesce(tm.last_run_at, tm.created_at) desc nulls last, tm.id desc
          limit 1000`,
        params,
      );

      const headers = ['migration_id', 'started_at', 'status', 'type', 'current_version', 'target_version', 'canary_pct', 'initiated_by_user'];
      const lines = [headers.join(',')];
      for (const row of rows) {
        const record = [
          row.id,
          toIso(row.last_run_at ?? row.created_at),
          row.status,
          migrationType(row.component),
          row.current_version ?? '',
          row.target_version ?? '',
          row.canary_pct == null ? '' : String(row.canary_pct),
          row.scheduled_by_name ?? row.scheduled_by_email ?? 'System migration runner',
        ];
        lines.push(record.map((cell) => escapeCsvCell(String(cell))).join(','));
      }

      return new Response(lines.join('\n'), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="tenant-migrations.csv"',
          'cache-control': 'no-store',
        },
      });
    });
  } catch {
    return new Response('export_failed', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
}
