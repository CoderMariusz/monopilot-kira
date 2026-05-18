-- Migration 043: settings audit_log monthly partitioning (ADR-008 / PRD §5.6)
-- Scope: partitioned audit_log parent with 7-year detach-only retention helper.

create table if not exists public.audit_log (
  id               uuid         not null default gen_random_uuid(),
  org_id           uuid         not null references public.organizations(id) on delete cascade,
  occurred_at      timestamptz  not null default pg_catalog.now(),
  actor_user_id    uuid         references public.users(id) on delete set null,
  actor_type       text,
  action           text         not null,
  resource_type    text         not null,
  resource_id      text         not null,
  before_state     jsonb,
  after_state      jsonb,
  request_id       uuid,
  retention_class  text         not null default 'standard',
  constraint audit_log_pk primary key (id, occurred_at),
  constraint audit_log_actor_type_check check (
    actor_type is null or actor_type in ('user', 'system', 'scim', 'impersonation')
  ),
  constraint audit_log_retention_class_check check (
    retention_class in ('security', 'standard', 'operational', 'ephemeral')
  )
) partition by range (occurred_at);

create index if not exists audit_log_org_occurred_idx
  on public.audit_log (org_id, occurred_at);

create index if not exists audit_log_request_id_idx
  on public.audit_log (request_id);

create index if not exists audit_log_resource_idx
  on public.audit_log (resource_type, resource_id, occurred_at);

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

drop policy if exists audit_log_org_context on public.audit_log;
create policy audit_log_org_context
  on public.audit_log
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.audit_log from public;
grant select, insert on public.audit_log to app_user;

create or replace function public.audit_log_create_partitions(n integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  start_month date := date_trunc('year', current_date)::date;
  partition_start date;
  partition_end date;
  partition_name text;
begin
  if n is null or n < 1 then
    raise exception 'partition count must be positive' using errcode = '22023';
  end if;

  for month_offset in 0..(n - 1) loop
    partition_start := (start_month + (month_offset || ' months')::interval)::date;
    partition_end := (partition_start + interval '1 month')::date;
    partition_name := 'audit_log_' || to_char(partition_start, 'YYYY_MM');

    execute format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
      partition_name,
      partition_start,
      partition_end
    );
  end loop;
end;
$$;

revoke all on function public.audit_log_create_partitions(integer) from public;

select public.audit_log_create_partitions(12);

create or replace function public.audit_log_detach_old(months integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  retention_months integer := months;
  cutoff_month date;
  partition_record record;
  partition_month date;
  detached_count integer := 0;
begin
  if retention_months is null or retention_months < 1 then
    raise exception 'retention window must be positive' using errcode = '22023';
  end if;

  cutoff_month := (date_trunc('month', current_date)::date - (retention_months || ' months')::interval)::date;

  for partition_record in
    select namespace.nspname as schema_name, child.relname as table_name
      from pg_inherits inheritance
      join pg_class child on child.oid = inheritance.inhrelid
      join pg_namespace namespace on namespace.oid = child.relnamespace
     where inheritance.inhparent = 'public.audit_log'::regclass
       and namespace.nspname = 'public'
       and child.relname ~ '^audit_log_[0-9]{4}_(0[1-9]|1[0-2])$'
     order by child.relname
  loop
    partition_month := to_date(substring(partition_record.table_name from 'audit_log_([0-9]{4}_[0-9]{2})'), 'YYYY_MM');

    if partition_month < cutoff_month then
      execute format(
        'ALTER TABLE public.audit_log DETACH PARTITION %I.%I',
        partition_record.schema_name,
        partition_record.table_name
      );
      detached_count := detached_count + 1;
    end if;
  end loop;

  return detached_count;
end;
$$;

revoke all on function public.audit_log_detach_old(integer) from public;
comment on function public.audit_log_detach_old(integer) is 'Detach audit_log monthly partitions older than the supplied number of months; invoke with 84 for 7-year retention.';
