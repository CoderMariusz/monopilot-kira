-- T-108: restore legacy tenant_migrations.tenant_id referential integrity.
-- T-038 intentionally deferred this FK to the app layer. T-039 is now verified,
-- so the legacy canary-orchestration table may enforce tenant_id -> tenants(id).

do $$
declare
  target_table regclass;
  orphan_count bigint;
begin
  if to_regclass('public.tenant_migrations_legacy_t038') is not null then
    target_table := 'public.tenant_migrations_legacy_t038'::regclass;
  elsif to_regclass('public.tenant_migrations') is not null and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_migrations'
      and column_name = 'tenant_id'
  ) then
    target_table := 'public.tenant_migrations'::regclass;
  else
    target_table := null;
  end if;

  if target_table is null then
    return;
  end if;

  execute format(
    'delete from %s tenant_migration
      where not exists (
        select 1
        from public.tenants tenant
        where tenant.id = tenant_migration.tenant_id
      )',
    target_table
  );

  execute format(
    'select count(*)
      from %s tenant_migration
      left join public.tenants tenant on tenant.id = tenant_migration.tenant_id
      where tenant.id is null',
    target_table
  )
  into orphan_count;

  if orphan_count <> 0 then
    raise exception 'tenant_migrations FK restore pre-flight found % orphan rows', orphan_count
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_migrations_tenant_id_fkey'
      and conrelid = target_table
  ) then
    execute format(
      'alter table %s
        add constraint tenant_migrations_tenant_id_fkey
        foreign key (tenant_id) references public.tenants(id) on delete restrict',
      target_table
    );
  end if;
end $$;

