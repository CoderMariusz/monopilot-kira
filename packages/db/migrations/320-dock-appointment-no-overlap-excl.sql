-- E5 follow-up (review): DB-enforced no-overlap on dock appointments (closes the bookAppointment TOCTOU race).
-- `timestamptz + interval` is STABLE so it can't be a gist index expression directly -> materialize `ends_at` via a
-- trigger, then EXCLUDE on tstzrange(scheduled_at, ends_at) (both plain timestamptz columns = IMMUTABLE).
-- Applied live via Supabase MCP 2026-06-24; file added for repo/DB parity.
create extension if not exists btree_gist;

alter table public.dock_appointments add column if not exists ends_at timestamptz;

create or replace function public.dock_appointment_set_ends_at()
returns trigger language plpgsql as $$
begin
  new.ends_at := new.scheduled_at + make_interval(mins => coalesce(new.duration_min, 0));
  return new;
end; $$;

drop trigger if exists trg_dock_appt_set_ends_at on public.dock_appointments;
create trigger trg_dock_appt_set_ends_at
  before insert or update of scheduled_at, duration_min on public.dock_appointments
  for each row execute function public.dock_appointment_set_ends_at();

update public.dock_appointments
  set ends_at = scheduled_at + make_interval(mins => coalesce(duration_min, 0))
  where ends_at is null;

alter table public.dock_appointments
  add constraint dock_appointments_no_overlap
  exclude using gist (
    org_id with =,
    dock_door_id with =,
    tstzrange(scheduled_at, ends_at) with &&
  )
  where (status <> all (array['cancelled','no_show']) and dock_door_id is not null and ends_at is not null);
