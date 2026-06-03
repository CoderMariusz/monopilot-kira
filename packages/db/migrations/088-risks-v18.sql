-- T-080: 01-NPD-i risk register schema + V18 built blocker.
-- PRD: docs/prd/01-NPD-PRD.md §18.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create table if not exists public.risks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  title text not null,
  description text not null,
  likelihood integer not null,
  impact integer not null,
  score integer generated always as (likelihood * impact) stored,
  bucket text generated always as (
    case
      when likelihood * impact >= 6 then 'High'
      when likelihood * impact >= 3 then 'Med'
      else 'Low'
    end
  ) stored,
  state text not null default 'Open',
  mitigation text,
  owner_user_id uuid references public.users(id),
  closed_at timestamptz,
  closed_by_user uuid references public.users(id),
  created_at timestamptz not null default pg_catalog.now(),
  created_by_user uuid references public.users(id),
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id uuid,
  external_id text,
  schema_version integer not null default 1,
  constraint risks_title_length_check
    check (length(title) between 3 and 300),
  constraint risks_description_length_check
    check (length(description) between 10 and 500),
  constraint risks_likelihood_check
    check (likelihood between 1 and 3),
  constraint risks_impact_check
    check (impact between 1 and 3),
  constraint risks_state_check
    check (state in ('Open', 'Mitigated', 'Closed'))
);

create index if not exists risks_org_product_state_idx
  on public.risks (org_id, product_code, state);

create index if not exists risks_org_open_bucket_idx
  on public.risks (org_id, bucket)
  where state = 'Open';

alter table public.risks enable row level security;
alter table public.risks force row level security;

drop policy if exists risks_org_context on public.risks;
create policy risks_org_context
  on public.risks
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.risks from public;
revoke all on public.risks from app_user;
grant select, insert, update, delete on public.risks to app_user;

create or replace function public.fa_built_v18_check_fn()
returns trigger
language plpgsql
as $$
begin
  if new.built is false and old.built is true then
    raise exception 'V18_BUILT_DOWNGRADE_REQUIRES_AUDIT'
      using errcode = '23514';
  end if;

  if new.built is true and old.built is false then
    if exists (
      select 1
      from public.risks risk
      where risk.org_id = new.org_id
        and risk.product_code = new.product_code
        and risk.bucket = 'High'
        and risk.state = 'Open'
    ) then
      raise exception 'V18_HIGH_RISK_OPEN'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fa_built_v18_check on public.product;
create trigger fa_built_v18_check
  before update of built on public.product
  for each row
  when (old.built is distinct from new.built)
  execute function public.fa_built_v18_check_fn();

revoke all on function public.fa_built_v18_check_fn() from public;
