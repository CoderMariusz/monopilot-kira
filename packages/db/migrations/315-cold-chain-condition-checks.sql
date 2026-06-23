-- WAVE E2B cold-chain: per-product acceptable temperature ranges + delivery condition checks at receiving.
-- Out-of-range checks create a canonical quality hold (handled in the action layer).
-- Applied live via Supabase MCP 2026-06-24; file added for repo/DB parity.

create table if not exists public.product_temp_ranges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  site_id uuid references public.sites(id) on delete set null,
  item_id uuid not null references public.items(id) on delete cascade,
  min_temp_c numeric,
  max_temp_c numeric,
  requires_check boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (org_id, item_id)
);

create table if not exists public.delivery_condition_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default app.current_org_id(),
  site_id uuid references public.sites(id) on delete set null,
  grn_item_id uuid references public.grn_items(id) on delete set null,
  lp_id uuid references public.license_plates(id) on delete set null,
  item_id uuid references public.items(id) on delete set null,
  measured_temp_c numeric,
  min_temp_c numeric,
  max_temp_c numeric,
  in_range boolean not null,
  reason text,
  hold_id uuid references public.quality_holds(id) on delete set null,
  checked_by uuid,
  checked_at timestamptz not null default now()
);

create index if not exists idx_product_temp_ranges_item on public.product_temp_ranges(org_id, item_id);
create index if not exists idx_delivery_condition_checks_grn on public.delivery_condition_checks(org_id, grn_item_id);
create index if not exists idx_delivery_condition_checks_lp on public.delivery_condition_checks(org_id, lp_id);

create trigger trg_product_temp_ranges_updated_at before update on public.product_temp_ranges
  for each row execute function public.planning_mrp_set_updated_at();

alter table public.product_temp_ranges enable row level security;
alter table public.product_temp_ranges force row level security;
alter table public.delivery_condition_checks enable row level security;
alter table public.delivery_condition_checks force row level security;

create policy product_temp_ranges_org on public.product_temp_ranges
  using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());
create policy delivery_condition_checks_org on public.delivery_condition_checks
  using (org_id = app.current_org_id()) with check (org_id = app.current_org_id());

revoke all on public.product_temp_ranges from anon, authenticated;
revoke all on public.delivery_condition_checks from anon, authenticated;
grant select, insert, update, delete on public.product_temp_ranges to authenticated;
grant select, insert, update, delete on public.delivery_condition_checks to authenticated;
