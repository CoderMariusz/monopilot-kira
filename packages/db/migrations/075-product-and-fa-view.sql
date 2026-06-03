-- Migration 075: 01-NPD-a.6 product table + fa compatibility view.
-- PRD: docs/prd/01-NPD-PRD.md §4.2; physical table is public.product.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

create table if not exists public.product (
  -- Main Table 69 business columns
  product_code text primary key,
  product_name text,
  pack_size text,
  number_of_cases numeric,
  recipe_components text,
  ingredient_codes text,
  template text,
  closed_core text,
  primary_ingredient_pct numeric,
  runs_per_week numeric,
  date_code_per_week text,
  closed_planning text,
  launch_date date,
  department_number text,
  article_number text,
  bar_codes text,
  cases_per_week_w1 numeric,
  cases_per_week_w2 numeric,
  cases_per_week_w3 numeric,
  closed_commercial text,
  process_1 text,
  yield_p1 numeric,
  process_2 text,
  yield_p2 numeric,
  process_3 text,
  yield_p3 numeric,
  process_4 text,
  yield_p4 numeric,
  line text,
  dieset text,
  yield_line numeric,
  staffing text,
  rate numeric,
  pr_code_p1 text,
  pr_code_p2 text,
  pr_code_p3 text,
  pr_code_p4 text,
  pr_code_final text,
  closed_production text,
  shelf_life text,
  closed_technical text,
  box text,
  top_label text,
  bottom_label text,
  web text,
  mrp_box text,
  mrp_labels text,
  mrp_films text,
  mrp_sleeves text,
  mrp_cartons text,
  tara_weight numeric,
  pallet_stacking_plan text,
  box_dimensions text,
  closed_mrp text,
  price numeric,
  lead_time numeric,
  supplier text,
  proc_shelf_life numeric,
  closed_procurement text,
  done_core boolean,
  done_planning boolean,
  done_commercial boolean,
  done_production boolean,
  done_technical boolean,
  done_mrp boolean,
  done_procurement boolean,
  status_overall text,
  days_to_launch integer,
  built boolean not null default false,

  -- Wave0 business scope
  org_id uuid not null references public.organizations(id),

  -- L3/L4 extensions
  ext_jsonb jsonb not null default '{}'::jsonb,
  private_jsonb jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,

  -- AI/trace-ready (R13)
  model_prediction_id uuid,
  epcis_event_id uuid,
  external_id text,

  -- Audit
  created_at timestamptz not null default now(),
  created_by_user uuid not null references public.users(id),
  created_by_device text,
  app_version text
);

alter table public.product enable row level security;
alter table public.product force row level security;

drop policy if exists product_org_context on public.product;
create policy product_org_context
  on public.product
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

create index if not exists product_org_status_days_idx
  on public.product (org_id, status_overall, days_to_launch);

create index if not exists product_org_launch_unbuilt_idx
  on public.product (org_id, launch_date)
  where built = false;

revoke all on public.product from public;
revoke all on public.product from app_user;
grant select, insert, update, delete on public.product to app_user;

create or replace view public.fa
  with (security_invoker = true)
as
select * from public.product;

create or replace function public.fa_reject_writes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'fa is a read-only compatibility view';
end;
$$;

drop trigger if exists fa_read_only on public.fa;
create trigger fa_read_only
  instead of insert or update or delete on public.fa
  for each row
  execute function public.fa_reject_writes();

revoke all on public.fa from public;
revoke all on public.fa from app_user;
grant select on public.fa to app_user;
