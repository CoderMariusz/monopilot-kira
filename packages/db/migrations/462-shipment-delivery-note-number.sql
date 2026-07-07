-- 462: stable delivery-note / packing-list number on shipments (C7c printable document).
-- Wave0 lock: org_id scope; numbers minted via org_document_settings doc_type 'dn'.

alter table public.shipments
  add column if not exists delivery_note_number text;

alter table public.org_document_settings
  drop constraint if exists org_document_settings_doc_type_check;

alter table public.org_document_settings
  add constraint org_document_settings_doc_type_check
  check (doc_type in ('po','to','wo','insp','so','fg','wip','lp','rm','ing','grn','dn'));

insert into public.org_document_settings
  (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
select o.id, 'dn', 'DN', 'YYYYMM', 5, 30
from public.organizations o
where not exists (
  select 1
  from public.org_document_settings existing
  where existing.org_id = o.id
    and existing.doc_type = 'dn'
);

create or replace function public.seed_org_document_settings_for_org(p_org_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog' as $function$
begin
  insert into public.org_document_settings
    (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days, code_mask)
  select p_org_id, d.doc_type, d.number_prefix, d.number_date_part, d.number_seq_padding, 30, d.code_mask
  from (values
    ('po','PO','YYYYMM',4, null::text),
    ('to','TO','YYYYMM',4, null),
    ('wo','WO','YYYYMM',4, null),
    ('insp','INSP','none',8, null),
    ('so','SO','YYYYMM',5, null),
    ('fg','FG','none',4, 'FGxxxx'),
    ('wip','WIP','none',4, 'WIP-[DATE]-xxxx'),
    ('lp','LP','none',4, 'LP-[DATE]-xxxx'),
    ('rm','RM','none',4, 'RMxxxx'),
    ('ing','ING','none',4, 'INGxxxx'),
    ('grn','GRN','none',4, 'GRN-[DATE]-xxxx'),
    ('dn','DN','YYYYMM',5, null)
  ) as d(doc_type, number_prefix, number_date_part, number_seq_padding, code_mask)
  where not exists (select 1 from public.org_document_settings e where e.org_id=p_org_id and e.doc_type=d.doc_type);
end; $function$;

create or replace function public.next_delivery_note_number(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_old_seq bigint;
  v_prefix text;
  v_date_part text;
  v_padding integer;
  v_formatted_date text;
begin
  if p_org_id is null then
    raise exception 'org_id is required' using errcode = '22004';
  end if;

  update public.org_document_settings
     set next_seq = next_seq + 1
   where org_id = p_org_id
     and doc_type = 'dn'
   returning next_seq - 1, number_prefix, number_date_part, number_seq_padding
    into v_old_seq, v_prefix, v_date_part, v_padding;

  if v_old_seq is null then
    insert into public.org_document_settings
      (org_id, doc_type, number_prefix, number_date_part, number_seq_padding, archive_after_days)
    values (p_org_id, 'dn', 'DN', 'YYYYMM', 5, 30)
    on conflict (org_id, doc_type) do nothing;

    update public.org_document_settings
       set next_seq = next_seq + 1
     where org_id = p_org_id
       and doc_type = 'dn'
     returning next_seq - 1, number_prefix, number_date_part, number_seq_padding
      into v_old_seq, v_prefix, v_date_part, v_padding;
  end if;

  if v_old_seq is null then
    raise exception 'document_number_settings_missing:dn' using errcode = 'P0001';
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

revoke all on function public.next_delivery_note_number(uuid) from public;
grant execute on function public.next_delivery_note_number(uuid) to app_user;

create or replace function public.shipping_set_delivery_note_number()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.delivery_note_number is null then
    new.delivery_note_number := public.next_delivery_note_number(new.org_id);
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_set_delivery_note_number on public.shipments;
create trigger shipments_set_delivery_note_number
  before insert on public.shipments
  for each row execute function public.shipping_set_delivery_note_number();

create unique index if not exists shipments_org_delivery_note_number_uq
  on public.shipments (org_id, delivery_note_number)
  where delivery_note_number is not null and deleted_at is null;

-- Backfill existing shipments (idempotent: only rows still missing a number).
do $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select id, org_id
      from public.shipments
     where delivery_note_number is null
       and deleted_at is null
     order by created_at, id
  loop
    update public.shipments
       set delivery_note_number = public.next_delivery_note_number(r.org_id)
     where id = r.id;
    v_count := v_count + 1;
  end loop;
  raise notice '462-shipment-delivery-note-number: backfilled % shipment(s)', v_count;
end;
$$;
