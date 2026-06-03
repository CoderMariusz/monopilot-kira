-- T-104 — org-scoped 7-digit short-code sequence.
-- Wave0: org_id is the business scope; RLS uses app.current_org_id().

create table if not exists public.org_sequences (
  org_id uuid not null references public.organizations(id) on delete cascade,
  seq_name text not null,
  current_value bigint not null default 0,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint org_sequences_current_value_check
    check (current_value >= 0 and current_value <= 9999999),
  constraint org_sequences_seq_name_not_blank_check
    check (length(pg_catalog.btrim(seq_name)) > 0),
  primary key (org_id, seq_name)
);

create index if not exists org_sequences_org_id_idx
  on public.org_sequences (org_id);

alter table public.org_sequences enable row level security;
alter table public.org_sequences force row level security;

drop policy if exists org_sequences_org_context on public.org_sequences;
create policy org_sequences_org_context
  on public.org_sequences
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant select, insert, update on public.org_sequences to app_user;

create or replace function app.app_next_seq_7(p_org_id uuid, p_seq_name text default 'short_codes')
returns text
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_current_org_id uuid;
  v_seq_name text;
  v_next bigint;
begin
  v_current_org_id := app.current_org_id();
  v_seq_name := pg_catalog.btrim(p_seq_name);

  if p_org_id is null then
    raise exception 'org_id is required'
      using errcode = '22004';
  end if;

  if v_current_org_id is null or v_current_org_id <> p_org_id then
    raise exception 'invalid organization context'
      using errcode = '28000';
  end if;

  if v_seq_name is null or v_seq_name = '' then
    raise exception 'sequence name is required'
      using errcode = '22004';
  end if;

  insert into public.org_sequences (org_id, seq_name, current_value, updated_at)
  values (p_org_id, v_seq_name, 1, pg_catalog.now())
  on conflict (org_id, seq_name) do update
    set current_value = public.org_sequences.current_value + 1,
        updated_at = pg_catalog.now()
    where public.org_sequences.current_value < 9999999
  returning current_value into v_next;

  if v_next is null then
    raise exception 'sequence exhausted for org_id %, seq_name %', p_org_id, v_seq_name
      using errcode = '2200H';
  end if;

  return pg_catalog.lpad(v_next::text, 7, '0');
end;
$$;

revoke all on function app.app_next_seq_7(uuid, text) from public;
grant execute on function app.app_next_seq_7(uuid, text) to app_user;
