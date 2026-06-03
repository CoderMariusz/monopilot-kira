-- T-070: 01-NPD-h costing schema.
-- PRD: docs/prd/01-NPD-PRD.md §17.11.3.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create table if not exists public.costing_breakdowns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  scenario text not null,
  raw_cost_eur numeric not null,
  margin_pct numeric not null,
  target_price_eur numeric not null,
  computed_at timestamptz not null default pg_catalog.now(),
  constraint costing_breakdowns_scenario_nonempty_check
    check (length(pg_catalog.btrim(scenario)) > 0),
  constraint costing_breakdowns_margin_pct_check
    check (margin_pct >= -100),
  constraint costing_breakdowns_org_product_scenario_unique
    unique (org_id, product_code, scenario)
);

create table if not exists public.costing_waterfall_steps (
  id uuid primary key default gen_random_uuid(),
  breakdown_id uuid not null references public.costing_breakdowns(id) on delete cascade,
  step_index integer not null,
  step_name text not null,
  value_eur numeric not null,
  delta_pct numeric,
  constraint costing_waterfall_steps_step_index_check
    check (step_index between 1 and 9),
  constraint costing_waterfall_steps_step_name_nonempty_check
    check (length(pg_catalog.btrim(step_name)) > 0),
  constraint costing_waterfall_steps_breakdown_step_unique
    unique (breakdown_id, step_index)
);

create index if not exists costing_breakdowns_org_product_idx
  on public.costing_breakdowns (org_id, product_code);

create index if not exists costing_breakdowns_product_code_idx
  on public.costing_breakdowns (product_code);

create index if not exists costing_waterfall_steps_breakdown_idx
  on public.costing_waterfall_steps (breakdown_id);

alter table public.costing_breakdowns enable row level security;
alter table public.costing_breakdowns force row level security;

drop policy if exists costing_breakdowns_org_context on public.costing_breakdowns;
create policy costing_breakdowns_org_context
  on public.costing_breakdowns
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.costing_waterfall_steps enable row level security;
alter table public.costing_waterfall_steps force row level security;

drop policy if exists costing_waterfall_steps_org_context on public.costing_waterfall_steps;
create policy costing_waterfall_steps_org_context
  on public.costing_waterfall_steps
  for all
  to app_user
  using (
    exists (
      select 1
      from public.costing_breakdowns breakdown
      where breakdown.id = breakdown_id
        and breakdown.org_id = app.current_org_id()
    )
  )
  with check (
    exists (
      select 1
      from public.costing_breakdowns breakdown
      where breakdown.id = breakdown_id
        and breakdown.org_id = app.current_org_id()
    )
  );

revoke all on public.costing_breakdowns from public;
revoke all on public.costing_breakdowns from app_user;
grant select, insert, update, delete on public.costing_breakdowns to app_user;

revoke all on public.costing_waterfall_steps from public;
revoke all on public.costing_waterfall_steps from app_user;
grant select, insert, update, delete on public.costing_waterfall_steps to app_user;

-- Default costing threshold for §17.11.3/V07: warn when scenario margin is <= 15%.
-- Seed into the schema-driven reference store when it is present and an Apex org
-- has already been bootstrapped. Isolated task DBs may not have Apex seeded yet.
do $$
declare
  v_apex_org_id uuid;
begin
  if to_regclass('public.reference_tables') is null then
    return;
  end if;

  select id into v_apex_org_id
  from public.organizations
  where external_id = 'apex'
  order by created_at asc, id asc
  limit 1;

  if v_apex_org_id is null then
    raise notice 'Apex org not found - skipping costing alert threshold seed.';
    return;
  end if;

  insert into public.reference_tables
    (org_id, table_code, row_key, row_data, display_order, is_active)
  values
    (
      v_apex_org_id,
      'alert_thresholds',
      'NPD_COSTING_MARGIN_WARN',
      jsonb_build_object(
        'threshold_code', 'NPD_COSTING_MARGIN_WARN',
        'module', 'npd',
        'metric', 'margin_pct',
        'operator', '<=',
        'threshold_pct', 15,
        'severity', 'warn'
      ),
      70,
      true
    )
  on conflict (org_id, table_code, row_key) do update
    set row_data = excluded.row_data,
        display_order = excluded.display_order,
        is_active = excluded.is_active,
        updated_at = pg_catalog.now();
end $$;
