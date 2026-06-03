---
name: MON-domain-settings
description: Use when implementing 02-settings tasks — the settings/admin module (users/roles/RBAC, security/MFA/SAML/SCIM, reference data, schema-driven columns, feature flags, integrations, audit log, tenant upgrade/canary, account). HEAVY UI: prototype parity + real Supabase data (no hardcode) are the two hard gates for every screen.
---

# MON-domain-settings — 02-settings implementation rules

Read FIRST: `MON-project-overview`, then `MON-t3-ui` (UI parity), `MON-t2-api` (Server Actions),
`MON-t1-schema` (RLS), `Mon-ui` (prototype→production workflow), `MON-multi-tenant-site` (org_id/RLS).
Scope: `_meta/atomic-tasks/02-settings/` (153 tasks; ~106 pending — mostly UI parity for ~57 screens +
T-122-style migration + SCIM fixes). STATUS: `_meta/atomic-tasks/02-settings/STATUS.md`.

## THE TWO HARD GATES (every settings task — non-negotiable)

1. **Prototype parity.** Every screen must match its prototype JSX 1:1 (structure, states, interactions).
   - Prototypes live in `prototypes/design/Monopilot Design System/settings/*.jsx` (note the spaces — always quote):
     `access-screens.jsx` (users/roles/RBAC), `account-screens.jsx`, `admin-screens.jsx`, `data-screens.jsx` /
     `data.jsx` (reference + schema columns), `integrations.jsx`, `audit-log-full.jsx`, `app.jsx`, plus
     `modals.jsx` / `_shared/modals.jsx` for dialogs.
   - Cite a **literal anchor** `prototypes/design/Monopilot Design System/settings/<file>.jsx:<start>-<end>`,
     verify range with `wc -l "<path>"`, translate to shadcn/ui (no verbatim JSX paste, no raw `<select>`,
     `@radix-ui/*` only inside `packages/ui`). Implement all 5 states: loading/empty/error/permission-denied/optimistic.
   - Evidence at closeout: per-state screenshot/Playwright trace + axe (0 or justified) + parity diff. This is
     Gate 2 (`02-QUALITY-GATES.md`) — the #1 cause of the "podziurawiony" design; a UI task with no parity
     evidence DOES NOT merge.

2. **Real data — NO hardcode/mocks.** Every link/page must read/write **real Supabase data**, never a
   hardcoded array or mock.
   - Reads: Server Components / Server Actions via `withOrgContext` (`apps/web/lib/auth/with-org-context.ts`)
     → org-scoped, RLS-enforced (`app.current_org_id()`). Pattern reference: `(modules)/_actions/skeleton-data.ts`.
   - Writes: Server Actions wrapped in `withOrgContext` + zod validation + outbox (T-2 api rules).
   - If a settings screen currently renders placeholder/hardcoded content, that's a GAP to fix (Bucket C) —
     wire it to the real table. A screen "looks done" but shows fake data = NOT done.

## Known structural issue to resolve (UI polish)
There are **two settings route trees**: `apps/web/app/(admin)/settings/**` AND
`apps/web/app/[locale]/(app)/(admin)/settings/**`. The **localized** tree (`[locale]/(app)/(admin)/settings`)
is canonical (matches the app shell + next-intl routing the skeleton uses); the non-localized `(admin)/settings`
tree is likely stale/duplicate. During the module: consolidate onto the localized tree (don't leave dead
duplicate routes), confirm every AppSidebar/settings sub-nav link resolves to a real localized page with real data.

## Domain ownership / canonical (don't cross)
- RBAC: `packages/rbac` `grantRole`/`revokeRole` are canonical (SoD/dual-control/jti guards) — call them,
  never fork. Permission strings via `permissions.enum.ts` (append-serialize; settings adds `settings.*`).
- Schema-driven columns (Reference.DeptColumns, draft/publish), rule-registry DSL, feature-flag evaluation
  are `impl-logic` cores → route per the 3-tier rule (`01-MODEL-ROUTING.md`): hard logic → Opus, medium → Codex,
  easy (single-statement migrations, seeds, tests, docs) → Sonnet.
- SCIM/SAML/MFA: foundation built the engines (packages/auth + the v2 SCIM routes, T-091 Groups); settings
  owns the admin UI/config screens on top. Reuse, don't reimplement.
- Migrations: next free number is dynamic — `git ls-files packages/db/migrations | sort | tail`; never invent.
  Foundation reached 062. Honor the migration-serialization lock.

## Gates recap (all four, per task)
G1 real tests run + captured (DB-gated suites against a real Postgres/local DB — foundation's pattern) ·
G2 prototype parity (above) · G3 deps DONE in STATUS · G4 cross-provider review (Opus UI → Codex; Codex → Opus/Sonnet).
DoD echo: a user logs in and clicks every settings link → sees a prototype-faithful screen backed by real Supabase data.
