-- WAVE E5 yard: dock doors + dock appointments (booking) + yard visits (gate in/out) + weighings (weighbridge).
-- Applied live via Supabase MCP 2026-06-24; file added for repo/DB parity.

create table if not exists public.dock_doors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  site_id uuid references public.sites(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  code text not null,
  name text,
  direction text not null default 'both' check (direction in ('inbound','outbound','both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists public.dock_appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  site_id uuid references public.sites(id) on delete set null,
  dock_door_id uuid references public.dock_doors(id) on delete set null,
  carrier_id uuid references public.carriers(id) on delete set null,
  direction text not null default 'inbound' check (direction in ('inbound','outbound')),
  reference text,
  scheduled_at timestamptz not null,
  duration_min integer not null default 60,
  status text not null default 'scheduled' check (status in ('scheduled','arrived','completed','cancelled','no_show')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.yard_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  site_id uuid references public.sites(id) on delete set null,
  dock_appointment_id uuid references public.dock_appointments(id) on delete set null,
  carrier_id uuid references public.carriers(id) on delete set null,
  vehicle_reg text,
  trailer_ref text,
  driver_name text,
  gate_in_at timestamptz,
  gate_out_at timestamptz,
  status text not null default 'on_site' check (status in ('on_site','departed')),
  created_at timestamptz not null default now()
);

create table if not exists public.weighings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  yard_visit_id uuid references public.yard_visits(id) on delete set null,
  gross_kg numeric,
  tare_kg numeric,
  net_kg numeric,
  weighed_at timestamptz not null default now(),
  weighed_by uuid
);

create index if not exists idx_dock_appointments_door on public.dock_appointments(org_id, dock_door_id, scheduled_at);
create index if not exists idx_yard_visits_appt on public.yard_visits(org_id, dock_appointment_id);

create trigger trg_dock_doors_updated_at before update on public.dock_doors
  for each row execute function public.planning_mrp_set_updated_at();
create trigger trg_dock_appointments_updated_at before update on public.dock_appointments
  for each row execute function public.planning_mrp_set_updated_at();

alter table public.dock_doors enable row level security; alter table public.dock_doors force row level security;
alter table public.dock_appointments enable row level security; alter table public.dock_appointments force row level security;
alter table public.yard_visits enable row level security; alter table public.yard_visits force row level security;
alter table public.weighings enable row level security; alter table public.weighings force row level security;

create policy dock_doors_org on public.dock_doors using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy dock_appointments_org on public.dock_appointments using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy yard_visits_org on public.yard_visits using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy weighings_org on public.weighings using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.dock_doors, public.dock_appointments, public.yard_visits, public.weighings from anon, authenticated;
grant select, insert, update, delete on public.dock_doors, public.dock_appointments, public.yard_visits, public.weighings to authenticated;
