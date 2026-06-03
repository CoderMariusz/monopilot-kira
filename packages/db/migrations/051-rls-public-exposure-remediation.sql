-- T-129 / SEC-RLS: close Supabase public-schema RLS exposure findings.
-- Wave0 lock: org_id is the business scope; policies call app.current_org_id().

-- Org-scoped public tables: keep app_user access, enforce org context, and
-- remove anon/authenticated PostgREST SELECT exposure.
do $$
begin
  if to_regclass('public.tenant_variations') is not null then
    alter table public.tenant_variations enable row level security;
    alter table public.tenant_variations force row level security;

    drop policy if exists tenant_variations_org_context on public.tenant_variations;
    create policy tenant_variations_org_context
      on public.tenant_variations
      for all
      to app_user
      using (org_id = app.current_org_id())
      with check (org_id = app.current_org_id());

    revoke select on public.tenant_variations from public, anon, authenticated;
    grant select, insert, update, delete on public.tenant_variations to app_user;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.consumed_approval_tokens') is not null then
    alter table public.consumed_approval_tokens enable row level security;
    alter table public.consumed_approval_tokens force row level security;

    drop policy if exists consumed_approval_tokens_org_context on public.consumed_approval_tokens;
    create policy consumed_approval_tokens_org_context
      on public.consumed_approval_tokens
      for all
      to app_user
      using (org_id = app.current_org_id())
      with check (org_id = app.current_org_id());

    revoke select on public.consumed_approval_tokens from public, anon, authenticated;
    grant select, insert, update, delete on public.consumed_approval_tokens to app_user;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.tenant_migrations') is not null then
    alter table public.tenant_migrations enable row level security;
    alter table public.tenant_migrations force row level security;

    drop policy if exists tenant_migrations_org_context on public.tenant_migrations;
    create policy tenant_migrations_org_context
      on public.tenant_migrations
      for all
      to app_user
      using (org_id = app.current_org_id())
      with check (org_id = app.current_org_id());

    revoke select on public.tenant_migrations from public, anon, authenticated;
    grant select, insert, update, delete on public.tenant_migrations to app_user;
  end if;
end
$$;

-- Global/reference tables: RLS as defense in depth, no anon/authenticated
-- PostgREST grants. app_user keeps the server-side access path verified by T-129.
do $$
begin
  if to_regclass('public.modules') is not null then
    alter table public.modules enable row level security;
    alter table public.modules force row level security;

    drop policy if exists modules_app_user_read on public.modules;
    create policy modules_app_user_read
      on public.modules
      for select
      to app_user
      using (true);

    revoke select on public.modules from public, anon, authenticated;
    grant select on public.modules to app_user;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.allergens') is not null then
    alter table public.allergens enable row level security;
    alter table public.allergens force row level security;

    drop policy if exists allergens_app_user_read on public.allergens;
    create policy allergens_app_user_read
      on public.allergens
      for select
      to app_user
      using (true);

    revoke select on public.allergens from public, anon, authenticated;
    grant select on public.allergens to app_user;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.line_machines') is not null then
    alter table public.line_machines enable row level security;
    alter table public.line_machines force row level security;

    drop policy if exists line_machines_app_user_access on public.line_machines;
    create policy line_machines_app_user_access
      on public.line_machines
      for all
      to app_user
      using (true)
      with check (true);

    revoke select on public.line_machines from public, anon, authenticated;
    grant select, insert, update, delete on public.line_machines to app_user;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.role_categories') is not null then
    alter table public.role_categories enable row level security;
    alter table public.role_categories force row level security;

    drop policy if exists role_categories_app_user_read on public.role_categories;
    create policy role_categories_app_user_read
      on public.role_categories
      for select
      to app_user
      using (true);

    revoke select on public.role_categories from public, anon, authenticated;
    grant select on public.role_categories to app_user;
  end if;
end
$$;

-- Legacy/internal tables: enable + force RLS and remove anon/authenticated reads.
do $$
begin
  if to_regclass('public.tenant_migrations_legacy_t038') is not null then
    alter table public.tenant_migrations_legacy_t038 enable row level security;
    alter table public.tenant_migrations_legacy_t038 force row level security;
    revoke select on public.tenant_migrations_legacy_t038 from public, anon, authenticated;
  end if;
end
$$;

alter table if exists public.audit_log enable row level security;
alter table if exists public.audit_log force row level security;
revoke select on public.audit_log from public, anon, authenticated;

do $$
declare
  partition_name text;
begin
  foreach partition_name in array array[
    'audit_log_2026_01',
    'audit_log_2026_02',
    'audit_log_2026_03',
    'audit_log_2026_04',
    'audit_log_2026_05',
    'audit_log_2026_06',
    'audit_log_2026_07',
    'audit_log_2026_08',
    'audit_log_2026_09',
    'audit_log_2026_10',
    'audit_log_2026_11',
    'audit_log_2026_12'
  ]
  loop
    if to_regclass('public.' || partition_name) is not null then
      execute format('alter table public.%I enable row level security', partition_name);
      execute format('alter table public.%I force row level security', partition_name);
      execute format('revoke select on public.%I from public, anon, authenticated', partition_name);
    end if;
  end loop;
end
$$;

-- Explicit control-plane policies for advisor 0008 rls_enabled_no_policy.
do $$
begin
  if to_regclass('public.tenants') is not null then
    alter table public.tenants enable row level security;
    alter table public.tenants force row level security;

    drop policy if exists tenants_current_org_context on public.tenants;
    create policy tenants_current_org_context
      on public.tenants
      for all
      to app_user
      using (
        exists (
          select 1
          from public.organizations org
          where org.tenant_id = public.tenants.id
            and org.id = app.current_org_id()
        )
      )
      with check (
        exists (
          select 1
          from public.organizations org
          where org.tenant_id = public.tenants.id
            and org.id = app.current_org_id()
        )
      );
  end if;
end
$$;

do $$
begin
  if to_regclass('public.tenant_idp_config') is not null then
    alter table public.tenant_idp_config enable row level security;
    alter table public.tenant_idp_config force row level security;

    drop policy if exists tenant_idp_config_current_org_context on public.tenant_idp_config;
    create policy tenant_idp_config_current_org_context
      on public.tenant_idp_config
      for all
      to app_user
      using (
        exists (
          select 1
          from public.organizations org
          where org.tenant_id = public.tenant_idp_config.tenant_id
            and org.id = app.current_org_id()
        )
      )
      with check (
        exists (
          select 1
          from public.organizations org
          where org.tenant_id = public.tenant_idp_config.tenant_id
            and org.id = app.current_org_id()
        )
      );
  end if;
end
$$;

-- Lock down public SECURITY DEFINER functions identified by Supabase advisors.
do $$
declare
  fn record;
begin
  for fn in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'audit_events_impersonation_guard',
        'audit_log_create_partitions',
        'audit_log_detach_old',
        'prune_audit_events',
        'prune_consumed_approval_tokens',
        'prune_reference_csv_import_reports',
        'seed_reference_data_on_org_insert',
        'seed_system_roles_on_org_insert',
        'seed_tenant_idp_config',
        'touch_updated_at',
        'set_user_pins_updated_at'
      )
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      fn.schema_name,
      fn.function_name,
      fn.identity_arguments
    );
  end loop;
end
$$;

do $$
begin
  if to_regprocedure('public.set_user_pins_updated_at()') is not null then
    alter function public.set_user_pins_updated_at() set search_path = pg_catalog;
  end if;
end $$;
