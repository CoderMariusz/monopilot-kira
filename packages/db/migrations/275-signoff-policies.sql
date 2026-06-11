-- 275-signoff-policies.sql
-- Wave 8a / Lane K4 (A) — configurable e-signature policies per signoff type.
--
-- Roles are a plain FK-able table (public.roles: id uuid pk, org_id, code, name —
-- migration 037-settings-core.sql), so first/second signer roles are real uuid
-- FKs to public.roles(id) with ON DELETE SET NULL (deleting a role must not drop
-- the policy, only blank the signer slot). RLS org_id + FORCE per the Wave0 lock
-- (app.current_org_id()). Seed one 'production.changeover.allergen' policy per org
-- (required 2) via INSERT ... SELECT ... ON CONFLICT DO NOTHING.

create table if not exists public.signoff_policies (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  signoff_type          text not null,
  required_signatures   int  not null default 2 check (required_signatures between 1 and 2),
  first_signer_role_id  uuid references public.roles(id) on delete set null,
  second_signer_role_id uuid references public.roles(id) on delete set null,
  allow_same_user       boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (org_id, signoff_type)
);

create index if not exists signoff_policies_org_idx on public.signoff_policies (org_id);

alter table public.signoff_policies enable row level security;
alter table public.signoff_policies force row level security;

drop policy if exists signoff_policies_org_context_select on public.signoff_policies;
create policy signoff_policies_org_context_select on public.signoff_policies
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists signoff_policies_org_context_insert on public.signoff_policies;
create policy signoff_policies_org_context_insert on public.signoff_policies
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists signoff_policies_org_context_update on public.signoff_policies;
create policy signoff_policies_org_context_update on public.signoff_policies
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists signoff_policies_org_context_delete on public.signoff_policies;
create policy signoff_policies_org_context_delete on public.signoff_policies
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.signoff_policies from public;
grant select, insert, update, delete on public.signoff_policies to app_user;

-- Seed one allergen-changeover policy per org (required 2 signatures, distinct users).
insert into public.signoff_policies (org_id, signoff_type, required_signatures, allow_same_user, is_active)
select o.id, 'production.changeover.allergen', 2, false, true
  from public.organizations o
on conflict (org_id, signoff_type) do nothing;
