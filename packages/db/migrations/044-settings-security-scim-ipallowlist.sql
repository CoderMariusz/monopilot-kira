-- Migration 044: Settings security repair for SCIM token CRUD and admin IP allowlist.
-- Adds the tables referenced by T-034/T-036 Server Actions with org-scoped RLS.

create table if not exists public.scim_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  scim_token_hash text not null,
  scim_token_last_four text not null check (char_length(scim_token_last_four) = 4),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz null
);

create index if not exists scim_tokens_org_created_idx
  on public.scim_tokens (org_id, created_at desc);
create index if not exists scim_tokens_last_four_active_idx
  on public.scim_tokens (scim_token_last_four)
  where revoked_at is null;

alter table public.scim_tokens enable row level security;
alter table public.scim_tokens force row level security;
drop policy if exists scim_tokens_org_context on public.scim_tokens;
create policy scim_tokens_org_context
  on public.scim_tokens
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant select, insert, update, delete on public.scim_tokens to app_user;

create table if not exists public.admin_ip_allowlist (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  cidr inet not null,
  label text null check (label is null or char_length(label) <= 120),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint admin_ip_allowlist_no_default_route
    check (cidr <> '0.0.0.0/0'::inet and cidr <> '::/0'::inet),
  constraint admin_ip_allowlist_org_cidr_unique unique (org_id, cidr)
);

create index if not exists admin_ip_allowlist_org_created_idx
  on public.admin_ip_allowlist (org_id, created_at desc);

alter table public.admin_ip_allowlist enable row level security;
alter table public.admin_ip_allowlist force row level security;
drop policy if exists admin_ip_allowlist_org_context on public.admin_ip_allowlist;
create policy admin_ip_allowlist_org_context
  on public.admin_ip_allowlist
  for all to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant select, insert, update, delete on public.admin_ip_allowlist to app_user;
