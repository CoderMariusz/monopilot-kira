-- Migration 270: per-organization document numbering and archive settings.
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().

create table if not exists public.org_document_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_type text not null check (doc_type in ('po', 'to', 'wo')),
  number_prefix text not null,
  number_date_part text not null default 'YYYYMM' check (number_date_part in ('none', 'YYYY', 'YYYYMM', 'YYYYMMDD')),
  number_seq_padding int not null default 4 check (number_seq_padding between 3 and 8),
  next_seq bigint not null default 1,
  archive_after_days int null check (archive_after_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references public.users(id) on delete set null,
  updated_by uuid null references public.users(id) on delete set null,
  constraint org_document_settings_org_doc_type_unique unique (org_id, doc_type)
);

create index if not exists org_document_settings_org_idx
  on public.org_document_settings (org_id);

alter table public.org_document_settings enable row level security;
alter table public.org_document_settings force row level security;

drop policy if exists org_document_settings_org_context on public.org_document_settings;
create policy org_document_settings_org_context
  on public.org_document_settings
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.org_document_settings from public;
revoke all on public.org_document_settings from app_user;
grant select, insert, update, delete on public.org_document_settings to app_user;

create or replace function public.org_document_settings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists org_document_settings_set_updated_at on public.org_document_settings;
create trigger org_document_settings_set_updated_at
  before update on public.org_document_settings
  for each row execute function public.org_document_settings_set_updated_at();

insert into public.org_document_settings
  (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
select o.id, defaults.doc_type, defaults.number_prefix, 'YYYYMM', 4, 30
from public.organizations o
cross join (values
  ('po', 'PO'),
  ('to', 'TO'),
  ('wo', 'WO')
) as defaults(doc_type, number_prefix)
where not exists (
  select 1
  from public.org_document_settings existing
  where existing.org_id = o.id
    and existing.doc_type = defaults.doc_type
);

create or replace function public.seed_org_document_settings_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.org_document_settings
    (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
  select p_org_id, defaults.doc_type, defaults.number_prefix, 'YYYYMM', 4, 30
  from (values
    ('po', 'PO'),
    ('to', 'TO'),
    ('wo', 'WO')
  ) as defaults(doc_type, number_prefix)
  where not exists (
    select 1
    from public.org_document_settings existing
    where existing.org_id = p_org_id
      and existing.doc_type = defaults.doc_type
  );
end;
$$;

revoke all on function public.seed_org_document_settings_for_org(uuid) from public;
revoke all on function public.seed_org_document_settings_for_org(uuid) from app_user;

create or replace function public.seed_org_document_settings_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  perform public.seed_org_document_settings_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_org_document_settings_on_org_insert() from public;
revoke all on function public.seed_org_document_settings_on_org_insert() from app_user;

drop trigger if exists trg_zzz_seed_org_document_settings on public.organizations;
create trigger trg_zzz_seed_org_document_settings
  after insert on public.organizations
  for each row
  execute function public.seed_org_document_settings_on_org_insert();
