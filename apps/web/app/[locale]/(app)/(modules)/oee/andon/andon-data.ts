import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { LineStatus, type LineLiveStatus } from './andon-types';

export const CURRENT_ORG_ID = 'current';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type LineLiveStatusRow = {
  id: string;
  line_code: string;
  line_name: string;
  line_status: string | null;
  wo_number: string | null;
  product_name: string | null;
  runtime_status: string | null;
  good_count: string | number | null;
  scrap_count: string | number | null;
  oee_percent: string | number | null;
  last_activity_at: string | Date | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LINE_LIVE_STATUS_SELECT = `
  select pl.id::text as id,
         pl.code as line_code,
         pl.name as line_name,
         pl.status as line_status,
         wo.wo_number,
         wo.product_name,
         wo.runtime_status,
         coalesce(wo.good_count, 0)::text as good_count,
         coalesce(wo.scrap_count, 0)::text as scrap_count,
         latest.oee_pct::text as oee_percent,
         activity.last_activity_at
    from public.production_lines pl
    left join lateral (
      select s.oee_pct,
             s.snapshot_minute
        from public.oee_snapshots s
       where s.org_id = app.current_org_id()
         and s.line_id = pl.id::text
       order by s.snapshot_minute desc, s.id desc
       limit 1
    ) latest on true
    left join lateral (
      select w.wo_number,
             i.name as product_name,
             coalesce(
               e.status,
               case w.status
                 when 'RELEASED' then 'planned'
                 when 'IN_PROGRESS' then 'in_progress'
                 when 'ON_HOLD' then 'paused'
               end
             ) as runtime_status,
             outputs.good_count,
             outputs.rejected_count + waste.waste_count as scrap_count,
             w.updated_at,
             e.updated_at as execution_updated_at,
             outputs.last_output_at,
             waste.last_waste_at
        from public.work_orders w
        left join public.wo_executions e
          on e.org_id = w.org_id and e.wo_id = w.id
        left join public.items i
          on i.org_id = w.org_id and i.id = w.product_id
        left join lateral (
          select coalesce(sum(o.qty_kg) filter (where o.qa_status <> 'FAILED'), 0) as good_count,
                 coalesce(sum(o.qty_kg) filter (where o.qa_status = 'FAILED'), 0) as rejected_count,
                 max(o.registered_at) as last_output_at
            from public.wo_outputs o
           where o.org_id = app.current_org_id()
             and o.wo_id = w.id
        ) outputs on true
        left join lateral (
          select coalesce(sum(wl.qty_kg), 0) as waste_count,
                 max(wl.recorded_at) as last_waste_at
            from public.wo_waste_log wl
           where wl.org_id = app.current_org_id()
             and wl.wo_id = w.id
        ) waste on true
       where w.org_id = app.current_org_id()
         and w.production_line_id = pl.id
         and w.status in ('RELEASED', 'IN_PROGRESS', 'ON_HOLD')
       order by case coalesce(
                    e.status,
                    case w.status
                      when 'RELEASED' then 'planned'
                      when 'IN_PROGRESS' then 'in_progress'
                      when 'ON_HOLD' then 'paused'
                    end
                  )
                  when 'in_progress' then 0
                  when 'paused' then 1
                  when 'planned' then 2
                  else 3
                end,
                w.scheduled_start_time desc nulls last,
                w.updated_at desc
       limit 1
    ) wo on true
    left join lateral (
      select max(v) as last_activity_at
        from (values
          (latest.snapshot_minute),
          (wo.updated_at),
          (wo.execution_updated_at),
          (wo.last_output_at),
          (wo.last_waste_at)
        ) as activity_values(v)
    ) activity on true
   where pl.org_id = app.current_org_id()
     and pl.org_id = $1::uuid`;

function assertOrgScope(requestedOrgId: string, currentOrgId: string): void {
  if (requestedOrgId !== CURRENT_ORG_ID && requestedOrgId !== currentOrgId) {
    throw new Error('andon_org_scope_mismatch');
  }
}

function numericValue(value: string | number | null): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function nullableNumericValue(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function deriveStatus(lineStatus: string | null, runtimeStatus: string | null): LineStatus {
  if (runtimeStatus === 'in_progress') return LineStatus.Running;
  if (runtimeStatus === 'paused') return LineStatus.Paused;

  switch ((lineStatus ?? '').toLowerCase()) {
    case 'inactive':
    case 'maintenance':
    case 'down':
      return LineStatus.Down;
    case 'setup':
      return LineStatus.Paused;
    default:
      return LineStatus.Idle;
  }
}

function mapLine(row: LineLiveStatusRow): LineLiveStatus {
  return {
    id: row.id,
    lineCode: row.line_code,
    lineName: row.line_name,
    status: deriveStatus(row.line_status, row.runtime_status),
    currentWONumber: row.wo_number,
    currentProductName: row.product_name,
    goodCount: numericValue(row.good_count),
    scrapCount: numericValue(row.scrap_count),
    oeePercent: nullableNumericValue(row.oee_percent),
    lastActivityAt: toIso(row.last_activity_at),
  };
}

async function readAllLinesLiveStatus(client: QueryClient, orgId: string): Promise<LineLiveStatus[]> {
  const { rows } = await client.query<LineLiveStatusRow>(
    `${LINE_LIVE_STATUS_SELECT}
   order by pl.code asc`,
    [orgId],
  );
  return rows.map(mapLine);
}

async function readLineLiveStatus(
  client: QueryClient,
  lineId: string,
  orgId: string,
): Promise<LineLiveStatus> {
  if (!UUID_RE.test(lineId)) {
    throw new Error('andon_line_not_found');
  }

  const { rows } = await client.query<LineLiveStatusRow>(
    `${LINE_LIVE_STATUS_SELECT}
     and pl.id = $2::uuid
   limit 1`,
    [orgId, lineId],
  );
  const row = rows[0];
  if (!row) throw new Error('andon_line_not_found');
  return mapLine(row);
}

export async function getLineLiveStatus(lineId: string, orgId: string): Promise<LineLiveStatus> {
  return withOrgContext(async ({ orgId: currentOrgId, client }) => {
    assertOrgScope(orgId, currentOrgId);
    return readLineLiveStatus(client as QueryClient, lineId, currentOrgId);
  });
}

export async function getAllLinesLiveStatus(orgId: string): Promise<LineLiveStatus[]> {
  return withOrgContext(async ({ orgId: currentOrgId, client }) => {
    assertOrgScope(orgId, currentOrgId);
    return readAllLinesLiveStatus(client as QueryClient, currentOrgId);
  });
}
