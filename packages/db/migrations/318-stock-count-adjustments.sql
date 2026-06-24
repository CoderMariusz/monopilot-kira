-- WAVE E10 (owner-requested "create a pallet via counting if stock is found"): blind stock counts + variance approval.
-- The approved adjustment is the only legal qty writer outside consume/receive/move — e-sign + audit.
-- Positive variance (found stock) MINTS a new LP; negative variance (shrinkage) reduces stock. Default control = e-sign.
-- Applied live via Supabase MCP 2026-06-24; file added for repo/DB parity.

create table if not exists public.count_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  site_id uuid references public.sites(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  code text,
  count_type text not null default 'cycle' check (count_type in ('cycle','full','spot')),
  status text not null default 'open' check (status in ('open','counting','review','closed','cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid,
  closed_at timestamptz,
  closed_by uuid
);

create table if not exists public.count_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  session_id uuid not null references public.count_sessions(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  lp_id uuid references public.license_plates(id) on delete set null,
  system_qty numeric not null default 0,
  counted_qty numeric,
  variance_qty numeric,
  status text not null default 'pending' check (status in ('pending','counted','approved','applied','rejected')),
  counted_by uuid,
  counted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  count_line_id uuid references public.count_lines(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  lp_id uuid references public.license_plates(id) on delete set null,
  adjustment_qty numeric not null,
  direction text not null check (direction in ('increase','decrease')),
  reason text,
  esign_ref text,
  applied_at timestamptz not null default now(),
  applied_by uuid
);

create index if not exists idx_count_lines_session on public.count_lines(org_id, session_id);
create index if not exists idx_stock_adjustments_line on public.stock_adjustments(org_id, count_line_id);

alter table public.count_sessions enable row level security; alter table public.count_sessions force row level security;
alter table public.count_lines enable row level security; alter table public.count_lines force row level security;
alter table public.stock_adjustments enable row level security; alter table public.stock_adjustments force row level security;

create policy count_sessions_org on public.count_sessions using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy count_lines_org on public.count_lines using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy stock_adjustments_org on public.stock_adjustments using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.count_sessions, public.count_lines, public.stock_adjustments from anon, authenticated;
grant select, insert, update, delete on public.count_sessions, public.count_lines, public.stock_adjustments to authenticated;
