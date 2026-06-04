# PROPOSED TASK — 08-production: RBAC permission grant seed

**Suggested ID:** 08-T-057 (next free)
**Type:** T1-schema (seed migration)
**Risk tier:** high (unreachable-feature class)
**Closes:** audit finding X-1

## Title
T-057 — Seed production.* permissions onto roles (`NNN-production-permission-seed.sql`)

## Scope
Add an idempotent SQL seed migration GRANTING the 17 `production.*` permission strings (added by T-056) to the correct org roles, modeled on `packages/db/migrations/146-npd-allergen-write-permission-seed.sql` / `148-settings-infra-permission-seed.sql`.
Grant matrix derived from PRD §3 owner table (PRD §3 "RBAC" lines ~196–202):
- Operator: wo.start/pause/resume/complete, consume, output.register, waste.record.
- Shift Lead: + over-consumption approve, allergen changeover first sign-off, shift sign-off.
- Quality Lead: allergen changeover second sign-off, qa_status write, oee read.
- Prod Manager: + yield-gate override, downtime manage, DLQ read/replay, settings.
- Service/system role: oee_snapshots auto-write, D365 dispatch (already system-actor; verify not granted to humans).
Seed for the default/Apex org so the DoD live click-through does not 403.

## Acceptance criteria
- Idempotent (re-run = no-op).
- Seeded Operator resolves `production.wo.start` = allowed but `production.allergen.sign_off_second` = denied (integration test, real Postgres).
- Quality Lead resolves `production.allergen.sign_off_second` = allowed (dual-sign-off path reachable).
- `pnpm db:test` green; RLS unaffected.

## Dependencies
- Local: T-056 (enum strings).
- Cross-module: 02-SETTINGS RBAC schema (mig 080) ✅ DONE.

## Red lines
- org_id Wave0 lock; `app.current_org_id()` scoping.
- Do NOT grant `oee_snapshots` write or D365 dispatch to human roles (system-actor only) — D-OEE-1 / R15 boundaries.
- No hardcoded role UUIDs.
