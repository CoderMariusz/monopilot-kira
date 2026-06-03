-- Migration 063: 02-settings T-122 — org_authorization_policies (schema + per-org seed)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.1 org_authorization_policies, §9.1, §10.2 V-SET-43/V-SET-44, UX SET-011b
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id() (NOT raw current_setting).
--
-- Settings-owned per-org authorization policies for NPD post-release edit requests and
-- Technical product-spec approval gates. Column shape matches the runtime consumers:
--   apps/web/actions/authorization/preflight.ts (readAuthorizationPolicy / runNpdPostReleaseEditPreflight)
--   apps/web/actions/authorization/policy-actions.ts (updateAuthorizationPolicy — version increment)
--   apps/web/app/[locale]/(app)/(admin)/settings/authorization/page.tsx
-- These helpers (T-126) already exist and fail at runtime because this table is missing.
--
-- Risk red lines (T-122):
--   * No NPD/Technical workflow implementation here (schema + seed only).
--   * requires_new_version=true is invariant for npd_post_release_edit (no in-place released-spec mutation).
--   * No self-authorization default for npd_manager (segregation_of_duties default = true).
--   * Explicit typed columns + CHECK constraints — not unvalidated JSON-only storage.

-- ============================================================
-- 1. Table DDL — explicit columns + constraints (no JSON-only storage)
-- ============================================================
create table if not exists public.org_authorization_policies (
  id                            uuid        primary key default gen_random_uuid(),
  org_id                        uuid        not null references public.organizations(id) on delete cascade,
  policy_code                   text        not null,
  is_enabled                    boolean     not null default true,
  request_permissions           text[]      not null default '{}'::text[],
  authorize_permissions         text[]      not null default '{}'::text[],
  approver_role_codes           text[]      not null default '{}'::text[],
  min_approvers                 integer     not null default 1,
  require_segregation_of_duties boolean     not null default true,
  requires_new_version          boolean     not null default true,
  approval_gate_rule_code       text,
  settings_json                 jsonb       not null default '{}'::jsonb,
  version                       integer     not null default 1,
  updated_by                    uuid        references public.users(id) on delete set null,
  created_at                    timestamptz not null default pg_catalog.now(),
  updated_at                    timestamptz not null default pg_catalog.now(),
  constraint org_authorization_policies_org_code_unique unique (org_id, policy_code),
  constraint org_authorization_policies_code_check
    check (policy_code in ('npd_post_release_edit', 'technical_product_spec_approval')),
  constraint org_authorization_policies_min_approvers_check
    check (min_approvers >= 1),
  constraint org_authorization_policies_version_check
    check (version >= 1),
  -- V-SET-43 invariant: npd_post_release_edit must always require a new version (no in-place edit of released specs).
  constraint org_authorization_policies_npd_requires_new_version_check
    check (policy_code <> 'npd_post_release_edit' or requires_new_version = true)
);

-- ============================================================
-- 2. Indexes (org_id always first; lookup is by (org_id, policy_code))
-- ============================================================
create index if not exists org_authorization_policies_org_idx
  on public.org_authorization_policies (org_id);
create index if not exists org_authorization_policies_org_code_idx
  on public.org_authorization_policies (org_id, policy_code);

-- ============================================================
-- 3. RLS — enable + FORCE; single org-context policy (project convention, see migration 044)
-- ============================================================
alter table public.org_authorization_policies enable row level security;
alter table public.org_authorization_policies force row level security;

drop policy if exists org_authorization_policies_org_context on public.org_authorization_policies;
create policy org_authorization_policies_org_context
  on public.org_authorization_policies
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.org_authorization_policies from public;
grant select, insert, update, delete on public.org_authorization_policies to app_user;

-- updated_at maintenance (no shared app.set_updated_at() in this project; inline trigger fn).
create or replace function public.org_authorization_policies_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists org_authorization_policies_set_updated_at on public.org_authorization_policies;
create trigger org_authorization_policies_set_updated_at
  before update on public.org_authorization_policies
  for each row execute function public.org_authorization_policies_set_updated_at();

comment on table public.org_authorization_policies
  is 'T-122: Settings-owned per-org authorization policies (NPD post-release edit + Technical product-spec approval). V-SET-43/V-SET-44.';

-- ============================================================
-- 4. Per-org default seed — function applied on org INSERT + backfill (pattern from migration 032)
--    Seeds the two policy rows AND the technical_product_spec_approval_gate_v1 gate rule in
--    public.rule_definitions so runTechnicalApprovalPreflight does not fire `gate_rule_missing`.
--    SECURITY DEFINER bypasses RLS (current_org_id() is unset during the org INSERT).
-- ============================================================
create or replace function public.seed_authorization_policies_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- NPD post-release edit policy. owner authorizes; segregation-of-duties on; requires new version (invariant).
  insert into public.org_authorization_policies
    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
     approval_gate_rule_code, settings_json, version)
  values
    (p_org_id, 'npd_post_release_edit', true,
     array['npd.released_product_edit.request']::text[],
     array['npd.released_product_edit.authorize']::text[],
     array['owner']::text[], 1, true, true,
     null, '{}'::jsonb, 1)
  on conflict (org_id, policy_code) do nothing;

  -- Technical product-spec approval policy. quality_lead approves; references the gate rule.
  insert into public.org_authorization_policies
    (org_id, policy_code, is_enabled, request_permissions, authorize_permissions,
     approver_role_codes, min_approvers, require_segregation_of_duties, requires_new_version,
     approval_gate_rule_code, settings_json, version)
  values
    (p_org_id, 'technical_product_spec_approval', true,
     '{}'::text[],
     array['technical.product_spec.approve']::text[],
     array['quality_lead']::text[], 1, true, true,
     'technical_product_spec_approval_gate_v1',
     jsonb_build_object('require_dual_sign_off', true), 1)
  on conflict (org_id, policy_code) do nothing;

  -- Active gate rule referenced by the technical approval preflight (rule_definitions, migration 039).
  if to_regclass('public.rule_definitions') is not null then
    insert into public.rule_definitions
      (org_id, rule_code, rule_type, tier, definition_json, version, active_from, active_to)
    values
      (p_org_id, 'technical_product_spec_approval_gate_v1', 'gate', 'L1',
       jsonb_build_object('min_approvers', 1, 'requires_new_version', true), 1, pg_catalog.now(), null)
    on conflict (org_id, rule_code, version) do nothing;
  end if;
end;
$$;

create or replace function public.seed_authorization_policies_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.seed_authorization_policies_for_org(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_authorization_policies on public.organizations;
create trigger trg_seed_authorization_policies
  after insert on public.organizations
  for each row
  execute function public.seed_authorization_policies_on_org_insert();

-- Backfill every existing org (idempotent via ON CONFLICT DO NOTHING inside the function).
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_authorization_policies_for_org(v_org.id);
  end loop;
end
$$;
