-- Migration 112: 01-NPD fa_builder_outputs storage metadata.
-- PRD: docs/prd/01-NPD-PRD.md §10.6.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

create table if not exists public.fa_builder_outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_code text not null references public.product(product_code) on delete cascade,
  file_path text not null,
  generated_at timestamptz not null default now(),
  generated_by_user uuid not null references public.users(id),
  app_version text,
  superseded_at timestamptz,
  schema_version integer not null default 1,

  constraint fa_builder_outputs_file_path_nonempty_check
    check (length(trim(file_path)) > 0),
  constraint fa_builder_outputs_superseded_after_generated_check
    check (superseded_at is null or superseded_at >= generated_at),
  constraint fa_builder_outputs_schema_version_check
    check (schema_version >= 1)
);

create index if not exists fa_builder_outputs_current_idx
  on public.fa_builder_outputs (org_id, product_code, generated_at desc)
  where superseded_at is null;

create index if not exists fa_builder_outputs_history_idx
  on public.fa_builder_outputs (org_id, product_code, generated_at desc);

create unique index if not exists fa_builder_outputs_file_path_unique
  on public.fa_builder_outputs (file_path);

create or replace function public.fa_builder_outputs_before_insert()
returns trigger
language plpgsql
as $$
declare
  product_org_id uuid;
  user_org_id uuid;
begin
  select product.org_id
    into product_org_id
  from public.product
  where product.product_code = new.product_code;

  if product_org_id is null then
    raise exception 'Product % does not exist', new.product_code
      using errcode = '23503';
  end if;

  if product_org_id <> new.org_id then
    raise exception 'Product % does not belong to current org', new.product_code
      using errcode = '42501';
  end if;

  select users.org_id
    into user_org_id
  from public.users
  where users.id = new.generated_by_user;

  if user_org_id is null then
    raise exception 'Generated-by user % does not exist', new.generated_by_user
      using errcode = '23503';
  end if;

  if user_org_id <> new.org_id then
    raise exception 'Generated-by user % does not belong to current org', new.generated_by_user
      using errcode = '42501';
  end if;

  update public.fa_builder_outputs
     set superseded_at = coalesce(new.generated_at, now())
   where org_id = new.org_id
     and product_code = new.product_code
     and superseded_at is null;

  return new;
end;
$$;

drop trigger if exists fa_builder_outputs_before_insert on public.fa_builder_outputs;
create trigger fa_builder_outputs_before_insert
  before insert on public.fa_builder_outputs
  for each row
  execute function public.fa_builder_outputs_before_insert();

alter table public.fa_builder_outputs enable row level security;
alter table public.fa_builder_outputs force row level security;

drop policy if exists fa_builder_outputs_org_context on public.fa_builder_outputs;
create policy fa_builder_outputs_org_context
  on public.fa_builder_outputs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.fa_builder_outputs from public;
revoke all on public.fa_builder_outputs from app_user;
grant select, insert, update, delete on public.fa_builder_outputs to app_user;

revoke all on function public.fa_builder_outputs_before_insert() from public;
grant execute on function public.fa_builder_outputs_before_insert() to app_user;
