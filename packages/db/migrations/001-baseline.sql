create extension if not exists citext;

create table if not exists public.tenants (
  id uuid primary key,
  name text not null,
  region_cluster text not null,
  data_plane_url text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint tenants_region_cluster_check check (region_cluster in ('eu', 'us'))
);

create table if not exists public.organizations (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  industry_code text not null,
  external_id text,
  created_at timestamptz not null default pg_catalog.now(),
  created_by_user uuid,
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id text,
  schema_version integer not null default 1,
  constraint organizations_industry_code_check check (industry_code in ('bakery', 'pharma', 'fmcg', 'generic'))
);

create table if not exists public.users (
  id uuid primary key,
  org_id uuid not null references public.organizations(id),
  email citext not null,
  display_name text,
  external_id text,
  created_at timestamptz not null default pg_catalog.now(),
  created_by_user uuid,
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id text,
  schema_version integer not null default 1,
  constraint users_org_id_email_unique unique (org_id, email)
);

create index if not exists organizations_tenant_id_idx on public.organizations (tenant_id);
create index if not exists users_org_id_idx on public.users (org_id);
