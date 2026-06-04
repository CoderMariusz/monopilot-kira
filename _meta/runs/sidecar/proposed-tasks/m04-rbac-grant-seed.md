# PROPOSED TASK — 04-planning-basic: RBAC permission grant seed

**Suggested ID:** 04-T-067 (next free)
**Type:** T1-schema (seed migration)
**Risk tier:** high (unreachable-feature class)
**Closes:** audit finding X-1

## Title
T-067 — Seed planning.* permissions onto roles (`NNN-planning-permission-seed.sql`)

## Scope
Add a SQL seed migration that GRANTS the 15 `planning.*` permission strings (added by T-066) to the appropriate org roles, following the repo's established pattern:
- Model on `packages/db/migrations/146-npd-allergen-write-permission-seed.sql` and `148-settings-infra-permission-seed.sql` (idempotent INSERT … ON CONFLICT DO NOTHING into `role_permissions`, org-scoped, Apex bootstrap org included).
- Grant matrix (derive from PRD §3.2 RBAC table):
  - Planner / Planner Advanced: dashboard.view, po.*, to.*, wo.*, reservation.override (advanced only), sequencing.run, settings.edit (advanced only), integration.d365.so_trigger.run (advanced only).
  - Admin/org.admin: all `planning.*`.
  - Read-only / viewer: dashboard.view + list reads.
- Must seed for the default/Apex org so the live click-through (DoD) does not 403.

## Acceptance criteria
- Migration is idempotent (re-run = no-op).
- After migration, a seeded Planner role resolves `planning.po.create` = allowed; a viewer resolves it = denied (integration test against real local Postgres).
- `assertPermission` (T-033) path returns allow for granted, Forbidden for ungranted.
- `pnpm db:test` green; RLS unaffected.

## Dependencies
- Local: T-066 (enum strings), T-033 (wiring helper).
- Cross-module: 02-SETTINGS RBAC schema (`role_permissions`, mig 080) ✅ DONE.

## Red lines
- Do NOT grant write perms to viewer roles.
- Do NOT hardcode role UUIDs — resolve by role key/name per existing seed pattern.
- Must use `app.current_org_id()` scoping, org_id (Wave0 lock).
