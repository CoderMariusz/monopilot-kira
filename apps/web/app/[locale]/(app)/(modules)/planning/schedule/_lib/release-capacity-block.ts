/**
 * Planning-owned release of an NPD trial's capacity block.
 *
 * `planning_capacity_blocks` belongs to Planning. NPD needs to free a slot when a
 * trial is voided or explicitly unbooked, but it must not reach into the table
 * itself — the moment Planning gives releasing a side effect (board revalidation,
 * a schedule event, freeing a downstream reservation), every NPD-owned DELETE
 * would silently skip it. Callers pass their CURRENT transaction client so the
 * release commits or rolls back together with whatever prompted it.
 *
 * The row carries no status column and the schedule board treats any present row
 * as an occupied slot, so releasing is a DELETE. The returned pre-image is the
 * durable evidence — callers are expected to write it to their audit trail.
 */

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Everything needed to reconstruct (or re-create) the released reservation. */
export type ReleasedCapacityBlock = {
  id: string;
  lineId: string;
  lineCode: string | null;
  lineName: string | null;
  projectId: string | null;
  trialId: string;
  label: string | null;
  blockDate: string;
  startTime: string;
  endTime: string;
  blockType: string | null;
};

type ReleasedRow = {
  id: string;
  line_id: string;
  line_code: string | null;
  line_name: string | null;
  project_id: string | null;
  trial_id: string;
  label: string | null;
  block_date: string;
  start_time: string;
  end_time: string;
  block_type: string | null;
};

/**
 * Release the capacity block reserved for `trialId`, org-scoped via RLS.
 * Returns the full pre-image, or `null` when the trial held no reservation.
 */
export async function releaseTrialCapacityBlock(
  client: QueryClient,
  trialId: string,
): Promise<ReleasedCapacityBlock | null> {
  const { rows } = await client.query<ReleasedRow>(
    `with removed as (
       delete from public.planning_capacity_blocks
        where org_id = app.current_org_id()
          and trial_id = $1::uuid
      returning id, line_id, project_id, trial_id, label,
                block_date, start_time, end_time, block_type
     )
     select r.id::text                          as id,
            r.line_id::text                     as line_id,
            pl.code                             as line_code,
            pl.name                             as line_name,
            r.project_id::text                  as project_id,
            r.trial_id::text                    as trial_id,
            r.label,
            to_char(r.block_date, 'YYYY-MM-DD') as block_date,
            r.start_time::text                  as start_time,
            r.end_time::text                    as end_time,
            r.block_type
       from removed r
       left join public.production_lines pl
         on pl.org_id = app.current_org_id()
        and pl.id = r.line_id`,
    [trialId],
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    lineId: row.line_id,
    lineCode: row.line_code,
    lineName: row.line_name,
    projectId: row.project_id,
    trialId: row.trial_id,
    label: row.label,
    blockDate: row.block_date,
    startTime: row.start_time,
    endTime: row.end_time,
    blockType: row.block_type,
  };
}
