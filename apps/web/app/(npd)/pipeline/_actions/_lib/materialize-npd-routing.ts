/**
 * Materialize an NPD-origin draft routing from the production-detail process chain.
 *
 * V-TEC deviations for NPD-origin drafts:
 * - V-TEC-61: each operation resolves line_id as coalesce(process.line_id,
 *   project.production_line_id). Bail no_line only when the project has no
 *   default line AND at least one process also lacks line_id.
 * - V-TEC-62 is relaxed when a process has no throughput_per_hour. Technical
 *   handoff still creates the draft operation, but run_time_per_unit_sec is NULL
 *   so the Technical routing editor can complete timing before activation.
 * - V-TEC-63 is relaxed by mapping manufacturing_operation_name to NULL when the
 *   process name is not in Reference.ManufacturingOperations. This preserves the
 *   NPD process label as op_name without inventing reference data.
 */

export type MaterializeNpdRoutingResult =
  | { ok: true; routingId: string }
  | { ok: false; code: 'no_processes' | 'no_line' | 'routing_exists' };

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ProjectRow = {
  item_id: string | null;
  production_line_id: string | null;
};

type ExistingRoutingRow = { id: string };
type CreatedRoutingRow = { id: string };

function processesCteSql(): string {
  return `processes as (
       select wp.id,
              row_number() over (order by wp.display_order asc, wp.created_at asc, wp.id asc)::integer as op_no,
              wp.process_name,
              wp.line_id,
              wp.throughput_per_hour,
              wp.duration_hours,
              wp.setup_cost,
              wp.yield_pct,
              (
                select coalesce(
                         jsonb_agg(
                           jsonb_build_object('role_group', r.role_group, 'headcount', r.headcount)
                           order by r.role_group
                         ),
                         '[]'::jsonb
                       )
                  from public.npd_wip_process_roles r
                 where r.org_id = app.current_org_id()
                   and r.process_id = wp.id
              ) as crew
         from public.prod_detail pd
         join public.npd_wip_processes wp
           on wp.org_id = pd.org_id
          and wp.prod_detail_id = pd.id
        where pd.org_id = app.current_org_id()
          and pd.product_code = (
            select p.product_code
              from public.npd_projects p
             where p.org_id = app.current_org_id()
               and p.id = $1::uuid
             limit 1
          )
     )`;
}

function expectedOperationsSelectSql(projectLineParamIndex: number): string {
  return `select p.op_no,
              p.process_name as op_name,
              coalesce(p.line_id, $${projectLineParamIndex}::uuid) as line_id,
              greatest(0, round(coalesce(p.duration_hours, 0) * 60))::integer as setup_time_min,
              nullif(p.setup_cost, 0) as setup_cost,
              case
                when p.throughput_per_hour is null or p.throughput_per_hour <= 0 then null
                else round(3600::numeric / p.throughput_per_hour, 2)
              end as run_time_per_unit_sec,
              coalesce(p.yield_pct, 100) as yield_pct
         from processes p`;
}

function insertRoutingOperationsSql(projectLineParamIndex: number): string {
  return `insert into public.routing_operations
       (org_id, routing_id, op_no, op_code, op_name, line_id,
        setup_time_min, setup_cost, run_time_per_unit_sec, manufacturing_operation_name, crew, yield_pct)
     with ${processesCteSql()}
     select app.current_org_id(),
            $2::uuid,
            p.op_no,
            'NPD-' || lpad(p.op_no::text, 3, '0'),
            p.process_name,
            coalesce(p.line_id, $${projectLineParamIndex}::uuid),
            greatest(0, round(coalesce(p.duration_hours, 0) * 60))::integer,
            nullif(p.setup_cost, 0),
            case
              when p.throughput_per_hour is null or p.throughput_per_hour <= 0 then null
              else round(3600::numeric / p.throughput_per_hour, 2)
            end,
            mo.operation_name,
            p.crew,
            coalesce(p.yield_pct, 100)
       from processes p
       left join "Reference"."ManufacturingOperations" mo
         on mo.org_id = app.current_org_id()
        and mo.is_active = true
        and mo.operation_name = p.process_name
      order by p.op_no`;
}

async function routingOperationsDrifted(
  sql: QueryClient,
  routingId: string,
  projectId: string,
  projectProductionLineId: string | null,
): Promise<boolean> {
  const drift = await sql.query<{ drifted: boolean }>(
    `with ${processesCteSql()},
     expected as (
       ${expectedOperationsSelectSql(3)}
     ),
     actual as (
       select ro.op_no,
              ro.op_name,
              ro.line_id,
              ro.setup_time_min,
              ro.setup_cost,
              round(ro.run_time_per_unit_sec, 2) as run_time_per_unit_sec,
              ro.yield_pct
         from public.routing_operations ro
        where ro.org_id = app.current_org_id()
          and ro.routing_id = $2::uuid
     )
     select (
       (select count(*)::integer from expected) <>
       (select count(*)::integer from actual)
       or exists (select * from expected except select * from actual)
       or exists (select * from actual except select * from expected)
     ) as drifted`,
    [projectId, routingId, projectProductionLineId],
  );
  return drift.rows[0]?.drifted === true;
}

async function replaceRoutingOperations(
  sql: QueryClient,
  routingId: string,
  projectId: string,
  projectProductionLineId: string | null,
): Promise<void> {
  await sql.query(
    `delete from public.routing_operations
      where org_id = app.current_org_id()
        and routing_id = $1::uuid`,
    [routingId],
  );
  await sql.query(insertRoutingOperationsSql(3), [projectId, routingId, projectProductionLineId]);
}

export async function materializeNpdRouting(
  sql: QueryClient,
  projectId: string,
): Promise<MaterializeNpdRoutingResult> {
  const projectResult = await sql.query<ProjectRow>(
    `select i.id::text as item_id,
            p.production_line_id::text as production_line_id
       from public.npd_projects p
       left join public.items i
         on i.org_id = p.org_id
        and i.item_code = p.product_code
      where p.org_id = app.current_org_id()
        and p.id = $1::uuid
      limit 1`,
    [projectId],
  );
  const project = projectResult.rows[0];
  if (!project?.item_id) return { ok: false, code: 'no_processes' };

  if (!project.production_line_id) {
    const unresolvedLine = await sql.query<{ has_unresolved: boolean }>(
      `select exists (
         select 1
           from public.prod_detail pd
           join public.npd_wip_processes wp
             on wp.org_id = pd.org_id
            and wp.prod_detail_id = pd.id
          where pd.org_id = app.current_org_id()
            and pd.product_code = (
              select p.product_code
                from public.npd_projects p
               where p.org_id = app.current_org_id()
                 and p.id = $1::uuid
               limit 1
            )
            and wp.line_id is null
       ) as has_unresolved`,
      [projectId],
    );
    if (unresolvedLine.rows[0]?.has_unresolved) return { ok: false, code: 'no_line' };
  }

  const existing = await sql.query<ExistingRoutingRow>(
    `select id::text as id
       from public.routings
      where org_id = app.current_org_id()
        and item_id = $1::uuid
        and origin_module = 'npd'
        and status in ('active', 'draft')
      order by case status when 'active' then 0 else 1 end, version desc, created_at desc
      limit 1`,
    [project.item_id],
  );
  const existingRoutingId = existing.rows[0]?.id;
  if (existingRoutingId) {
    const drifted = await routingOperationsDrifted(
      sql,
      existingRoutingId,
      projectId,
      project.production_line_id,
    );
    if (!drifted) return { ok: false, code: 'routing_exists' };
    await replaceRoutingOperations(sql, existingRoutingId, projectId, project.production_line_id);
    return { ok: true, routingId: existingRoutingId };
  }

  const processCount = await sql.query<{ count: string }>(
    `select count(*)::text as count
       from public.prod_detail pd
       join public.npd_wip_processes wp
         on wp.org_id = pd.org_id
        and wp.prod_detail_id = pd.id
      where pd.org_id = app.current_org_id()
        and pd.product_code = (
          select p.product_code
            from public.npd_projects p
           where p.org_id = app.current_org_id()
             and p.id = $1::uuid
           limit 1
        )`,
    [projectId],
  );
  if (Number(processCount.rows[0]?.count ?? 0) === 0) return { ok: false, code: 'no_processes' };

  const version = await sql.query<{ next_version: number }>(
    `select coalesce(max(version), 0) + 1 as next_version
       from public.routings
      where org_id = app.current_org_id()
        and item_id = $1::uuid`,
    [project.item_id],
  );

  const created = await sql.query<CreatedRoutingRow>(
    `insert into public.routings
       (org_id, item_id, version, status, origin_module)
     values
       (app.current_org_id(), $1::uuid, $2::integer, 'draft', 'npd')
     returning id::text as id`,
    [project.item_id, Number(version.rows[0]?.next_version ?? 1)],
  );
  const routingId = created.rows[0]?.id;
  if (!routingId) throw new Error('npd_routing_insert_returned_no_row');

  await sql.query(insertRoutingOperationsSql(3), [projectId, routingId, project.production_line_id]);

  return { ok: true, routingId };
}
