Reading additional input from stdin...
OpenAI Codex v0.124.0 (research preview)
--------
workdir: /Users/mariuszkrawczyk/Projects/monopilot-kira
model: gpt-5.5
provider: openai
approval: never
sandbox: read-only
reasoning effort: none
reasoning summaries: none
session id: 019e93ea-d311-7173-bd58-d87d546c70b0
--------
user
You are the cross-provider CODEX reviewer for MonoPilot Kira (Gate 4, /kira:review). The code below is a git diff (branch kira/long-run vs main) of Claude/agent-written work — the writer never reviews its own output, so you provide the independent cross-check. Review ONLY this diff (provided on stdin). Do NOT edit anything — review only.

Focus on HIGH-risk red-lines (this is food-mfg MES; regulated):
1. TENANCY: org_id NOT tenant_id; every operational table has RLS ENABLED + FORCED with policies using app.current_org_id() (the function form) — NEVER raw current_setting('app.current_org_id') or SET LOCAL. site_id present as nullable day-1.
2. CANONICAL OWNERS (a module must not create/write another's table): wo_outputs + oee_snapshots + downtime_events = 08-production; schedule_outputs = 04-planning; license_plates = 05-warehouse; item_cost_history = 03-technical (dual w/ finance); quality_holds + ncr_reports = 09-quality. oee_snapshots has a SINGLE producer (08); 15-oee is read-only.
3. RBAC SEED (the #1 live 403 bug): a new permission family must be GRANTed to the org-admin family (org.access.admin/org.platform.admin/owner/admin/org_admin) + operator roles, in BOTH role_permissions AND legacy roles.permissions jsonb, with an org-insert trigger + existing-org backfill, idempotent. The strings GRANTed must byte-match the strings pages CHECK.
4. OUTBOX: every new event_type is in the enum AND the latest migration's CHECK constraint (enum<->CHECK drift). Outbox INSERT must be in the same txn as the state change.
5. MONEY/QTY: NUMERIC-exact, never float/double precision for cost/qty/kg.
6. MIGRATION HYGIENE: 3-digit prefix, monotonic, never edits an applied migration, idempotent (IF NOT EXISTS / OR REPLACE), FK indexes present.
7. REGULATORY: CFR-21 Part 11 e-sign (PIN server-side hash, dual-sign distinct session), BRCGS retention, D365 export-only anti-corruption (R15, soft refs not hard FKs), GS1 SSCC.

Output format:
- A markdown table: | severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
- Then a final line: VERDICT: PASS  (gates-clean, no BLOCK/HIGH) or VERDICT: FAIL + the blocking items.
Be specific and cite the migration filename + line. If the diff is sound, say so plainly with VERDICT: PASS.

Module under review: 02-settings — settings schema migrations + RBAC matrix/infra permission seeds.

<stdin>
diff --git a/packages/db/migrations/071-settings-codex-review-fixes.sql b/packages/db/migrations/071-settings-codex-review-fixes.sql
new file mode 100644
index 00000000..077bb94e
--- /dev/null
+++ b/packages/db/migrations/071-settings-codex-review-fixes.sql
@@ -0,0 +1,101 @@
+-- Migration 071: 02-settings — Codex cross-provider review fixes (P1) for migrations 063-070.
+-- The 063-070 migrations are already applied (checksums locked), so their issues are
+-- corrected here additively/idempotently.
+--
+-- P1 fixes:
+--  1. notification_preferences (070) never ran `revoke all from public` / `grant to app_user`
+--     → app_user cannot access it → /account/notifications fails. Lock it down + grant app_user.
+--  2. outbox_events_event_type_check (set by 070) is NOT union-complete with
+--     packages/outbox/src/events.enum.ts + existing emitters → settings.module.toggled,
+--     settings.org.updated, settings.reference.row_updated, settings.scim.token_created,
+--     fa.*, etc. would raise 23514 and roll back the writing action. Rebuild the CHECK as the
+--     UNION of (current live constraint) ∪ (canonical events.enum.ts).
+--  3. The SECURITY DEFINER per-org seed functions (063/064/067) are PUBLIC-executable by
+--     default → any role (app_user) could call seed_*_for_org(<other_org>) and write cross-org
+--     rows bypassing RLS. Revoke EXECUTE from public on all seed functions + trigger wrappers.
+--  4. d365_sync_runs.direction allowed 'pull' — violates the D365 export-only red line (R15).
+--     Restrict to 'push' (the table is empty; producer lives in another module).
+--
+-- Additive + idempotent.
+
+-- ============================================================
+-- 1. notification_preferences — lock down + grant app_user (was missing in 070)
+-- ============================================================
+revoke all on public.notification_preferences from public;
+grant select, insert, update, delete on public.notification_preferences to app_user;
+
+-- ============================================================
+-- 2. outbox_events_event_type_check — full UNION (live ∪ events.enum.ts)
+-- ============================================================
+alter table public.outbox_events
+  drop constraint if exists outbox_events_event_type_check;
+
+alter table public.outbox_events
+  add constraint outbox_events_event_type_check check (
+    event_type in (
+      -- core / foundation
+      'org.created', 'user.invited', 'role.assigned', 'audit.recorded',
+      -- product / npd
+      'brief.created',
+      'fg.created', 'fg.allergens_changed', 'fg.intermediate_code_changed',
+      'fa.created', 'fa.allergens_changed', 'fa.intermediate_code_changed',
+      -- warehouse / production / quality / shipping
+      'lp.received', 'wo.ready', 'quality.recorded', 'shipment.created',
+      -- tenant / migrations
+      'tenant.migration.run', 'tenant.migration.run.failed', 'tenant.cohort.advanced',
+      -- settings (canonical events.enum.ts)
+      'settings.schema.migration_requested',
+      'settings.rule.deployed', 'rule.deployed',
+      'settings.location.upserted', 'settings.machine.upserted', 'settings.line.upserted',
+      'settings.warehouse.deactivated',
+      'settings.module.toggled',
+      'settings.org.created', 'settings.org.updated',
+      'settings.reference.row_updated',
+      'settings.role.assigned',
+      'settings.scim.token_created', 'settings.sso.config_changed',
+      'settings.user.invited', 'settings.user.accepted', 'settings.user.deactivated',
+      'settings.notification_rule_updated', 'settings.notification_channel_updated',
+      'settings.notification_digest_updated',
+      -- onboarding
+      'onboarding.step.advance', 'onboarding.step.back', 'onboarding.step.skip',
+      'onboarding.step.jump', 'onboarding.step.restart', 'onboarding.first_wo_recorded'
+    )
+  );
+
+-- ============================================================
+-- 3. Revoke EXECUTE on SECURITY DEFINER seed functions (cross-org bypass risk)
+--    Triggers run as the function owner regardless of EXECUTE grants, so revoking from
+--    public/app_user does NOT break org-insert seeding — it only blocks direct calls.
+-- ============================================================
+do $$
+declare
+  v_fn text;
+begin
+  foreach v_fn in array array[
+    'public.seed_authorization_policies_for_org(uuid)',
+    'public.seed_authorization_policies_on_org_insert()',
+    'public.seed_units_of_measure_for_org(uuid)',
+    'public.seed_units_of_measure_on_org_insert()',
+    'public.seed_feature_flags_core_for_org(uuid)',
+    'public.seed_feature_flags_core_on_org_insert()'
+  ]
+  loop
+    if to_regprocedure(v_fn) is not null then
+      execute format('revoke all on function %s from public', v_fn);
+      begin
+        execute format('revoke all on function %s from app_user', v_fn);
+      exception when undefined_object then
+        null; -- app_user never had it; fine
+      end;
+    end if;
+  end loop;
+end
+$$;
+
+-- ============================================================
+-- 4. d365_sync_runs.direction — export-only (R15): drop 'pull'
+-- ============================================================
+alter table public.d365_sync_runs
+  drop constraint if exists d365_sync_runs_direction_check;
+alter table public.d365_sync_runs
+  add constraint d365_sync_runs_direction_check check (direction in ('push'));
diff --git a/packages/db/migrations/072-integration-settings.sql b/packages/db/migrations/072-integration-settings.sql
new file mode 100644
index 00000000..18bbd856
--- /dev/null
+++ b/packages/db/migrations/072-integration-settings.sql
@@ -0,0 +1,55 @@
+-- Migration 072: 02-settings W7 — integration_settings (provider/integration config per org).
+-- PRD: docs/prd/02-SETTINGS-PRD.md (Integrations / Email provider config).
+-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
+--
+-- Closes the gap behind apps/web/actions/email/load-email-config.ts:~153 which guards with
+--   to_regclass('public.integration_settings') and fails closed when the table is absent.
+-- One row per (org_id, category) holds the active provider + its config blob (e.g. email → Resend/Postmark/SES).
+-- Structure mirrors the proven 064-unit-of-measure.sql template (forced RLS, app_user grants, inline updated_at trigger).
+
+-- ============================================================
+-- 1. integration_settings
+-- ============================================================
+create table if not exists public.integration_settings (
+  id          uuid        primary key default gen_random_uuid(),
+  org_id      uuid        not null references public.organizations(id) on delete cascade,
+  category    text        not null,
+  provider    text,
+  config      jsonb       not null default '{}'::jsonb,
+  is_active   boolean     not null default false,
+  created_at  timestamptz not null default pg_catalog.now(),
+  updated_at  timestamptz not null default pg_catalog.now(),
+  constraint integration_settings_org_category_unique unique (org_id, category)
+);
+
+create index if not exists integration_settings_org_idx
+  on public.integration_settings (org_id);
+create index if not exists integration_settings_org_category_idx
+  on public.integration_settings (org_id, category);
+
+alter table public.integration_settings enable row level security;
+alter table public.integration_settings force row level security;
+drop policy if exists integration_settings_org_context on public.integration_settings;
+create policy integration_settings_org_context
+  on public.integration_settings
+  for all
+  to app_user
+  using (org_id = app.current_org_id())
+  with check (org_id = app.current_org_id());
+revoke all on public.integration_settings from public;
+grant select, insert, update, delete on public.integration_settings to app_user;
+
+comment on table public.integration_settings
+  is 'W7/T-090: per-org integration provider config (email/etc). One active row per (org, category).';
+
+-- ============================================================
+-- 2. updated_at trigger (inline; no shared app.set_updated_at() in this project — pattern from migration 064)
+-- ============================================================
+create or replace function public.integration_settings_set_updated_at()
+returns trigger language plpgsql set search_path = pg_catalog, public as $$
+begin new.updated_at := pg_catalog.now(); return new; end; $$;
+
+drop trigger if exists integration_settings_set_updated_at on public.integration_settings;
+create trigger integration_settings_set_updated_at
+  before update on public.integration_settings
+  for each row execute function public.integration_settings_set_updated_at();
diff --git a/packages/db/migrations/073-settings-reference-processes-partners.sql b/packages/db/migrations/073-settings-reference-processes-partners.sql
new file mode 100644
index 00000000..037803b4
--- /dev/null
+++ b/packages/db/migrations/073-settings-reference-processes-partners.sql
@@ -0,0 +1,102 @@
+-- Migration 073: 02-SETTINGS Wave 5 (Class D build-now)
+-- Schema-driven reference data for /settings/processes + /settings/partners.
+--
+-- The reference_schemas baseline (seeds/reference-schemas.sql, T-093) is NOT
+-- applied by the deploy migration runner, so the schema columns + baseline rows
+-- that the settings/processes and settings/partners screens read are seeded here
+-- to guarantee they reach Supabase on deploy (per the deploy-migration gotcha).
+--
+-- Wave0 lock: reference_tables rows are org-scoped (org_id). reference_schemas
+-- universal rows use org_id IS NULL (matches the existing T-093 convention).
+-- Idempotent: schema columns guarded by NOT EXISTS; reference_tables rows use
+-- ON CONFLICT (org_id, table_code, row_key) DO NOTHING.
+
+-- ============================================================
+-- 1. reference_schemas universal columns (org_id IS NULL)
+--    processes: extend with name + category.
+--    partners:  partner_code, name, partner_type, status.
+-- ============================================================
+do $$
+begin
+  insert into public.reference_schemas (
+    org_id, table_code, column_code, data_type, tier, storage,
+    dropdown_source, required_for_done, validation_json, presentation_json
+  )
+  select v.org_id, v.table_code, v.column_code, v.data_type, v.tier, v.storage,
+         v.dropdown_source, v.required_for_done, v.validation_json::jsonb, v.presentation_json::jsonb
+  from (
+    values
+      (null::uuid, 'reference.processes', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
+        '{"required":true}',
+        '{"label":"Name","editable_by":["admin","production_manager"]}'),
+      (null::uuid, 'reference.processes', 'category', 'enum', 'L1', 'ext_jsonb', null::text, false,
+        '{"required":false,"enum_values":["preparation","processing","packaging","quality","logistics"]}',
+        '{"label":"Category","editable_by":["admin","production_manager"]}'),
+      (null::uuid, 'reference.partners', 'partner_code', 'text', 'L1', 'ext_jsonb', null::text, true,
+        '{"required":true,"unique":true}',
+        '{"label":"Partner code","editable_by":["admin"]}'),
+      (null::uuid, 'reference.partners', 'name', 'text', 'L1', 'ext_jsonb', null::text, true,
+        '{"required":true}',
+        '{"label":"Name","editable_by":["admin"]}'),
+      (null::uuid, 'reference.partners', 'partner_type', 'enum', 'L1', 'ext_jsonb', null::text, true,
+        '{"required":true,"enum_values":["supplier","customer","both"]}',
+        '{"label":"Type","editable_by":["admin"]}'),
+      (null::uuid, 'reference.partners', 'status', 'enum', 'L1', 'ext_jsonb', null::text, true,
+        '{"required":true,"enum_values":["active","inactive"]}',
+        '{"label":"Status","editable_by":["admin"]}')
+  ) as v(org_id, table_code, column_code, data_type, tier, storage,
+         dropdown_source, required_for_done, validation_json, presentation_json)
+  where not exists (
+    select 1 from public.reference_schemas existing
+    where existing.org_id is null
+      and existing.table_code = v.table_code
+      and existing.column_code = v.column_code
+  );
+end $$;
+
+-- ============================================================
+-- 2. Baseline reference_tables rows for the Apex bootstrap org.
+--    processes: standard food-manufacturing process steps.
+--    partners:  representative supplier + customer.
+-- ============================================================
+do $$
+declare
+  v_apex_org_id uuid;
+begin
+  select id into v_apex_org_id
+  from public.organizations
+  where external_id = 'apex'
+  order by created_at asc, id asc
+  limit 1;
+
+  if v_apex_org_id is null then
+    raise notice 'Apex org not found — skipping settings reference baseline rows.';
+    return;
+  end if;
+
+  insert into public.reference_tables
+    (org_id, table_code, row_key, row_data, display_order, is_active)
+  values
+    (v_apex_org_id, 'processes', 'RECEIVING',
+       jsonb_build_object('process_code', 'RECEIVING', 'name', 'Goods receiving', 'category', 'logistics'), 1, true),
+    (v_apex_org_id, 'processes', 'MIXING',
+       jsonb_build_object('process_code', 'MIXING', 'name', 'Ingredient mixing', 'category', 'preparation'), 2, true),
+    (v_apex_org_id, 'processes', 'COOKING',
+       jsonb_build_object('process_code', 'COOKING', 'name', 'Thermal processing / cooking', 'category', 'processing'), 3, true),
+    (v_apex_org_id, 'processes', 'FILLING',
+       jsonb_build_object('process_code', 'FILLING', 'name', 'Filling & dosing', 'category', 'packaging'), 4, true),
+    (v_apex_org_id, 'processes', 'PACKAGING',
+       jsonb_build_object('process_code', 'PACKAGING', 'name', 'Primary packaging', 'category', 'packaging'), 5, true),
+    (v_apex_org_id, 'processes', 'QC_RELEASE',
+       jsonb_build_object('process_code', 'QC_RELEASE', 'name', 'QC inspection & release', 'category', 'quality'), 6, true)
+  on conflict (org_id, table_code, row_key) do nothing;
+
+  insert into public.reference_tables
+    (org_id, table_code, row_key, row_data, display_order, is_active)
+  values
+    (v_apex_org_id, 'partners', 'SUP-0001',
+       jsonb_build_object('partner_code', 'SUP-0001', 'name', 'Baseline Ingredients Supplier', 'partner_type', 'supplier', 'status', 'active'), 1, true),
+    (v_apex_org_id, 'partners', 'CUST-0001',
+       jsonb_build_object('partner_code', 'CUST-0001', 'name', 'Baseline Retail Customer', 'partner_type', 'customer', 'status', 'active'), 2, true)
+  on conflict (org_id, table_code, row_key) do nothing;
+end $$;
diff --git a/packages/db/migrations/148-settings-infra-permission-seed.sql b/packages/db/migrations/148-settings-infra-permission-seed.sql
new file mode 100644
index 00000000..1f841946
--- /dev/null
+++ b/packages/db/migrations/148-settings-infra-permission-seed.sql
@@ -0,0 +1,110 @@
+-- Migration 210: 02-settings reachability fix — seed settings.infra.read / settings.infra.update.
+-- PRD: docs/prd/02-SETTINGS-PRD.md (Infrastructure: warehouses, machines, locations, lines).
+-- Canonical permission strings checked by code:
+--   READ_PERMISSION   = 'settings.infra.read'   (page-level read gate)
+--   UPDATE_PERMISSION = 'settings.infra.update'  (create/deactivate/edit gate)
+-- Source-of-truth usages (NOT seeded prior to this migration):
+--   apps/web/app/[locale]/(app)/(admin)/settings/infra/{warehouses,machines,locations,lines}/page.tsx
+--   apps/web/actions/infra/{warehouse,machine,location,line}.ts  (EDIT_PERMISSION = 'settings.infra.update')
+-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
+--
+-- ROOT CAUSE: The entire Settings → Infrastructure section (warehouses/machines/
+-- locations/lines) gates its server-component READ on 'settings.infra.read' and every
+-- create/edit/deactivate on 'settings.infra.update'. Neither string was ever seeded into
+-- public.role_permissions or the legacy roles.permissions jsonb cache. The settings
+-- *page* hasPermission() helper has NO admin-role fallback (unlike the Server Action
+-- helper), so every admin sees "permission_denied" and the "Add warehouse" control is
+-- never rendered — they cannot add a warehouse. (Live preview had only the mismatched
+-- strings 'settings.infra.view' / 'settings.infrastructure.edit', which the code never
+-- reads.) This mirrors the gdpr.erasure.execute (116) and npd.allergen.write (146)
+-- unseeded-permission bug class.
+--
+-- Granted to the admin-class role set used by migration 050 (settings.users.manage /
+-- settings.security.manage): codes owner/admin/org_admin and slugs
+-- owner/admin/org.access.admin/org.platform.admin/org.schema.admin. This deliberately
+-- includes org.access.admin because the live admin@monopilot.test test user is on the
+-- org.access.admin role, not 'admin'. Granted in BOTH the normalized role_permissions
+-- table and the legacy roles.permissions jsonb cache (the page + action accept either),
+-- for every existing org, with an AFTER INSERT trigger so newly-created orgs inherit it.
+-- Idempotent: ON CONFLICT DO NOTHING on the table; jsonb merge is set-deduplicated.
+
+create or replace function public.seed_settings_infra_permissions_for_org(p_org_id uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  -- Normalized storage: admin-class roles get the two canonical infra permission rows.
+  insert into public.role_permissions (role_id, permission)
+  select r.id, p.permission
+  from public.roles r
+  cross join (values ('settings.infra.read'), ('settings.infra.update')) as p(permission)
+  where r.org_id = p_org_id
+    and (
+      r.code in ('owner', 'admin', 'org_admin')
+      or r.slug in ('owner', 'admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin')
+    )
+  on conflict (role_id, permission) do nothing;
+
+  -- Legacy jsonb cache: keep each admin-class role's permissions array in sync so either
+  -- read path (role_permissions row OR roles.permissions ? perm) grants access.
+  update public.roles r
+     set permissions = coalesce(
+       (
+         select jsonb_agg(distinct merged.permission order by merged.permission)
+         from (
+           select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
+           union all
+           select 'settings.infra.read'
+           union all
+           select 'settings.infra.update'
+         ) merged
+       ),
+       '[]'::jsonb
+     )
+   where r.org_id = p_org_id
+     and (
+       r.code in ('owner', 'admin', 'org_admin')
+       or r.slug in ('owner', 'admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin')
+     );
+end;
+$$;
+
+revoke all on function public.seed_settings_infra_permissions_for_org(uuid) from public;
+revoke all on function public.seed_settings_infra_permissions_for_org(uuid) from app_user;
+
+create or replace function public.seed_settings_infra_permissions_on_org_insert()
+returns trigger
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  perform public.seed_settings_infra_permissions_for_org(new.id);
+  return new;
+end;
+$$;
+
+revoke all on function public.seed_settings_infra_permissions_on_org_insert() from public;
+revoke all on function public.seed_settings_infra_permissions_on_org_insert() from app_user;
+
+-- Run AFTER the 080 NPD seed trigger (which creates the org-scoped roles on org insert).
+-- Trigger names fire alphabetically; 'trg_seed_npd_role_permissions' (080) sorts before
+-- 'trg_zzz_seed_settings_infra_permissions', so the roles already exist.
+drop trigger if exists trg_zzz_seed_settings_infra_permissions on public.organizations;
+create trigger trg_zzz_seed_settings_infra_permissions
+  after insert on public.organizations
+  for each row
+  execute function public.seed_settings_infra_permissions_on_org_insert();
+
+-- Backfill every existing org.
+do $$
+declare
+  v_org_id uuid;
+begin
+  for v_org_id in select id from public.organizations loop
+    perform public.seed_settings_infra_permissions_for_org(v_org_id);
+  end loop;
+end
+$$;
diff --git a/packages/db/migrations/150-settings-rbac-matrix-seed.sql b/packages/db/migrations/150-settings-rbac-matrix-seed.sql
new file mode 100644
index 00000000..01ff4fa5
--- /dev/null
+++ b/packages/db/migrations/150-settings-rbac-matrix-seed.sql
@@ -0,0 +1,242 @@
+-- Migration 150: 02-settings authoritative RBAC matrix seed (module RE-OPEN — reachability fix).
+-- PRD: docs/prd/02-SETTINGS-PRD.md §3 (RBAC), §6-§14 (all settings sub-domains).
+-- Side-car source of truth:
+--   _meta/runs/sidecar/reports/rbac-permission-seed-gaps.md
+--   _meta/runs/sidecar/reports/settings-reachability.md
+--   _meta/runs/sidecar/reports/settings-audit.md  (F1 reachability / F2 string-drift)
+-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
+--
+-- ============================================================================
+-- WHY THIS EXISTS
+-- ----------------------------------------------------------------------------
+-- Every settings Server Action / page gates on a literal permission string via a
+-- local hasPermission/requirePermission that does an EXACT-MATCH lookup against
+-- public.role_permissions (plus, in some gates, the legacy roles.permissions jsonb
+-- cache). There is NO superuser bypass and NO alias normalization at the gate site.
+-- If a checked string is never INSERTed into role_permissions for a role the user
+-- holds, the gate returns `forbidden` for EVERY user — including the org admin —
+-- and the feature is permanently unreachable (renders, but every read/write 403s).
+--
+-- Migrations 037/049/050/064/116/146/148 seeded only a tiny slice of the strings the
+-- settings pages actually check (onboarding.complete, security.manage, users.manage,
+-- infra.read/update, gdpr.erasure.execute). The org admin therefore hit 403 on ~24-30
+-- settings pages on a freshly-migrated DB. The live DB only "works" because the admin
+-- role was HAND-SEEDED during Gate-5 with strings that exist in NO migration — i.e. the
+-- working state is not reproducible from version control. This migration makes the full
+-- settings permission set durable & reproducible (local / new tenants / clean re-provision).
+--
+-- It also REPAIRS the migration-064 ordering bug: 064 granted settings.units.manage to
+-- code IN ('owner','admin','org_admin') in a one-time DO block, but the `admin` role is
+-- created LATER by 080 and 064 installed NO org-insert trigger -> 0 rows seeded. Here
+-- units.manage is part of the matrix AND inherited by new orgs via the trigger below.
+--
+-- ----------------------------------------------------------------------------
+-- DISCOVERY METHOD (the strings below are the REAL union, not just the proposal)
+-- ----------------------------------------------------------------------------
+-- Grepped every settings gate site (hasPermission / requirePermission / *_PERMISSION
+-- constants / *_PERMISSIONS arrays) under:
+--   apps/web/app/**/(admin)/settings/**   and   apps/web/actions/**
+-- The strings are seeded VERBATIM as the code checks them today (incl. drifted strings
+-- such as settings.d365.manage / settings.d365.rotate_secret / settings.d365.test_connection
+-- / settings.email_config.edit / settings.units.manage / settings.infra.read|update /
+-- settings.schema.read|admin / impersonate.tenant, and the role-name-as-permission gates
+-- org.access.admin / org.schema.admin used by flags / schema-preview / promotions / security).
+-- A follow-up task should converge gate-strings <-> permissions.enum.ts onto one vocabulary
+-- and collapse the duplicate (.view/.read, .edit/.manage/.update) pairs, then re-seed canonically.
+--
+-- ----------------------------------------------------------------------------
+-- ROLE MAPPING
+-- ----------------------------------------------------------------------------
+-- org-admin family  = codes/slugs: owner, admin, org_admin, org.access.admin,
+--                     org.platform.admin, org.schema.admin  -> FULL settings.* set
+--                     (mirrors the admin-class set used by migrations 050 / 148).
+-- auditor           = read-only oversight: settings.audit.read, settings.users.view,
+--                     settings.rules.view  (seeded defensively; the role may not exist
+--                     in every org — the join simply yields 0 rows where absent).
+-- Role-name-as-permission rows: the flags / schema / promotions / security gates check
+-- requirePermission('org.access.admin') / ('org.schema.admin'); the matching role must
+-- therefore hold its own name as a permission string. Granted to the admin family.
+--
+-- Dual-write: BOTH normalized role_permissions AND legacy roles.permissions jsonb cache
+-- (the gates accept either read path). Idempotent: ON CONFLICT DO NOTHING + set-deduped
+-- jsonb merge. SECURITY DEFINER fn + AFTER INSERT trigger (zzz-prefixed -> runs after
+-- 037/050/064/080/116/146/148) + one-time backfill of every existing org.
+-- ============================================================================
+
+create or replace function public.seed_settings_rbac_matrix_for_org(p_org_id uuid)
+returns void
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  if to_regclass('public.role_permissions') is null or to_regclass('public.roles') is null then
+    return; -- RBAC tables not present yet; nothing to grant.
+  end if;
+
+  -- ----------------------------------------------------------------------
+  -- 1) Normalized storage: insert (role_id, permission) for the grant matrix.
+  --    grant_matrix(permission, role_family):
+  --      'admin'   -> org-admin family (codes owner/admin/org_admin + slugs org.*.admin)
+  --      'auditor' -> the auditor role (code or slug 'auditor')
+  -- ----------------------------------------------------------------------
+  with grant_matrix(permission, role_family) as (
+    values
+      -- Org / tenant settings ----------------------------------------------------
+      ('settings.org.read',             'admin'),
+      ('settings.org.update',           'admin'),
+      -- Users / roles -----------------------------------------------------------
+      ('settings.users.view',           'admin'),
+      ('settings.users.view',           'auditor'),
+      ('settings.users.invite',         'admin'),
+      ('settings.users.create',         'admin'),
+      ('settings.users.deactivate',     'admin'),
+      ('settings.users.manage',         'admin'),
+      ('settings.roles.view',           'admin'),
+      ('settings.roles.assign',         'admin'),
+      ('settings.roles.manage',         'admin'),
+      -- Audit / impersonation ---------------------------------------------------
+      ('settings.audit.read',           'admin'),
+      ('settings.audit.read',           'auditor'),
+      ('impersonate.tenant',            'admin'),
+      -- Rules registry ----------------------------------------------------------
+      ('settings.rules.view',           'admin'),
+      ('settings.rules.view',           'auditor'),
+      -- Reference data ----------------------------------------------------------
+      ('settings.reference.view',       'admin'),
+      ('settings.reference.edit',       'admin'),
+      ('settings.reference.import',     'admin'),
+      -- Infrastructure (warehouses / machines / locations / lines) --------------
+      -- read/update = the strings the code checks; view = export-capability check.
+      ('settings.infra.read',           'admin'),
+      ('settings.infra.update',         'admin'),
+      ('settings.infra.view',           'admin'),
+      -- Feature flags / modules -------------------------------------------------
+      ('settings.flags.edit',           'admin'),
+      ('settings.flags.view',           'admin'),
+      -- Units of measure (also repairs the migration-064 ordering bug) ----------
+      ('settings.units.manage',         'admin'),
+      -- D365 integration (strings as the code checks them today) ----------------
+      ('settings.d365.view',            'admin'),
+      ('settings.d365.manage',          'admin'),
+      ('settings.d365.rotate_secret',   'admin'),
+      ('settings.d365.test_connection', 'admin'),
+      -- Email configuration (both string variants the code uses) ----------------
+      ('settings.email.view',           'admin'),
+      ('settings.email.edit',           'admin'),
+      ('settings.email.read',           'admin'),
+      ('settings.email_config.edit',    'admin'),
+      -- SSO / SCIM --------------------------------------------------------------
+      ('settings.sso.edit',             'admin'),
+      ('settings.scim.edit',            'admin'),
+      -- IP allowlist ------------------------------------------------------------
+      ('settings.ip_allowlist.edit',    'admin'),
+      -- Security page -----------------------------------------------------------
+      ('settings.security.view',        'admin'),
+      ('settings.security.manage',      'admin'),
+      ('settings.security.edit',        'admin'),
+      -- Authorization policies --------------------------------------------------
+      ('settings.authorization.view',   'admin'),
+      ('settings.authorization.edit',   'admin'),
+      -- Schema lifecycle (preview / diff read) ----------------------------------
+      ('settings.schema.read',          'admin'),
+      ('settings.schema.admin',         'admin'),
+      -- Role-name-as-permission gates (flags / schema-preview / promotions / security)
+      ('org.access.admin',              'admin'),
+      ('org.schema.admin',              'admin')
+  )
+  insert into public.role_permissions (role_id, permission)
+  select r.id, gm.permission
+  from public.roles r
+  join grant_matrix gm
+    on (
+         gm.role_family = 'admin'
+         and (
+           r.code in ('owner', 'admin', 'org_admin')
+           or r.slug in ('owner', 'admin', 'org_admin',
+                         'org.access.admin', 'org.platform.admin', 'org.schema.admin')
+         )
+       )
+    or (
+         gm.role_family = 'auditor'
+         and (r.code = 'auditor' or r.slug = 'auditor')
+       )
+  where r.org_id = p_org_id
+  on conflict (role_id, permission) do nothing;
+
+  -- ----------------------------------------------------------------------
+  -- 2) Legacy jsonb cache: rebuild each touched role's permissions array as the
+  --    set-deduped union of its existing array + every role_permissions row it now
+  --    holds (so either read path grants access). Only roles in the seeded families.
+  -- ----------------------------------------------------------------------
+  with expanded as (
+    select
+      r.id,
+      coalesce(
+        (
+          select jsonb_agg(distinct merged.value order by merged.value)
+          from (
+            select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as value
+            union all
+            select rp.permission
+            from public.role_permissions rp
+            where rp.role_id = r.id
+          ) merged(value)
+        ),
+        '[]'::jsonb
+      ) as permissions
+    from public.roles r
+    where r.org_id = p_org_id
+      and (
+        r.code in ('owner', 'admin', 'org_admin', 'auditor')
+        or r.slug in ('owner', 'admin', 'org_admin', 'auditor',
+                      'org.access.admin', 'org.platform.admin', 'org.schema.admin')
+      )
+  )
+  update public.roles r
+     set permissions = expanded.permissions
+    from expanded
+   where r.id = expanded.id
+     and r.permissions is distinct from expanded.permissions;
+end;
+$$;
+
+revoke all on function public.seed_settings_rbac_matrix_for_org(uuid) from public;
+revoke all on function public.seed_settings_rbac_matrix_for_org(uuid) from app_user;
+
+create or replace function public.seed_settings_rbac_matrix_on_org_insert()
+returns trigger
+language plpgsql
+security definer
+set search_path = pg_catalog
+as $$
+begin
+  perform public.seed_settings_rbac_matrix_for_org(new.id);
+  return new;
+end;
+$$;
+
+revoke all on function public.seed_settings_rbac_matrix_on_org_insert() from public;
+revoke all on function public.seed_settings_rbac_matrix_on_org_insert() from app_user;
+
+-- zzz-prefixed: triggers fire in alphabetical order, so this runs AFTER
+-- trg_seed_npd_role_permissions (080, creates admin/viewer) and the other
+-- per-org role-creation triggers. New orgs inherit the full settings matrix.
+-- This is also the org-insert trigger that migration 064 forgot to install for
+-- settings.units.manage (now carried in the matrix above).
+drop trigger if exists trg_zzz_seed_settings_rbac_matrix on public.organizations;
+create trigger trg_zzz_seed_settings_rbac_matrix
+  after insert on public.organizations
+  for each row
+  execute function public.seed_settings_rbac_matrix_on_org_insert();
+
+-- Backfill every existing org.
+do $$
+declare
+  v_org_id uuid;
+begin
+  for v_org_id in select id from public.organizations loop
+    perform public.seed_settings_rbac_matrix_for_org(v_org_id);
+  end loop;
+end
+$$;
diff --git a/packages/db/migrations/152-settings-location-deleted-outbox-event.sql b/packages/db/migrations/152-settings-location-deleted-outbox-event.sql
new file mode 100644
index 00000000..12a21e9e
--- /dev/null
+++ b/packages/db/migrations/152-settings-location-deleted-outbox-event.sql
@@ -0,0 +1,119 @@
+-- Migration 152: Admit settings.location.deleted to the outbox event CHECK.
+-- Wave0 lock: outbox rows remain org-scoped; no table ownership changes.
+
+alter table public.outbox_events
+  drop constraint if exists outbox_events_event_type_check;
+
+alter table public.outbox_events
+  add constraint outbox_events_event_type_check check (
+    event_type in (
+      'audit.recorded',
+      'bom.initial_version_created',
+      'bom.version_submitted',
+      'brief.completed_for_project',
+      'brief.converted',
+      'brief.created',
+      'compliance_doc.deleted',
+      'compliance_doc.expired',
+      'compliance_doc.expiring',
+      'compliance_doc.uploaded',
+      'd365.cache.refreshed',
+      'fa.allergens_changed',
+      'fa.built',
+      'fa.built_reset',
+      'fa.cascade',
+      'fa.core_closed',
+      'fa.created',
+      'fa.deleted',
+      'fa.dept_closed',
+      'fa.dept_reopened',
+      'fa.edit',
+      'fa.intermediate_code_changed',
+      'fa.recipe_changed',
+      'fa.template_applied',
+      'fg.allergens_changed',
+      'fg.bom.released',
+      'fg.created',
+      'fg.edit',
+      'fg.intermediate_code_changed',
+      'fg.release_blocked',
+      'fg.released_to_factory',
+      'formulation.locked',
+      'formulation.submitted_for_trial',
+      'lp.received',
+      'manufacturing_operations.created',
+      'manufacturing_operations.deactivated',
+      'manufacturing_operations.reset_to_seed',
+      'manufacturing_operations.updated',
+      'npd.allergens.bulk_rebuild_completed',
+      'npd.builder.released_records_created',
+      'npd.fg_candidate_mapped',
+      'npd.gate.advanced',
+      'npd.gate.approved',
+      'npd.gate.reverted',
+      'npd.project.brief_mapped',
+      'npd.project.created',
+      'npd.project.legacy_stages_closed',
+      'npd.project.release_requested',
+      'onboarding.first_wo_recorded',
+      'onboarding.step.advance',
+      'onboarding.step.back',
+      'onboarding.step.jump',
+      'onboarding.step.restart',
+      'onboarding.step.skip',
+      'org.created',
+      'org.mfa_enrollment.forced',
+      'org.security_policy.updated',
+      'quality.recorded',
+      'reference.allergens_added_by_process.bulk_changed',
+      'reference.allergens_by_rm.bulk_changed',
+      'reference.csv.committed',
+      'reference.row.soft_deleted',
+      'reference.row.upserted',
+      'risk.created',
+      'role.assigned',
+      'rule.deployed',
+      'settings.core_flag.updated',
+      'settings.dept_override.updated',
+      'settings.ip_allowlist.changed',
+      'settings.line.upserted',
+      'settings.location.deleted',
+      'settings.location.imported',
+      'settings.location.upserted',
+      'settings.machine.upserted',
+      'settings.module.disabled',
+      'settings.module.enabled',
+      'settings.module.toggled',
+      'settings.notification_channel_updated',
+      'settings.notification_digest_updated',
+      'settings.notification_rule_updated',
+      'settings.org.created',
+      'settings.org.updated',
+      'settings.reference.row_updated',
+      'settings.role.assigned',
+      'settings.rule.deployed',
+      'settings.rule_variant.updated',
+      'settings.schema.migration_requested',
+      'settings.scim.token_created',
+      'settings.sso.config_changed',
+      'settings.upgrade.completed',
+      'settings.upgrade.promoted',
+      'settings.upgrade.rolled_back',
+      'settings.upgrade.scheduled',
+      'settings.user.accepted',
+      'settings.user.deactivated',
+      'settings.user.invitation_resent',
+      'settings.user.invited',
+      'settings.warehouse.deactivated',
+      'shipment.created',
+      'technical.factory_spec.approved',
+      'tenant.cohort.advanced',
+      'tenant.migration.run',
+      'tenant.migration.run.failed',
+      'unit_of_measure.conversion_created',
+      'unit_of_measure.created',
+      'unit_of_measure.soft_deleted',
+      'user.invited',
+      'wo.ready'
+    )
+  );
diff --git a/packages/db/migrations/180-settings-d365-sync-updated-outbox-event.sql b/packages/db/migrations/180-settings-d365-sync-updated-outbox-event.sql
new file mode 100644
index 00000000..a6833ebc
--- /dev/null
+++ b/packages/db/migrations/180-settings-d365-sync-updated-outbox-event.sql
@@ -0,0 +1,126 @@
+-- Migration 180: Admit settings.d365_sync.updated to the outbox event CHECK.
+-- T-111 / SET-082 — D365 Sync Config screen now persists real config and emits
+-- a settings.d365_sync.updated outbox event on save (export-only per R15: the
+-- local config is the source of truth; the event is an internal audit/notify
+-- signal, NOT a D365 push).
+-- Wave0 lock: outbox rows remain org-scoped; no table ownership changes.
+-- Enum SoT: packages/outbox/src/events.enum.ts (the drift gate asserts this
+-- CHECK string set === DB_EVENT_TYPES; check-drift.test.ts).
+
+alter table public.outbox_events
+  drop constraint if exists outbox_events_event_type_check;
+
+alter table public.outbox_events
+  add constraint outbox_events_event_type_check check (
+    event_type in (
+      'audit.recorded',
+      'bom.initial_version_created',
+      'bom.version_submitted',
+      'brief.completed_for_project',
+      'brief.converted',
+      'brief.created',
+      'compliance_doc.deleted',
+      'compliance_doc.expired',
+      'compliance_doc.expiring',
+      'compliance_doc.uploaded',
+      'd365.cache.refreshed',
+      'fa.allergens_changed',
+      'fa.built',
+      'fa.built_reset',
+      'fa.cascade',
+      'fa.core_closed',
+      'fa.created',
+      'fa.deleted',
+      'fa.dept_closed',
+      'fa.dept_reopened',
+      'fa.edit',
+      'fa.intermediate_code_changed',
+      'fa.recipe_changed',
+      'fa.template_applied',
+      'fg.allergens_changed',
+      'fg.bom.released',
+      'fg.created',
+      'fg.edit',
+      'fg.intermediate_code_changed',
+      'fg.release_blocked',
+      'fg.released_to_factory',
+      'formulation.locked',
+      'formulation.submitted_for_trial',
+      'lp.received',
+      'manufacturing_operations.created',
+      'manufacturing_operations.deactivated',
+      'manufacturing_operations.reset_to_seed',
+      'manufacturing_operations.updated',
+      'npd.allergens.bulk_rebuild_completed',
+      'npd.builder.released_records_created',
+      'npd.fg_candidate_mapped',
+      'npd.gate.advanced',
+      'npd.gate.approved',
+      'npd.gate.reverted',
+      'npd.project.brief_mapped',
+      'npd.project.created',
+      'npd.project.legacy_stages_closed',
+      'npd.project.release_requested',
+      'onboarding.first_wo_recorded',
+      'onboarding.step.advance',
+      'onboarding.step.back',
+      'onboarding.step.jump',
+      'onboarding.step.restart',
+      'onboarding.step.skip',
+      'org.created',
+      'org.mfa_enrollment.forced',
+      'org.security_policy.updated',
+      'quality.recorded',
+      'reference.allergens_added_by_process.bulk_changed',
+      'reference.allergens_by_rm.bulk_changed',
+      'reference.csv.committed',
+      'reference.row.soft_deleted',
+      'reference.row.upserted',
+      'risk.created',
+      'role.assigned',
+      'rule.deployed',
+      'settings.core_flag.updated',
+      'settings.d365_sync.updated',
+      'settings.dept_override.updated',
+      'settings.ip_allowlist.changed',
+      'settings.line.upserted',
+      'settings.location.deleted',
+      'settings.location.imported',
+      'settings.location.upserted',
+      'settings.machine.upserted',
+      'settings.module.disabled',
+      'settings.module.enabled',
+      'settings.module.toggled',
+      'settings.notification_channel_updated',
+      'settings.notification_digest_updated',
+      'settings.notification_rule_updated',
+      'settings.org.created',
+      'settings.org.updated',
+      'settings.reference.row_updated',
+      'settings.role.assigned',
+      'settings.rule.deployed',
+      'settings.rule_variant.updated',
+      'settings.schema.migration_requested',
+      'settings.scim.token_created',
+      'settings.sso.config_changed',
+      'settings.upgrade.completed',
+      'settings.upgrade.promoted',
+      'settings.upgrade.rolled_back',
+      'settings.upgrade.scheduled',
+      'settings.user.accepted',
+      'settings.user.deactivated',
+      'settings.user.invitation_resent',
+      'settings.user.invited',
+      'settings.warehouse.deactivated',
+      'shipment.created',
+      'technical.factory_spec.approved',
+      'tenant.cohort.advanced',
+      'tenant.migration.run',
+      'tenant.migration.run.failed',
+      'unit_of_measure.conversion_created',
+      'unit_of_measure.created',
+      'unit_of_measure.soft_deleted',
+      'user.invited',
+      'wo.ready'
+    )
+  );
</stdin>
codex
I’m reviewing this as a diff-only gate check and focusing on the red-line classes you listed: tenancy/RLS, canonical ownership, RBAC seeding, outbox drift, migration hygiene, and regulatory constraints.
codex
| severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
|---|---|---|---|
| BLOCK | `packages/db/migrations/180-settings-d365-sync-updated-outbox-event.sql:78` | `settings.d365_sync.updated` is added to the latest `outbox_events_event_type_check`, but this diff does not include the corresponding update to `packages/outbox/src/events.enum.ts`. The gate requires enum <-> CHECK byte-level parity; as provided, the diff creates outbox drift. | Add `settings.d365_sync.updated` to `packages/outbox/src/events.enum.ts` in the same change, or remove it from the migration CHECK until the enum is updated. |
| HIGH | `packages/db/migrations/072-integration-settings.sql:12` | New org-scoped table `integration_settings` has `org_id` and RLS, but no nullable `site_id`. The tenancy red-line requires `site_id` present as nullable day-1 on operational/settings tables. | Add `site_id uuid null references public.sites(id) on delete set null` and an index, e.g. `(org_id, site_id)`, while keeping policies scoped through `org_id = app.current_org_id()`. |
| MED | `packages/db/migrations/148-settings-infra-permission-seed.sql:1` | Filename is `148-settings-infra-permission-seed.sql`, but the migration header says `Migration 210`. This is migration hygiene drift and can confuse audit trails/checksum reviews. | Change the header to `Migration 148` so the file prefix and declared migration number match. |

VERDICT: FAIL - blocking item: outbox CHECK adds `settings.d365_sync.updated` without the enum update in this diff.
tokens used
38,101
| severity (BLOCK/HIGH/MED/LOW) | file:line | issue | suggested fix |
|---|---|---|---|
| BLOCK | `packages/db/migrations/180-settings-d365-sync-updated-outbox-event.sql:78` | `settings.d365_sync.updated` is added to the latest `outbox_events_event_type_check`, but this diff does not include the corresponding update to `packages/outbox/src/events.enum.ts`. The gate requires enum <-> CHECK byte-level parity; as provided, the diff creates outbox drift. | Add `settings.d365_sync.updated` to `packages/outbox/src/events.enum.ts` in the same change, or remove it from the migration CHECK until the enum is updated. |
| HIGH | `packages/db/migrations/072-integration-settings.sql:12` | New org-scoped table `integration_settings` has `org_id` and RLS, but no nullable `site_id`. The tenancy red-line requires `site_id` present as nullable day-1 on operational/settings tables. | Add `site_id uuid null references public.sites(id) on delete set null` and an index, e.g. `(org_id, site_id)`, while keeping policies scoped through `org_id = app.current_org_id()`. |
| MED | `packages/db/migrations/148-settings-infra-permission-seed.sql:1` | Filename is `148-settings-infra-permission-seed.sql`, but the migration header says `Migration 210`. This is migration hygiene drift and can confuse audit trails/checksum reviews. | Change the header to `Migration 148` so the file prefix and declared migration number match. |

VERDICT: FAIL - blocking item: outbox CHECK adds `settings.d365_sync.updated` without the enum update in this diff.
