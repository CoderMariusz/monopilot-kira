-- Migration 560 — every organization gets a default site the moment it is created.
--
-- PROBLEM (F1, KRYTYCZNE): a fresh org could never finish onboarding.
--   `createOrganization` (apps/web/actions/orgs/create.ts) inserts the org, its roles,
--   tenant_variations and an outbox row — and NOTHING inserts into public.sites. None of
--   the 50+ AFTER INSERT triggers on public.organizations seeds a site either; the only
--   site seed in the whole repo was mig 266, hardcoded to the demo org.
--   Onboarding step 2 ("first warehouse", actions/onboarding/create-first-warehouse.ts:103)
--   calls resolveWriteSiteId -> zero active sites -> 'no_active_site' -> PERSISTENCE_FAILED.
--   There is no "create a site" step (advance.ts: TOTAL_STEPS = 6, REQUIRED = {1,2,3,6}),
--   and /settings/sites is unreachable while onboarding_completed_at IS NULL
--   (proxy.ts:206-211). Closed loop, no way out.
--   Verified on monopilot_t2: for an org with zero sites BOTH resolution queries
--   (getActiveSiteId's `is_default` branch and resolveWriteSiteId's `limit 2` fallback)
--   return 0 rows.
--
-- WHY A SEED AND NOT A 7th ONBOARDING STEP:
--   Org-level bootstrap in this repo is done by AFTER INSERT triggers on
--   public.organizations — roles (mig 080), units, allergens, feature flags, NPD catalog
--   (mig 386), multi-site permissions (mig 216). 52 such triggers exist; a site is the
--   same class of bootstrap data and the wizard already ASSUMES one exists. A new step
--   would instead renumber the whole wizard (TOTAL_STEPS 6 -> 7, REQUIRED_STEPS, the
--   positional `current_step` stored in organizations.onboarding_state for every org
--   mid-onboarding, six route folders x2 locales, "Step N of 6" copy, i18n) — a much
--   larger change that still would not help an org created outside the wizard.
--   A trigger covers EVERY creation path: the Server Action, SCIM, admin tooling, seeds.
--
-- The site is fully editable afterwards in Settings -> Sites (rename/timezone/country),
-- which becomes reachable as soon as onboarding completes.

-- ---------------------------------------------------------------------------
-- (1) One default per org, enforced by demoting instead of erroring.
--     `idx_sites_default` is a UNIQUE partial index, so inserting a second
--     is_default row raises 23505. `createSite` already clears the old default by
--     hand before inserting (sites.ts:751-761) — this makes that rule hold for
--     every writer (and closes the race between two concurrent createSite calls).
--     Without it, the seed below would break every fixture that creates an org and
--     then inserts its own default site (packages/db/__tests__/owner-org-context.ts
--     and friends): "the guard that protects one case freezes its neighbours".
-- ---------------------------------------------------------------------------
create or replace function public.sites_demote_other_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.sites
       set is_default = false,
           updated_at = pg_catalog.now()
     where org_id = new.org_id
       and id <> new.id
       and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sites_demote_other_defaults on public.sites;
create trigger trg_sites_demote_other_defaults
  before insert or update of is_default on public.sites
  for each row
  when (new.is_default)
  execute function public.sites_demote_other_defaults();

-- ---------------------------------------------------------------------------
-- (2) Seed a default site for an org that has none. Idempotent by design:
--     NOT EXISTS rather than ON CONFLICT, because public.sites has TWO unique
--     arbiters in play (sites_org_code_uq + idx_sites_default) — the mig 251/266
--     lesson: never ON CONFLICT a dual-arbiter table.
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_site_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.sites (org_id, site_code, name, is_default, timezone, is_active, activated_at)
  select o.id,
         'SITE-01',
         coalesce(nullif(btrim(o.name), ''), 'Main site'),
         true,
         o.timezone,          -- NOT NULL, defaults to 'Europe/Warsaw' on organizations
         true,
         pg_catalog.now()
    from public.organizations o
   where o.id = p_org_id
     and not exists (select 1 from public.sites s where s.org_id = o.id);
end;
$$;

revoke all on function public.seed_default_site_for_org(uuid) from public;
revoke all on function public.seed_default_site_for_org(uuid) from app_user;

create or replace function public.seed_default_site_on_org_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.seed_default_site_for_org(new.id);
  return new;
end;
$$;

revoke all on function public.seed_default_site_on_org_insert() from public;
revoke all on function public.seed_default_site_on_org_insert() from app_user;

-- 'zzz' prefix: fires after the earlier org-bootstrap triggers (same convention as
-- mig 216's trg_zzz_seed_multi_site_permissions), so nothing races the seed.
drop trigger if exists trg_zzz_seed_default_site on public.organizations;
create trigger trg_zzz_seed_default_site
  after insert on public.organizations
  for each row
  execute function public.seed_default_site_on_org_insert();

-- ---------------------------------------------------------------------------
-- (3) Backfill: every existing org stuck at zero sites is in the same deadlock.
--     Orgs that already have a site are untouched — including the demo org the
--     pilot runs on (mig 266 gave it two).
-- ---------------------------------------------------------------------------
do $$
declare
  v_org_id uuid;
begin
  for v_org_id in
    select o.id
      from public.organizations o
     where not exists (select 1 from public.sites s where s.org_id = o.id)
  loop
    perform public.seed_default_site_for_org(v_org_id);
  end loop;
end;
$$;

comment on function public.seed_default_site_for_org(uuid) is
  'Mig 560 — gives an org its first (default) site so onboarding step 2 can resolve a write site. No-op when the org already has any site.';
comment on function public.sites_demote_other_defaults() is
  'Mig 560 — keeps V-MS-01 (one default site per org) by demoting the previous default instead of raising 23505 on idx_sites_default.';
