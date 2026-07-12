/**
 * WO chain dependency gate (V-PLAN-WO-CYCLE consumer).
 *
 * wo_dependencies stores parent_wo_id = downstream FG consumer,
 * child_wo_id = upstream WIP producer. FG release/start/complete must not
 * proceed while an upstream prerequisite is still DRAFT or has not posted
 * the linked required_qty of primary output.
 *
 * Sufficiency uses sum(wo_outputs.qty_kg) in SQL NUMERIC — not work_orders.produced_quantity
 * (refreshed only at completion) — so incremental registered output counts while WIP is
 * still IN_PROGRESS.
 */

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

export type UpstreamWipGateMode = 'release' | 'start' | 'complete';

export type UpstreamWipNotReadyRow = {
  child_wo_id: string;
  child_wo_number: string;
  child_status: string;
  required_qty: string | null;
  posted_output_kg: string | null;
  release_blocked: boolean;
  start_complete_blocked: boolean;
};

export type UpstreamWipGateFailure = {
  code: 'upstream_wip_not_ready';
  mode: UpstreamWipGateMode;
  blockers: UpstreamWipNotReadyRow[];
};

export async function loadUpstreamWipDependencies(
  client: QueryClient,
  parentWoId: string,
): Promise<UpstreamWipNotReadyRow[]> {
  const { rows } = await client.query<UpstreamWipNotReadyRow>(
    `select child.id::text as child_wo_id,
            child.wo_number as child_wo_number,
            child.status as child_status,
            dep.required_qty::text as required_qty,
            coalesce(posted.output_kg, 0)::text as posted_output_kg,
            upper(child.status) in ('DRAFT', 'CANCELLED') as release_blocked,
            (
              upper(child.status) not in ('IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED')
              or (
                coalesce(dep.required_qty, 0) <= 0
                  and coalesce(posted.output_kg, 0) <= 0
              )
              or (
                coalesce(dep.required_qty, 0) > 0
                  and coalesce(posted.output_kg, 0) < dep.required_qty
              )
            ) as start_complete_blocked
       from public.wo_dependencies dep
       join public.work_orders child
         on child.org_id = dep.org_id
        and child.id = dep.child_wo_id
       left join lateral (
         select sum(o.qty_kg) as output_kg
           from public.wo_outputs o
          where o.org_id = child.org_id
            and o.wo_id = child.id
            and o.output_type = 'primary'
            and o.correction_of_id is null
            and not exists (
              select 1
                from public.wo_outputs correction
               where correction.org_id = o.org_id
                 and correction.correction_of_id = o.id
            )
       ) posted on true
      where dep.org_id = app.current_org_id()
        and dep.parent_wo_id = $1::uuid
      order by child.wo_number`,
    [parentWoId],
  );
  return rows;
}

export function evaluateUpstreamWipGate(
  mode: UpstreamWipGateMode,
  rows: readonly UpstreamWipNotReadyRow[],
): UpstreamWipGateFailure | null {
  const blockers =
    mode === 'release'
      ? rows.filter((row) => row.release_blocked)
      : rows.filter((row) => row.start_complete_blocked);
  if (blockers.length === 0) return null;
  return { code: 'upstream_wip_not_ready', mode, blockers };
}

export async function assertUpstreamWipReady(
  client: QueryClient,
  parentWoId: string,
  mode: UpstreamWipGateMode,
): Promise<UpstreamWipGateFailure | null> {
  const rows = await loadUpstreamWipDependencies(client, parentWoId);
  return evaluateUpstreamWipGate(mode, rows);
}

export function upstreamWipNotReadyMessage(failure: UpstreamWipGateFailure): string {
  const woList = failure.blockers.map((b) => b.child_wo_number).join(', ');
  if (failure.mode === 'release') {
    return `Upstream WIP work order(s) must be released before this order: ${woList}.`;
  }
  return `Upstream WIP work order(s) must finish producing required output before this order can proceed: ${woList}.`;
}
