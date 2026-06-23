-- WAVE E9 freight: carrier master + transport lanes (cost basis). Supplier scorecard is read-only from existing data.
-- Applied live via Supabase MCP 2026-06-24; file added for repo/DB parity.

create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  code text not null,
  name text not null,
  mode text not null default 'road' check (mode in ('road','sea','air','rail','parcel')),
  contact_email text,
  contact_phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (org_id, code)
);

create table if not exists public.transport_lanes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  origin text not null,
  destination text not null,
  mode text not null default 'road' check (mode in ('road','sea','air','rail','parcel')),
  cost_basis text not null default 'per_pallet' check (cost_basis in ('per_kg','per_pallet','flat')),
  cost_amount numeric not null default 0,
  currency text not null default 'GBP',
  transit_days integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create index if not exists idx_transport_lanes_carrier on public.transport_lanes(org_id, carrier_id);

create trigger trg_carriers_updated_at before update on public.carriers
  for each row execute function public.planning_mrp_set_updated_at();
create trigger trg_transport_lanes_updated_at before update on public.transport_lanes
  for each row execute function public.planning_mrp_set_updated_at();

alter table public.carriers enable row level security;
alter table public.carriers force row level security;
alter table public.transport_lanes enable row level security;
alter table public.transport_lanes force row level security;

create policy carriers_org on public.carriers
  using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy transport_lanes_org on public.transport_lanes
  using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.carriers from anon, authenticated;
revoke all on public.transport_lanes from anon, authenticated;
grant select, insert, update, delete on public.carriers to authenticated;
grant select, insert, update, delete on public.transport_lanes to authenticated;
