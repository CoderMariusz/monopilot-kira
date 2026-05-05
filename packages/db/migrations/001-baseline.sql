do $$
begin
  perform pg_advisory_xact_lock(hashtext('monopilot:baseline:citext'));
  create extension if not exists citext;
end $$;

create table if not exists public.tenants (
  id uuid primary key,
  name text not null,
  region_cluster text,
  data_plane_url text,
  created_at timestamptz,
  constraint tenants_region_cluster_check check (region_cluster in ('eu', 'us'))
);

alter table public.tenants
  add column if not exists region_cluster text,
  add column if not exists data_plane_url text,
  add column if not exists created_at timestamptz;

update public.tenants
set
  region_cluster = coalesce(region_cluster, 'eu'),
  data_plane_url = coalesce(data_plane_url, ''),
  created_at = coalesce(created_at, pg_catalog.now())
where region_cluster is null
  or data_plane_url is null
  or created_at is null;

alter table public.tenants
  alter column region_cluster set default 'eu',
  alter column region_cluster set not null,
  alter column data_plane_url set not null,
  alter column created_at set not null,
  alter column created_at set default pg_catalog.now();

alter table public.tenants drop constraint if exists tenants_region_cluster_check;
alter table public.tenants add constraint tenants_region_cluster_check check (region_cluster in ('eu', 'us'));

create table if not exists public.organizations (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  industry_code text,
  external_id text,
  created_at timestamptz,
  created_by_user uuid,
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id text,
  schema_version integer,
  constraint organizations_industry_code_check check (industry_code in ('bakery', 'pharma', 'fmcg', 'generic'))
);

alter table public.organizations
  add column if not exists tenant_id uuid,
  add column if not exists name text,
  add column if not exists industry_code text,
  add column if not exists external_id text,
  add column if not exists created_at timestamptz,
  add column if not exists created_by_user uuid,
  add column if not exists created_by_device text,
  add column if not exists app_version text,
  add column if not exists model_prediction_id uuid,
  add column if not exists epcis_event_id text,
  add column if not exists schema_version integer;

update public.organizations
set
  industry_code = coalesce(industry_code, 'generic'),
  created_at = coalesce(created_at, pg_catalog.now()),
  schema_version = coalesce(schema_version, 1)
where tenant_id is null
  or industry_code is null
  or created_at is null
  or schema_version is null;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.organizations
    WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Baseline migration requires organizations.tenant_id for all rows.';
  END IF;
END $$;

alter table public.organizations
  alter column name set not null,
  alter column tenant_id set not null,
  alter column industry_code set not null,
  alter column created_at set not null,
  alter column created_at set default pg_catalog.now(),
  alter column schema_version set default 1,
  alter column schema_version set not null;

alter table public.organizations drop constraint if exists organizations_industry_code_check;
alter table public.organizations add constraint organizations_industry_code_check check (industry_code in ('bakery', 'pharma', 'fmcg', 'generic'));

create index if not exists organizations_tenant_id_idx on public.organizations (tenant_id);

DO $$
DECLARE
  fk_name text;
BEGIN
  FOR fk_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.organizations'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.tenants'::regclass
  LOOP
    EXECUTE format('alter table public.organizations drop constraint %I', fk_name);
  END LOOP;

  alter table public.organizations
    add constraint organizations_tenant_id_fkey foreign key (tenant_id) references public.tenants(id);
END;
$$;

create table if not exists public.users (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  email citext,
  display_name text,
  external_id text,
  created_at timestamptz,
  created_by_user uuid,
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id text,
  schema_version integer,
  constraint users_org_id_email_unique unique (org_id, email)
);

do $$
begin
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
      AND data_type = 'text'
  ) THEN
    alter table public.users
      alter column email type citext using email::citext;
  END IF;
end $$;

alter table public.users
  alter column email set not null;

alter table public.users
  add column if not exists org_id uuid,
  add column if not exists email citext,
  add column if not exists display_name text,
  add column if not exists external_id text,
  add column if not exists created_at timestamptz,
  add column if not exists created_by_user uuid,
  add column if not exists created_by_device text,
  add column if not exists app_version text,
  add column if not exists model_prediction_id uuid,
  add column if not exists epcis_event_id text,
  add column if not exists schema_version integer;

update public.users
set
  created_at = coalesce(created_at, pg_catalog.now()),
  schema_version = coalesce(schema_version, 1)
where created_at is null
  or schema_version is null;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE org_id IS NULL
       OR email IS NULL
  ) THEN
    RAISE EXCEPTION 'Baseline migration requires users.org_id and users.email for all rows.';
  END IF;
END $$;

alter table public.users
  alter column org_id set not null,
  alter column created_at set not null,
  alter column created_at set default pg_catalog.now(),
  alter column schema_version set default 1,
  alter column schema_version set not null;

DO $$
DECLARE
  fk_name text;
BEGIN
  FOR fk_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.users'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.organizations'::regclass
  LOOP
    EXECUTE format('alter table public.users drop constraint %I', fk_name);
  END LOOP;

  alter table public.users
    add constraint users_org_id_fkey foreign key (org_id) references public.organizations(id);
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.users'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname ORDER BY cols.ordinality)
        FROM unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ordinality)
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = cols.attnum
         AND NOT a.attisdropped
      ) = ARRAY['org_id', 'email']::name[]
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_org_id_email_unique UNIQUE (org_id, email);
  END IF;
END;
$$;

create index if not exists users_org_id_idx on public.users (org_id);
