# PROPOSED TASK(S) — 07-planning-ext: RBAC wiring + grant seed

**Suggested IDs:** 07-T-059 (wiring), 07-T-060 (grant seed)
**Type:** T-059 = T2-api (wiring) · T-060 = T1-schema (seed migration)
**Risk tier:** high (unreachable-feature class; 07 currently has NEITHER wiring nor seed)
**Closes:** audit findings X-1 + 07-F2

## Why two tasks
04-planning-basic has a dedicated RBAC-wiring task (T-033) + needs a grant seed. 07 has **neither** — `scheduler.*` is only asserted ad-hoc inside individual API task prompts, with no single guarantee the matrix is wired and granted. Add both.

---
## T-059 — Wire scheduler.* RBAC across all scheduler routes/pages
### Scope
- Mirror 04 T-033: implement/reuse `assertPermission(action, ctx)` reading the role→permission matrix from 02-SETTINGS, wired into every `/api/scheduler/*` route handler (T-012..T-020), every assignment mutation (approve/override/reject/bulk), and every page-level guard (T-030..T-052).
- Permission set per PRD §3.1/§3.2: scheduler.run, scheduler.dry_run, scheduler.assignment.approve, .override, .reject, .bulk_approve, scheduler.matrix.edit, .publish, .import, scheduler.forecast.upload, scheduler.settings.edit (11 strings from T-058).
- Role gates: Planner Advanced (run/approve/override), Scheduling Officer (dry_run/reject), Admin (all).
### AC
- Each scheduler route returns 403 for a role lacking the perm, 2xx for a role with it (integration tests, real Postgres).
- Page guards redirect/deny ungranted roles.

## T-060 — Seed scheduler.* permissions onto roles (`NNN-scheduler-permission-seed.sql`)
### Scope
- Idempotent grant migration following `148-settings-infra-permission-seed.sql` pattern; grant the 11 `scheduler.*` strings to Planner Advanced / Scheduling Officer / Admin for the default/Apex org.
### AC
- Idempotent; seeded Planner Advanced resolves `scheduler.run` = allowed; viewer = denied.
- DoD live click-through to /scheduler does not 403 for a seeded planner.

## Dependencies
- Local: T-058 (enum strings); T-059 depends on T-060 for green integration tests (or seed test-fixtures).
- Cross-module: 02-SETTINGS RBAC schema ✅ DONE.

## Red lines
- org_id Wave0 lock; `app.current_org_id()` scoping; no hardcoded role UUIDs; no write perms to viewers.
