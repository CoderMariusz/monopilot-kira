-- T-037: 01-NPD fa_allergen_overrides per-row override audit chain.
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().
-- PRD: docs/prd/01-NPD-PRD.md §8.10.

do $$
begin
  create type public.fa_allergen_override_action as enum ('add', 'remove');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.fa_allergen_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  allergen_code text not null,
  action public.fa_allergen_override_action not null,
  reason text not null,
  actor_user_id uuid not null references public.users(id),
  actor_role text not null,
  supersedes_id uuid references public.fa_allergen_overrides(id),
  superseded_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,
  constraint fa_allergen_overrides_allergen_fk
    foreign key (org_id, allergen_code)
    references "Reference"."Allergens" (org_id, allergen_code)
    on update cascade
    on delete restrict,
  constraint fa_allergen_overrides_reason_length_check
    check (length(reason) >= 10),
  constraint fa_allergen_overrides_actor_role_nonempty_check
    check (length(trim(actor_role)) > 0),
  constraint fa_allergen_overrides_schema_version_check
    check (schema_version >= 1)
);

create index if not exists fa_allergen_overrides_current_idx
  on public.fa_allergen_overrides (org_id, product_code, allergen_code)
  where superseded_at is null;

create index if not exists fa_allergen_overrides_history_idx
  on public.fa_allergen_overrides (org_id, product_code, created_at desc);

create index if not exists fa_allergen_overrides_supersedes_idx
  on public.fa_allergen_overrides (supersedes_id)
  where supersedes_id is not null;

create or replace function public.fa_allergen_overrides_chain_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  prior_current public.fa_allergen_overrides%rowtype;
begin
  if new.superseded_at is not null then
    raise exception 'new fa_allergen_overrides rows must be current at insert'
      using errcode = '23514';
  end if;

  if new.supersedes_id is not null then
    select *
      into prior_current
      from public.fa_allergen_overrides
     where id = new.supersedes_id
     for update;

    if not found then
      raise exception 'supersedes_id % does not reference an existing override', new.supersedes_id
        using errcode = '23503';
    end if;

    if prior_current.org_id <> new.org_id
       or prior_current.product_code <> new.product_code
       or prior_current.allergen_code <> new.allergen_code then
      raise exception 'supersedes_id must reference the same org/product/allergen chain'
        using errcode = '23514';
    end if;

    if prior_current.superseded_at is not null then
      raise exception 'supersedes_id must reference the current override row'
        using errcode = '23514';
    end if;
  else
    select *
      into prior_current
      from public.fa_allergen_overrides
     where org_id = new.org_id
       and product_code = new.product_code
       and allergen_code = new.allergen_code
       and superseded_at is null
     order by created_at desc, id desc
     limit 1
     for update;

    if found then
      new.supersedes_id := prior_current.id;
    end if;
  end if;

  if new.supersedes_id is not null then
    update public.fa_allergen_overrides
       set superseded_at = new.created_at
     where id = new.supersedes_id;
  end if;

  return new;
end;
$$;

drop trigger if exists fa_allergen_overrides_chain_before_insert_trg
  on public.fa_allergen_overrides;
create trigger fa_allergen_overrides_chain_before_insert_trg
  before insert on public.fa_allergen_overrides
  for each row
  execute function public.fa_allergen_overrides_chain_before_insert();

create or replace function public.fa_allergen_overrides_audit_after_insert()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  insert into public.audit_events (
    org_id,
    actor_user_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    after_state,
    request_id,
    retention_class
  )
  values (
    new.org_id,
    new.actor_user_id,
    'user',
    'INSERT',
    'fa_allergen_overrides',
    new.id::text,
    jsonb_build_object(
      'table', 'fa_allergen_overrides',
      'op', 'INSERT',
      'row', to_jsonb(new)
    ),
    gen_random_uuid(),
    'standard'
  );

  return new;
end;
$$;

drop trigger if exists fa_allergen_overrides_audit_after_insert_trg
  on public.fa_allergen_overrides;
create trigger fa_allergen_overrides_audit_after_insert_trg
  after insert on public.fa_allergen_overrides
  for each row
  execute function public.fa_allergen_overrides_audit_after_insert();

alter table public.fa_allergen_overrides enable row level security;
alter table public.fa_allergen_overrides force row level security;

drop policy if exists fa_allergen_overrides_org_context on public.fa_allergen_overrides;
create policy fa_allergen_overrides_org_context
  on public.fa_allergen_overrides
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.fa_allergen_overrides from public;
revoke all on public.fa_allergen_overrides from app_user;
grant select, insert on public.fa_allergen_overrides to app_user;
revoke update, delete on public.fa_allergen_overrides from app_user;

revoke all on function public.fa_allergen_overrides_chain_before_insert() from public;
grant execute on function public.fa_allergen_overrides_chain_before_insert() to app_user;

revoke all on function public.fa_allergen_overrides_audit_after_insert() from public;
grant execute on function public.fa_allergen_overrides_audit_after_insert() to app_user;
