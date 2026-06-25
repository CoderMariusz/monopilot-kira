-- 341 — canonical-role READ enablement (the 6-roles "can't see anything" fix)
--
-- The 6 seeded roles are: admin, npd_manager, core_user, dept_manager, dept_user,
-- viewer. admin is a full super-user (307 perms, mig 332) but the other five hold
-- almost nothing (1-18 perms) because the operational grants in mig 080 went to
-- NON-canonical role families. Net: every non-admin role hits "permission denied"
-- panels / an empty sidebar across the app (confirmed in the 2026-06-25 detailed
-- gaps report, per-role section).
--
-- THIS MIGRATION applies the CONSERVATIVE, low-risk layer only: READ/VIEW access +
-- the NPD domain for npd_manager + CSV export for stakeholder/manager roles. It does
-- NOT grant any operational WRITE, APPROVAL, or destructive permission — the exact
-- write/segregation-of-duties matrix is an explicit owner decision (gaps report §5)
-- and is deliberately left for a follow-up once the owner signs off the write matrix.
--
-- Tiers:
--   Tier A (viewer, dept_manager, npd_manager) — "see the business": every read/view/
--     dashboard perm the org's admin holds, EXCLUDING platform-security settings
--     (settings.security|schema|sso|scim|ip_allowlist|d365), plus rpt.export.csv +
--     oee.tv.kiosk_view. ~55 perms.
--   Tier B (core_user, dept_user) — "see the floor": read/view/dashboard perms scoped
--     to shop-floor modules only (production, warehouse, quality, technical, oee,
--     scheduler, ship, mnt, planning, npd). ~23 perms. No finance/settings/security reads.
--   npd_manager additionally gets the FULL npd.* domain (47 perms) — it owns NPD.
--   rpt.export.csv to viewer/dept_manager/npd_manager/core_user (auditor/export need).
--
-- Per-org (derives each org's read catalogue from that org's own admin role),
-- additive + idempotent (insert-where-not-exists), and re-syncs the legacy
-- roles.permissions jsonb cache to match role_permissions (the admin-superuser
-- dual-store invariant — both stores must agree).

-- Tier A — viewer / dept_manager / npd_manager: business reads (exclude platform-security settings)
insert into public.role_permissions (role_id, permission)
select tgt.id, ap.permission
  from public.roles tgt
  join public.roles adm on adm.org_id = tgt.org_id and adm.code = 'admin'
  join public.role_permissions ap on ap.role_id = adm.id
 where tgt.code in ('viewer', 'dept_manager', 'npd_manager')
   and (ap.permission ~ '\.(read|view)$' or ap.permission like '%.dashboard'
        or ap.permission = 'rpt.export.csv' or ap.permission = 'oee.tv.kiosk_view')
   and ap.permission !~ '^settings\.(security|schema|sso|scim|ip_allowlist|d365)'
   and not exists (select 1 from public.role_permissions x where x.role_id = tgt.id and x.permission = ap.permission);

-- Tier B — core_user / dept_user: shop-floor module reads only
insert into public.role_permissions (role_id, permission)
select tgt.id, ap.permission
  from public.roles tgt
  join public.roles adm on adm.org_id = tgt.org_id and adm.code = 'admin'
  join public.role_permissions ap on ap.role_id = adm.id
 where tgt.code in ('core_user', 'dept_user')
   and (ap.permission ~ '\.(read|view)$' or ap.permission like '%.dashboard' or ap.permission = 'oee.tv.kiosk_view')
   and split_part(ap.permission, '.', 1) in
       ('production', 'warehouse', 'quality', 'technical', 'oee', 'scheduler', 'ship', 'mnt', 'planning', 'npd')
   and not exists (select 1 from public.role_permissions x where x.role_id = tgt.id and x.permission = ap.permission);

-- npd_manager owns the full NPD domain
insert into public.role_permissions (role_id, permission)
select tgt.id, ap.permission
  from public.roles tgt
  join public.roles adm on adm.org_id = tgt.org_id and adm.code = 'admin'
  join public.role_permissions ap on ap.role_id = adm.id
 where tgt.code = 'npd_manager' and ap.permission like 'npd.%'
   and not exists (select 1 from public.role_permissions x where x.role_id = tgt.id and x.permission = ap.permission);

-- rpt.export.csv to core_user too (auditor/export need; viewer/dept_manager/npd_manager already covered by Tier A)
insert into public.role_permissions (role_id, permission)
select tgt.id, 'rpt.export.csv'
  from public.roles tgt
 where tgt.code = 'core_user'
   and exists (select 1 from public.roles adm join public.role_permissions ap on ap.role_id = adm.id
                where adm.org_id = tgt.org_id and adm.code = 'admin' and ap.permission = 'rpt.export.csv')
   and not exists (select 1 from public.role_permissions x where x.role_id = tgt.id and x.permission = 'rpt.export.csv');

-- Re-sync the legacy roles.permissions jsonb cache to match role_permissions (dual-store invariant)
update public.roles r
   set permissions = coalesce(
         (select jsonb_agg(distinct rp.permission order by rp.permission)
            from public.role_permissions rp where rp.role_id = r.id),
         '[]'::jsonb)
 where r.code in ('viewer', 'dept_manager', 'npd_manager', 'core_user', 'dept_user');
