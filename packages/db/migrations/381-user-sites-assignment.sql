-- Migration 381 — user_sites: per-user site assignment (foundation for security-scoped visibility).
--
-- Owner 2026-06-28: each user gets assigned site(s); for security they may only see/select data for their
-- assigned site(s) (today the top-bar active site is chosen freely from ALL org sites). This table is the
-- assignment STORE. It changes NO behaviour on its own — later slices (getUserSites picker filter, hardened
-- setActiveSite, assertUserSiteAccess) read it. Until a user has rows here the enforcement lib degrades to
-- all-org-sites (0 rows = unrestricted), so all existing users are unaffected (opt-in per user).
--
-- Multi-site JOIN table (not a single users.primary_site_id) per owner intent + scout recommendation: a
-- factory operator is usually one site, but planners/QA cover several and admins all — the join table covers
-- all three with no NULL-means-all ambiguity. Mirrors the user_roles pattern (mig 017): bare org_id
-- (denormalised so the org-scoped RLS policy is a direct equality, no join), composite PK, ENABLE+FORCE RLS,
-- app_user DML grant. assigned_at/assigned_by are audit breadcrumbs.

create table if not exists public.user_sites (
  user_id     uuid        not null references public.users(id) on delete cascade,
  site_id     uuid        not null references public.sites(id) on delete cascade,
  org_id      uuid        not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid        references public.users(id) on delete set null,
  primary key (user_id, site_id)
);

create index if not exists user_sites_user_idx on public.user_sites (user_id, org_id);
create index if not exists user_sites_site_idx on public.user_sites (site_id, org_id);

alter table public.user_sites enable row level security;
alter table public.user_sites force row level security;

drop policy if exists user_sites_org_context on public.user_sites;
create policy user_sites_org_context
  on public.user_sites
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant select, insert, update, delete on public.user_sites to app_user;
