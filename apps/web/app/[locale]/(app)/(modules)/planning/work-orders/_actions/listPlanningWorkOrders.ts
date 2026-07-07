'use server';

import { getActiveSiteId } from '../../../../../../../lib/site/site-context';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  DEFAULT_WO_LIST_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../../lib/shared/pagination';
import {
  mapExecution,
  mapSchedule,
  mapWoHeader,
  type ListPlanningWorkOrdersResult,
  type WOSummaryRow,
} from './shared';

const WO_LIST_WHERE = `
         where wo.org_id = app.current_org_id()
           and ($5::uuid is null or wo.site_id = $5::uuid)
           and ($1::text is null or wo.status = $1)
           and (
             $2::text is null
             or wo.wo_number ilike '%' || $2 || '%'
             or coalesce(i.item_code, wo.source_reference, '') ilike '%' || $2 || '%'
           )
           and coalesce(
             (
               wo.status in ('CLOSED', 'CANCELLED')
               and ods.archive_after_days is not null
               and wo.updated_at < now() - make_interval(days => ods.archive_after_days)
             ),
             false
           ) = $4::boolean`;

export async function listPlanningWorkOrders(params: {
  status?: string;
  search?: string;
  page?: number;
  offset?: number;
  limit?: number;
  archived?: boolean;
}): Promise<ListPlanningWorkOrdersResult> {
  const status = params.status?.trim();
  const search = params.search?.trim();
  const archived = params.archived === true;
  const page = normalizePage({
    page: params.page,
    offset: params.offset,
    limit: params.limit,
    defaultLimit: DEFAULT_WO_LIST_PAGE_SIZE,
    maxLimit: 200,
  });

  try {
    return await withOrgContext(async ({ client }): Promise<ListPlanningWorkOrdersResult> => {
      const s = await getActiveSiteId({ client });
      const baseParams = [status || null, search || null, archived, s] as const;

      const [countResult, dataResult] = await Promise.all([
        client.query<{ total: number }>(
          `select count(*)::int as total
             from public.work_orders wo
             left join public.items i on i.id = wo.product_id and i.org_id = app.current_org_id()
             left join public.org_document_settings ods
               on ods.org_id = wo.org_id
              and ods.doc_type = 'wo'
            ${WO_LIST_WHERE}`,
          [...baseParams],
        ),
        client.query<WOSummaryRow>(
        `select
           wo.id, wo.wo_number, wo.product_id, i.item_code, wo.item_type_at_creation,
           wo.planned_quantity::text as planned_quantity,
           wo.produced_quantity::text as produced_quantity,
           wo.uom, wo.status, wo.scheduled_start_time, wo.scheduled_end_time,
           wo.production_line_id, wo.priority, wo.source_of_demand,
           wo.source_reference, wo.ext_jsonb->>'notes' as notes, wo.created_at, wo.updated_at,
           coalesce(mat.material_count, 0) as material_count,
           coalesce(op.operation_count, 0) as operation_count,
           to_jsonb(exec.*) as latest_execution,
           to_jsonb(sched.*) as primary_schedule
         from public.work_orders wo
         left join public.items i on i.id = wo.product_id and i.org_id = app.current_org_id()
         left join public.org_document_settings ods
           on ods.org_id = wo.org_id
          and ods.doc_type = 'wo'
         left join lateral (
           select count(*)::int as material_count
             from public.wo_materials wm
            where wm.org_id = app.current_org_id()
              and wm.wo_id = wo.id
         ) mat on true
         left join lateral (
           select count(*)::int as operation_count
             from public.wo_operations wop
            where wop.org_id = app.current_org_id()
              and wop.wo_id = wo.id
         ) op on true
         left join lateral (
           select id, wo_id, status, version, started_at, paused_at, resumed_at, completed_at, closed_at, cancelled_at
             from public.wo_executions e
            where e.org_id = app.current_org_id()
              and e.wo_id = wo.id
            order by e.updated_at desc
            limit 1
         ) exec on true
         left join lateral (
           select id, planned_wo_id, product_id, output_role, expected_qty::text as expected_qty, uom,
                  allocation_pct::text as allocation_pct, disposition, downstream_wo_id, notes
             from public.schedule_outputs so
            where so.org_id = app.current_org_id()
              and so.planned_wo_id = wo.id
              and so.output_role = 'primary'
            order by so.created_at
            limit 1
         ) sched on true
         ${WO_LIST_WHERE}
         order by wo.scheduled_start_time nulls last, wo.created_at desc, wo.id desc
         limit $6 offset $7`,
        [...baseParams, page.limit, page.offset],
        ),
      ]);
      const count = await client.query<{ archived_count: string | number }>(
        `select count(*) as archived_count
           from public.work_orders wo
           left join public.items i on i.id = wo.product_id and i.org_id = app.current_org_id()
           left join public.org_document_settings ods
             on ods.org_id = wo.org_id
            and ods.doc_type = 'wo'
          where wo.org_id = app.current_org_id()
            and ($3::uuid is null or wo.site_id = $3::uuid)
            and ($1::text is null or wo.status = $1)
            and (
              $2::text is null
              or wo.wo_number ilike '%' || $2 || '%'
              or coalesce(i.item_code, wo.source_reference, '') ilike '%' || $2 || '%'
            )
            and wo.status in ('CLOSED', 'CANCELLED')
            and ods.archive_after_days is not null
            and wo.updated_at < now() - make_interval(days => ods.archive_after_days)`,
        [status || null, search || null, s],
      );

      const workOrders = dataResult.rows.map((row) => ({
        ...mapWoHeader(row),
        materialCount: Number(row.material_count),
        operationCount: Number(row.operation_count),
        latestExecution: row.latest_execution ? mapExecution(row.latest_execution) : undefined,
        primarySchedule: row.primary_schedule ? mapSchedule(row.primary_schedule) : undefined,
      }));
      const pagination = toPaginatedResult(workOrders, Number(countResult.rows[0]?.total ?? 0), page);

      return {
        ok: true,
        workOrders: pagination.items,
        pagination,
        archivedCount: Number(count.rows[0]?.archived_count ?? 0),
      };
    });
  } catch (error) {
    console.error('[listPlanningWorkOrders] persistence_failed', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
