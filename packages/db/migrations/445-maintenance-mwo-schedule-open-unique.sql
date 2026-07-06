-- Migration 445: defense-in-depth unique index for open-backlog PM-schedule MWOs.
--
-- generateMwoFromPmSchedule (mwo-actions.ts) serializes concurrent creates for the
-- same schedule via a schedule-scoped pg_advisory_xact_lock before the duplicate
-- check. This partial unique index is the DB-level backstop: at most one open
-- backlog MWO per (org_id, schedule_id) while schedule_id is set.
create unique index if not exists maintenance_work_orders_org_schedule_open_uidx
  on public.maintenance_work_orders (org_id, schedule_id)
  where schedule_id is not null
    and state in ('requested', 'approved', 'open', 'in_progress');
