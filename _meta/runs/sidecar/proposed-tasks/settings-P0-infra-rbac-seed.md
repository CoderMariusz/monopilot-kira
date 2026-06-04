# PROPOSED TASK — [P0] Seed `settings.infra.*` RBAC so infra screens are reachable

**Module:** 02-settings · **Severity:** P0 · **Source:** side-car audit F1 (+depends on F2 decision)

## Problem
`/settings/infra/{warehouses,locations,machines,lines}` hard-deny on read because no migration ever grants
`settings.infra.*` to any role. Owner/admin test account hits `permission_denied`; the "Add warehouse" dialog is
unreachable. Gate-5 sweep mislabeled this "intentional RBAC_DENIED" (STATUS.md:208,292).

## Evidence
- `apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/page.tsx:17-18,251` (read gate → permission_denied)
- `grep -rn "settings.infra" packages/db/migrations/` → 0 hits (never seeded)
- Only `settings.users.manage`/`settings.security.manage` (mig 050) + `settings.units.manage` (mig 064) are seeded.
- System roles seeded empty (`037-settings-core.sql:167-172`).

## Acceptance criteria
1. New migration grants `settings.infra.read` + `settings.infra.update` (the strings the code checks — confirm with F2)
   to admin roles, dual-write to normalized `role_permissions` AND legacy `roles.permissions` JSONB, mirroring 050/064.
2. Target role selector matches 050: `r.code in ('owner','admin','org_admin') or r.slug in
   ('owner','admin','org.access.admin','org.platform.admin','org.schema.admin')`.
3. Idempotent (`on conflict do nothing`); applied + verified on Supabase `khjvkhzwfzuwzrusgobp`.
4. Gate-5 re-run: `/settings/infra/warehouses` renders (not denied) for `admin@monopilot.test`; Add-warehouse dialog
   opens; a real create persists a row and the row appears.

## Notes / dependencies
- BLOCKED ON F2 decision (canonical permission spelling). Do not seed `.read/.update` if F2 chooses `.view/.edit`.
- Also seed any other unreachable settings perms found denied at Gate-5 (schema, d365, email, flags, authorization)
  — audit each screen's gate; reference reads-without-perm so it is exempt.
