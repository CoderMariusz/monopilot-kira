-- Migration 067: 02-settings T-013 — feature_flags_core (§10.2 built-in fallback)
-- PRD: docs/prd/02-SETTINGS-PRD.md §10.2 feature_flags_core
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- Per-org built-in feature-flag fallback table. PostHog flags are NOT mirrored here (T-013 red line).
-- PK is (org_id, flag_code); rolled_out_pct INT default 0 (per T-013 AC).
-- Seeds the 4 §10.2 core flags (is_enabled=false) PLUS the two authorization flags the /flags screen
-- and V-SET-42/43/44 expect, so the screen renders real Supabase data.
-- notification_preferences (the other T-013 table) already exists from migration 049; this migration
-- only adds feature_flags_core. The combined Drizzle schema lives in packages/db/schema/flags-prefs.ts.

create table if not exists public.feature_flags_core (
  org_id          uuid        not null references public.organizations(id) on delete cascade,
  flag_code       text        not null,
  description     text        not null default '',
  is_enabled      boolean     not null default false,
  rolled_out_pct  integer     not null default 0,
  tier            text        not null default 'L1',
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now(),
  primary key (org_id, flag_code),
  constraint feature_flags_core_rolled_out_pct_check check (rolled_out_pct between 0 and 100),
  constraint feature_flags_core_tier_check check (tier in ('L1', 'L2', 'L3', 'L4'))
);

create index if not exists feature_flags_core_org_idx
  on public.feature_flags_core (org_id);

alter table public.feature_flags_core enable row level security;
alter table public.feature_flags_core force row level security;
drop policy if exists feature_flags_core_org_context on public.feature_flags_core;
create policy feature_flags_core_org_context
  on public.feature_flags_core
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.feature_flags_core from public;
grant select, insert, update, delete on public.feature_flags_core to app_user;

create or replace function public.feature_flags_core_set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin new.updated_at := pg_catalog.now(); return new; end; $$;

drop trigger if exists feature_flags_core_set_updated_at on public.feature_flags_core;
create trigger feature_flags_core_set_updated_at
  before update on public.feature_flags_core
  for each row execute function public.feature_flags_core_set_updated_at();

comment on table public.feature_flags_core
  is 'T-013: §10.2 built-in feature-flag fallback (per-org). PostHog non-core flags are NOT mirrored here.';

-- ============================================================
-- Per-org seed — 4 §10.2 core flags + 2 authorization flags for the /flags screen (V-SET-42/43/44).
-- Pattern from migration 032 (function on INSERT + backfill).
-- ============================================================
create or replace function public.seed_feature_flags_core_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.feature_flags_core (org_id, flag_code, description, is_enabled, rolled_out_pct, tier)
  values
    -- §10.2 core flags (is_enabled=false per T-013 AC).
    (p_org_id, 'maintenance_mode',          'Put the org into maintenance mode.',                   false, 0, 'L1'),
    (p_org_id, 'integration.d365.enabled',  'Enable Dynamics 365 integration for this org.',        false, 0, 'L1'),
    (p_org_id, 'scanner.pwa.enabled',       'Enable the warehouse scanner PWA.',                    false, 0, 'L1'),
    (p_org_id, 'npd.d365_builder.execute',  'Allow the NPD D365 builder to execute.',               false, 0, 'L1'),
    -- Authorization flags surfaced by /settings/flags (V-SET-42/43/44 preflight gate).
    (p_org_id, 'npd.post_release_edit.enabled',          'Allow released NPD product/BOM edits after authorization.', false, 0,   'L1'),
    (p_org_id, 'technical.product_spec_approval.required','Require Technical product-spec approval before factory use.', true,  100, 'L1')
  on conflict (org_id, flag_code) do nothing;
end;
$$;

create or replace function public.seed_feature_flags_core_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.seed_feature_flags_core_for_org(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_feature_flags_core on public.organizations;
create trigger trg_seed_feature_flags_core
  after insert on public.organizations
  for each row
  execute function public.seed_feature_flags_core_on_org_insert();

do $$
declare v_org record;
begin
  for v_org in select id from public.organizations loop
    perform public.seed_feature_flags_core_for_org(v_org.id);
  end loop;
end
$$;
