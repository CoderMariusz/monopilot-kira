-- Migration 093: T-063 NPD recipe formulation schema.
-- PRD: docs/prd/01-NPD-PRD.md §17.11.1.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create table if not exists public.formulations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.npd_projects(id) on delete cascade,
  product_code text references public.product(product_code) on delete set null,
  current_version_id uuid,
  locked_at timestamptz,
  locked_by_user uuid references public.users(id),
  created_at timestamptz not null default pg_catalog.now(),
  created_by_user uuid references public.users(id),
  schema_version integer not null default 1
);

create table if not exists public.formulation_versions (
  id uuid primary key default gen_random_uuid(),
  formulation_id uuid not null references public.formulations(id) on delete cascade,
  version_number integer not null,
  state text not null,
  batch_size_kg numeric,
  target_yield_pct numeric,
  target_price_eur numeric,
  created_at timestamptz not null default pg_catalog.now(),
  created_by_user uuid references public.users(id),
  schema_version integer not null default 1,
  constraint formulation_versions_state_check
    check (state in ('draft', 'submitted_for_trial', 'locked')),
  constraint formulation_versions_version_number_check
    check (version_number > 0),
  constraint formulation_versions_batch_size_kg_check
    check (batch_size_kg is null or batch_size_kg > 0),
  constraint formulation_versions_target_yield_pct_check
    check (target_yield_pct is null or (target_yield_pct >= 0 and target_yield_pct <= 100)),
  constraint formulation_versions_target_price_eur_check
    check (target_price_eur is null or target_price_eur >= 0),
  constraint formulation_versions_formulation_version_unique
    unique (formulation_id, version_number)
);

alter table public.formulations
  drop constraint if exists formulations_current_version_fk;

alter table public.formulations
  add constraint formulations_current_version_fk
  foreign key (current_version_id)
  references public.formulation_versions(id)
  on delete set null
  deferrable initially deferred;

create table if not exists public.formulation_ingredients (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.formulation_versions(id) on delete cascade,
  rm_code text not null,
  qty_kg numeric,
  pct numeric,
  cost_per_kg_eur numeric,
  allergens_inherited text[] not null default '{}'::text[],
  sequence integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint formulation_ingredients_rm_code_nonempty_check
    check (length(pg_catalog.btrim(rm_code)) > 0),
  constraint formulation_ingredients_qty_kg_check
    check (qty_kg is null or qty_kg >= 0),
  constraint formulation_ingredients_pct_check
    check (pct is null or (pct >= 0 and pct <= 100)),
  constraint formulation_ingredients_cost_per_kg_eur_check
    check (cost_per_kg_eur is null or cost_per_kg_eur >= 0),
  constraint formulation_ingredients_sequence_check
    check (sequence > 0),
  constraint formulation_ingredients_version_sequence_unique
    unique (version_id, sequence)
);

create table if not exists public.formulation_calc_cache (
  version_id uuid primary key references public.formulation_versions(id) on delete cascade,
  cost_json jsonb not null default '{}'::jsonb,
  nutrition_json jsonb not null default '{}'::jsonb,
  allergen_json jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1
);

create table if not exists public.formulation_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  formulation_id uuid,
  version_id uuid,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.users(id),
  created_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint formulation_audit_log_event_type_nonempty_check
    check (length(pg_catalog.btrim(event_type)) > 0)
);

create index if not exists formulations_org_project_idx
  on public.formulations (org_id, project_id);

create index if not exists formulation_versions_formulation_version_idx
  on public.formulation_versions (formulation_id, version_number);

create index if not exists formulation_ingredients_version_sequence_idx
  on public.formulation_ingredients (version_id, sequence);

create index if not exists formulation_audit_log_org_created_idx
  on public.formulation_audit_log (org_id, created_at desc);

create or replace function public.formulations_validate_org_links()
returns trigger
language plpgsql
as $$
declare
  v_project_org_id uuid;
  v_product_org_id uuid;
  v_current_formulation_id uuid;
begin
  select project.org_id into v_project_org_id
  from public.npd_projects project
  where project.id = new.project_id;

  if v_project_org_id is null then
    raise exception 'formulation project_id % does not exist', new.project_id;
  end if;

  if v_project_org_id is distinct from new.org_id then
    raise exception 'formulation org_id must match npd_projects.org_id';
  end if;

  if new.product_code is not null then
    select product.org_id into v_product_org_id
    from public.product product
    where product.product_code = new.product_code;

    if v_product_org_id is null then
      raise exception 'formulation product_code % does not exist', new.product_code;
    end if;

    if v_product_org_id is distinct from new.org_id then
      raise exception 'formulation org_id must match product.org_id';
    end if;
  end if;

  if new.current_version_id is not null then
    select version.formulation_id into v_current_formulation_id
    from public.formulation_versions version
    where version.id = new.current_version_id;

    if v_current_formulation_id is distinct from new.id then
      raise exception 'current_version_id must belong to the same formulation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists formulations_validate_org_links on public.formulations;
create trigger formulations_validate_org_links
  before insert or update on public.formulations
  for each row
  execute function public.formulations_validate_org_links();

create or replace function public.formulation_versions_enforce_state_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    if old.state = 'locked' then
      raise exception 'locked formulation versions cannot change state';
    end if;

    if old.state = 'submitted_for_trial' and new.state = 'draft' then
      raise exception 'formulation versions cannot transition from submitted_for_trial to draft';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists formulation_versions_enforce_state_transition on public.formulation_versions;
create trigger formulation_versions_enforce_state_transition
  before update on public.formulation_versions
  for each row
  execute function public.formulation_versions_enforce_state_transition();

create or replace function public.formulation_audit_log_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'formulation_audit_log is append-only; cannot update audit rows';
  elsif tg_op = 'DELETE' then
    raise exception 'formulation_audit_log is append-only; cannot delete audit rows';
  end if;

  return new;
end;
$$;

drop trigger if exists formulation_audit_log_reject_mutation on public.formulation_audit_log;
create trigger formulation_audit_log_reject_mutation
  before update or delete on public.formulation_audit_log
  for each row
  execute function public.formulation_audit_log_reject_mutation();

alter table public.formulations enable row level security;
alter table public.formulations force row level security;

drop policy if exists formulations_org_context on public.formulations;
create policy formulations_org_context
  on public.formulations
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.formulation_versions enable row level security;
alter table public.formulation_versions force row level security;

drop policy if exists formulation_versions_org_context on public.formulation_versions;
create policy formulation_versions_org_context
  on public.formulation_versions
  for all
  to app_user
  using (
    exists (
      select 1
      from public.formulations formulation
      where formulation.id = formulation_id
        and formulation.org_id = app.current_org_id()
    )
  )
  with check (
    exists (
      select 1
      from public.formulations formulation
      where formulation.id = formulation_id
        and formulation.org_id = app.current_org_id()
    )
  );

alter table public.formulation_ingredients enable row level security;
alter table public.formulation_ingredients force row level security;

drop policy if exists formulation_ingredients_org_context on public.formulation_ingredients;
create policy formulation_ingredients_org_context
  on public.formulation_ingredients
  for all
  to app_user
  using (
    exists (
      select 1
      from public.formulation_versions version
      join public.formulations formulation on formulation.id = version.formulation_id
      where version.id = version_id
        and formulation.org_id = app.current_org_id()
    )
  )
  with check (
    exists (
      select 1
      from public.formulation_versions version
      join public.formulations formulation on formulation.id = version.formulation_id
      where version.id = version_id
        and formulation.org_id = app.current_org_id()
    )
  );

alter table public.formulation_calc_cache enable row level security;
alter table public.formulation_calc_cache force row level security;

drop policy if exists formulation_calc_cache_org_context on public.formulation_calc_cache;
create policy formulation_calc_cache_org_context
  on public.formulation_calc_cache
  for all
  to app_user
  using (
    exists (
      select 1
      from public.formulation_versions version
      join public.formulations formulation on formulation.id = version.formulation_id
      where version.id = version_id
        and formulation.org_id = app.current_org_id()
    )
  )
  with check (
    exists (
      select 1
      from public.formulation_versions version
      join public.formulations formulation on formulation.id = version.formulation_id
      where version.id = version_id
        and formulation.org_id = app.current_org_id()
    )
  );

alter table public.formulation_audit_log enable row level security;
alter table public.formulation_audit_log force row level security;

drop policy if exists formulation_audit_log_org_context on public.formulation_audit_log;
create policy formulation_audit_log_org_context
  on public.formulation_audit_log
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.formulations from public;
revoke all on public.formulations from app_user;
grant select, insert, update, delete on public.formulations to app_user;

revoke all on public.formulation_versions from public;
revoke all on public.formulation_versions from app_user;
grant select, insert, update, delete on public.formulation_versions to app_user;

revoke all on public.formulation_ingredients from public;
revoke all on public.formulation_ingredients from app_user;
grant select, insert, update, delete on public.formulation_ingredients to app_user;

revoke all on public.formulation_calc_cache from public;
revoke all on public.formulation_calc_cache from app_user;
grant select, insert, update, delete on public.formulation_calc_cache to app_user;

revoke all on public.formulation_audit_log from public;
revoke all on public.formulation_audit_log from app_user;
grant select, insert, update, delete on public.formulation_audit_log to app_user;
