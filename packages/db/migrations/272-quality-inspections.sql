-- Migration 272: 09-Quality — quality inspections backend.
-- Wave0 lock: org_id is the business scope; RLS uses app.current_org_id().

alter table public.org_document_settings
  drop constraint if exists org_document_settings_doc_type_check;

alter table public.org_document_settings
  add constraint org_document_settings_doc_type_check
  check (doc_type in ('po', 'to', 'wo', 'insp'));

insert into public.org_document_settings
  (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
select o.id, 'insp', 'INSP', 'none', 8, 30
from public.organizations o
where not exists (
  select 1
  from public.org_document_settings existing
  where existing.org_id = o.id
    and existing.doc_type = 'insp'
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
  select p_org_id, defaults.doc_type, defaults.number_prefix, defaults.number_date_part, defaults.number_seq_padding, 30
  from (values
    ('po', 'PO', 'YYYYMM', 4),
    ('to', 'TO', 'YYYYMM', 4),
    ('wo', 'WO', 'YYYYMM', 4),
    ('insp', 'INSP', 'none', 8)
  ) as defaults(doc_type, number_prefix, number_date_part, number_seq_padding)
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

-- PARITY REFERENCE (review fix F10): this allocator duplicates the
-- org_document_settings sequence logic implemented in TypeScript at
-- apps/web/lib/documents/numbering.ts (doc types po/to/wo). If the numbering
-- contract changes there (prefix/date-part/padding composition, seed-on-miss
-- behaviour), mirror the change here — and vice versa.
create or replace function public.next_quality_inspection_number(p_org_id uuid)
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_current_org_id uuid;
  v_old_seq bigint;
  v_prefix text;
  v_date_part text;
  v_padding integer;
  v_formatted_date text;
begin
  v_current_org_id := app.current_org_id();

  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22004';
  end if;

  if v_current_org_id is null or v_current_org_id <> p_org_id then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  update public.org_document_settings
     set next_seq = next_seq + 1
   where org_id = p_org_id
     and doc_type = 'insp'
   returning next_seq - 1, number_prefix, number_date_part, number_seq_padding
    into v_old_seq, v_prefix, v_date_part, v_padding;

  if v_old_seq is null then
    insert into public.org_document_settings
      (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
    values (p_org_id, 'insp', 'INSP', 'none', 8, 30)
    on conflict (org_id, doc_type) do nothing;

    update public.org_document_settings
       set next_seq = next_seq + 1
     where org_id = p_org_id
       and doc_type = 'insp'
     returning next_seq - 1, number_prefix, number_date_part, number_seq_padding
      into v_old_seq, v_prefix, v_date_part, v_padding;
  end if;

  if v_old_seq is null then
    raise exception 'document_number_settings_missing:insp'
      using errcode = 'P0001';
  end if;

  v_formatted_date := case v_date_part
    when 'YYYY' then to_char(pg_catalog.now(), 'YYYY')
    when 'YYYYMM' then to_char(pg_catalog.now(), 'YYYYMM')
    when 'YYYYMMDD' then to_char(pg_catalog.now(), 'YYYYMMDD')
    else null
  end;

  return array_to_string(
    array_remove(array[v_prefix, v_formatted_date, lpad(v_old_seq::text, v_padding, '0')], null),
    '-'
  );
end;
$$;

revoke all on function public.next_quality_inspection_number(uuid) from public;
grant execute on function public.next_quality_inspection_number(uuid) to app_user;

create table if not exists public.quality_inspections (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  inspection_number text not null,
  reference_type    text not null,
  reference_id      uuid not null,
  product_id        uuid,
  status            text not null default 'pending',
  assigned_to       uuid references public.users(id) on delete set null,
  due_date          date,
  parameters        jsonb not null default '[]'::jsonb,
  result_notes      text,
  decided_by        uuid references public.users(id) on delete set null,
  decided_at        timestamptz,
  signature_hash    text,
  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now(),

  constraint quality_inspections_org_number_uq unique (org_id, inspection_number),
  constraint quality_inspections_reference_type_check check (
    reference_type in ('lp', 'grn', 'wo_output')
  ),
  constraint quality_inspections_status_check check (
    status in ('pending', 'in_progress', 'passed', 'failed', 'on_hold', 'cancelled')
  ),
  constraint quality_inspections_parameters_array_check check (jsonb_typeof(parameters) = 'array')
);

create index if not exists quality_inspections_org_status_idx
  on public.quality_inspections (org_id, status);
create index if not exists quality_inspections_org_reference_idx
  on public.quality_inspections (org_id, reference_type, reference_id);

alter table public.quality_inspections enable row level security;
alter table public.quality_inspections force row level security;

drop policy if exists quality_inspections_org_context on public.quality_inspections;
create policy quality_inspections_org_context
  on public.quality_inspections
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.quality_inspections from public;
revoke all on public.quality_inspections from app_user;
grant select, insert, update, delete on public.quality_inspections to app_user;

create or replace function public.quality_inspections_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists quality_inspections_set_updated_at on public.quality_inspections;
create trigger quality_inspections_set_updated_at
  before update on public.quality_inspections
  for each row execute function public.quality_inspections_set_updated_at();
