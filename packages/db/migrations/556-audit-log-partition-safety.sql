-- Migration 556: keep audit_log writable beyond 2026.
--
-- Strategy:
--   * keep monthly partitions from the current month through 24 months ahead;
--   * renew that window daily through the repo's existing guarded pg_cron pattern;
--   * retain a DEFAULT partition as the fail-safe if scheduling ever stops;
--   * when renewal resumes, move matching DEFAULT rows into the new month before ATTACH.

create table if not exists public.audit_log_default
  partition of public.audit_log default;

alter table public.audit_log_default enable row level security;
alter table public.audit_log_default force row level security;
revoke all on public.audit_log_default from public, anon, authenticated;

-- Istniejąca funkcja ma parametr `n`; `create or replace` NIE POZWALA zmienić nazwy parametru
-- ("cannot change name of input parameter"). Trzeba ją najpierw usunąć.
drop function if exists public.audit_log_create_partitions(integer);

create or replace function public.audit_log_create_partitions(months_ahead integer)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_month date := date_trunc('month', current_date)::date;
  partition_start date;
  partition_end date;
  partition_name text;
  partition_constraint_name text;
  partition_relation regclass;
  default_relation regclass := to_regclass('public.audit_log_default');
  moved_rows integer;
begin
  if months_ahead is null or months_ahead < 1 then
    raise exception 'months_ahead must be positive' using errcode = '22023';
  end if;

  -- Serialise maintenance callers without locking business inserts when the
  -- complete rolling window already exists.
  perform pg_advisory_xact_lock(hashtext('public.audit_log_create_partitions')::bigint);

  for month_offset in 0..months_ahead loop
    partition_start := (current_month + make_interval(months => month_offset))::date;
    partition_end := (partition_start + interval '1 month')::date;
    partition_name := 'audit_log_' || to_char(partition_start, 'YYYY_MM');
    partition_constraint_name := partition_name || '_occurred_at_bounds';
    partition_relation := to_regclass('public.' || partition_name);

    if partition_relation is not null then
      if exists (
        select 1
          from pg_inherits
         where inhparent = 'public.audit_log'::regclass
           and inhrelid = partition_relation
      ) then
        continue;
      end if;

      raise exception 'relation public.% exists but is not an audit_log partition', partition_name
        using errcode = '42P07';
    end if;

    -- CREATE/ATTACH needs an ACCESS EXCLUSIVE parent lock. It is taken only
    -- when a month is missing; the daily steady-state call takes no table lock.
    lock table public.audit_log in access exclusive mode;

    -- Re-check after the lock in case another DDL path created the partition.
    partition_relation := to_regclass('public.' || partition_name);
    if partition_relation is not null then
      if exists (
        select 1
          from pg_inherits
         where inhparent = 'public.audit_log'::regclass
           and inhrelid = partition_relation
      ) then
        continue;
      end if;

      raise exception 'relation public.% exists but is not an audit_log partition', partition_name
        using errcode = '42P07';
    end if;

    if default_relation is null then
      execute format(
        'create table public.%I partition of public.audit_log for values from (%L) to (%L)',
        partition_name,
        partition_start,
        partition_end
      );
      moved_rows := 0;
    else
      -- A DEFAULT row overlapping a new bound makes ATTACH fail. Build the
      -- child standalone, move that month's rows transactionally, then attach.
      execute format(
        'create table public.%I (like public.audit_log including all)',
        partition_name
      );
      execute format(
        'alter table public.%I add constraint %I check (occurred_at >= %L::timestamptz and occurred_at < %L::timestamptz)',
        partition_name,
        partition_constraint_name,
        partition_start,
        partition_end
      );

      -- Child partitions are FORCE-RLS with no direct policies. Temporarily
      -- disable RLS under the parent lock so the definer can re-home rows.
      execute 'alter table public.audit_log_default disable row level security';
      execute format(
        'insert into public.%I select * from public.audit_log_default where occurred_at >= %L::timestamptz and occurred_at < %L::timestamptz',
        partition_name,
        partition_start,
        partition_end
      );
      get diagnostics moved_rows = row_count;
      execute format(
        'delete from public.audit_log_default where occurred_at >= %L::timestamptz and occurred_at < %L::timestamptz',
        partition_start,
        partition_end
      );
      execute 'alter table public.audit_log_default enable row level security';
      execute 'alter table public.audit_log_default force row level security';

      execute format(
        'alter table public.audit_log attach partition public.%I for values from (%L) to (%L)',
        partition_name,
        partition_start,
        partition_end
      );
    end if;

    execute format('alter table public.%I enable row level security', partition_name);
    execute format('alter table public.%I force row level security', partition_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      partition_name
    );

    raise notice 'audit_log partition created: %, moved_from_default=%',
      partition_name,
      moved_rows;
  end loop;
end;
$$;

revoke all on function public.audit_log_create_partitions(integer) from public;
comment on function public.audit_log_create_partitions(integer) is
  'Create audit_log monthly partitions from the current month through months_ahead, re-homing any overlapping DEFAULT rows before ATTACH.';

-- Twenty-four full months of lead time. If both cron and operator maintenance
-- stop beyond that window, audit_log_default remains writable indefinitely.
select public.audit_log_create_partitions(24);

-- Reuse the established guarded pg_cron mechanism from migrations 034/036.
-- Local/CI Postgres without pg_cron keeps the DEFAULT safety net and can invoke
-- audit_log_create_partitions(24) manually.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'audit_log_partition_maintenance_daily',
      '17 2 * * *',
      $cron$ select public.audit_log_create_partitions(24); $cron$
    );
  end if;
end
$$;

-- Executable post-check: route one row dated next year and one row dated now,
-- prove both hit their monthly partitions (never DEFAULT), then remove both.
do $$
declare
  probe_org_id uuid;
  future_probe_id uuid := gen_random_uuid();
  current_probe_id uuid := gen_random_uuid();
  future_at timestamptz := date_trunc('year', current_date) + interval '1 year' + interval '14 days 12 hours';
  current_at timestamptz := pg_catalog.now();
  future_partition regclass;
  current_partition regclass;
  expected_future_partition regclass;
  expected_current_partition regclass;
  default_partition regclass := to_regclass('public.audit_log_default');
  cleaned_rows integer;
begin
  select id
    into probe_org_id
    from public.organizations
   order by created_at nulls last, id
   limit 1;

  if probe_org_id is null then
    raise exception 'audit_log partition post-check requires one organization row';
  end if;

  insert into public.audit_log
    (id, org_id, occurred_at, actor_type, action, resource_type, resource_id, retention_class)
  values
    (future_probe_id, probe_org_id, future_at, 'system', 'audit.partition.probe', 'migration', '556-future', 'ephemeral')
  returning tableoid into future_partition;

  insert into public.audit_log
    (id, org_id, occurred_at, actor_type, action, resource_type, resource_id, retention_class)
  values
    (current_probe_id, probe_org_id, current_at, 'system', 'audit.partition.probe', 'migration', '556-current', 'ephemeral')
  returning tableoid into current_partition;

  delete from public.audit_log
   where (id = future_probe_id and occurred_at = future_at)
      or (id = current_probe_id and occurred_at = current_at);
  get diagnostics cleaned_rows = row_count;

  expected_future_partition := to_regclass(
    'public.audit_log_' || to_char(future_at, 'YYYY_MM')
  );
  expected_current_partition := to_regclass(
    'public.audit_log_' || to_char(current_at, 'YYYY_MM')
  );

  if future_partition is distinct from expected_future_partition
     or future_partition is not distinct from default_partition then
    raise exception 'future audit probe routed to %, expected %',
      future_partition,
      expected_future_partition;
  end if;

  if current_partition is distinct from expected_current_partition
     or current_partition is not distinct from default_partition then
    raise exception 'current audit probe routed to %, expected %',
      current_partition,
      expected_current_partition;
  end if;

  if cleaned_rows <> 2 then
    raise exception 'audit partition post-check cleanup removed % rows, expected 2',
      cleaned_rows;
  end if;

  raise notice
    'audit_log post-check: future_at=%, future_partition=%, current_at=%, current_partition=%, cleaned_rows=%',
    future_at,
    future_partition,
    current_at,
    current_partition,
    cleaned_rows;
end
$$;
