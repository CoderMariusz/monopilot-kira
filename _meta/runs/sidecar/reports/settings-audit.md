# 02-settings — SIDE-CAR adversarial audit (READ-ONLY)

_Date: 2026-06-04. Branch: `kira/long-run`. Auditor: side-car agent (no writes to working tree / no 01-npd changes)._
_Scope: already-signed-off 02-settings module. Goal: real bugs, gaps vs PRD/plan, wrong assumptions, decisions for the human._

Methodology: read `_meta/atomic-tasks/02-settings/{STATUS.md,coverage.md}`, spot-verified ✅ claims against
real source, traced the settings route trees, RBAC permission seeding chain, outbox event constraint, and the
warehouse/onboarding code paths. Findings are evidence-backed with `file:line`.

---

## TL;DR — severity roll-up

| # | Sev | Title | One-line |
|---|-----|-------|----------|
| F1 | **P0** | Infra settings screens unreachable — `settings.infra.*` permission never seeded **and** code checks a non-enum string | Warehouse/Location/Machine/Line screens hard-deny on read for EVERY user incl. owner. Root cause of the "warehouse-add reachability" bug. Gate-5 mislabeled it "intentional RBAC_DENIED". |
| F2 | **P1** | Permission-string vs enum drift (recurring class) | Code checks `settings.infra.read/.update` + `settings.units.manage` that are NOT the enum's `settings.infra.view/.edit`; enum has no `settings.units.*` at all. ESLint enum-lock (T-130) does not catch consumer-side drift. |
| F3 | **P1** | Outbox event-union drift — 6 emitted events violate the DB CHECK constraint | `set-dept`, `set-rule-variant`, `start/rollback-upgrade`, `resend-invitation`, `mark-first-wo` emit event types absent from `outbox_events_event_type_check` → save silently returns `persistence_failed`. |
| F4 | **P1** | Dual settings route tree NOT fully consolidated (W4 claim overstated) | `(admin)/settings/invitations/page.tsx` and `(admin)/settings/reference/manufacturing-operations/page.tsx` are still FULL duplicate client components (not redirects/re-exports), reachable as live routes with their own data loaders. |
| F5 | **P2** | Two divergent `hasPermission` implementations; dead role-name fallback | Load path lacks the role-name fallback the write action has; the fallback list (`owner/admin/module_admin`) does not match seeded role codes (`org.access.admin`…) so it is dead anyway. |
| F6 | **P2** | `deactivateWarehouse` queries `public.work_orders` unguarded | `work_orders` table exists in no migration; deactivate throws → `persistence_failed`. Load path guards with `to_regclass`; the action does not. |
| F7 | **P2** | Legacy redirect shims hardcode `/en/` locale | `(admin)/settings/{users,security}/page.tsx` `redirect('/en/settings/…')` drops the user's active locale. |
| F8 | **P2 / decision** | Cross-module migration dependency not declared | Settings RBAC relies on `role_permissions` (mig 017/080) and the outbox CHECK is rebuilt by 01-npd reconcile migrations (109–140). 02-settings declares migrations only to 074; correctness depends on later, other-module migrations being applied. |
| F9 | info | Status taxonomy: 53 "🔄" + 29 "⏸" tasks signed off as a module | Most UI tasks never reached a real save-path / live-data interaction test; RTL mocks the DB, so F1/F3 class bugs are invisible to the green suite. |

---

## P0

### F1 — Infra settings screens are unreachable for every user (root cause of warehouse-add bug)

**Evidence**
- Screens gate READ on a permission: `apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/page.tsx:17-18`
  `const READ_PERMISSION = 'settings.infra.read'; const UPDATE_PERMISSION = 'settings.infra.update';`
  Same in `infra/machines/page.tsx:95-96`, `infra/lines/page.tsx:16-17`, `infra/locations/page.tsx:180`.
- Load denies when the permission is absent: `infra/warehouses/page.tsx:251`
  `if (!canRead) return { state: 'permission_denied', warehouses: [], canUpdateInfra: false };`
- **No migration ever grants `settings.infra.*` to any role.** `grep -rn "settings.infra" packages/db/migrations/` → **zero hits.**
  The only settings page-permissions ever seeded to admin roles are:
  - `settings.users.manage`, `settings.security.manage` — migration `050-settings-manage-permissions.sql:13-27`
  - `settings.units.manage` — migration `064-unit-of-measure.sql:166-190`
- System roles are seeded with **empty** permission sets and codes `org.access.admin / org.schema.admin / org.platform.admin`
  (`037-settings-core.sql:167-172`), so there is no `owner`-coded role to fall back to either.

**Impact** Owner/admin (the Gate-5 test account `admin@monopilot.test`) gets `permission_denied` on
`/settings/infra/{warehouses,locations,machines,lines}`. The "Add warehouse" dialog lives on a screen that
never renders for them → the warehouse-add path is unreachable. The Gate-5 sweep recorded
`warehouses/machines/lines` as "RBAC_DENIED (owner-gated) — intentional" (`STATUS.md:208,292`). **That is a
misdiagnosis** — it is a missing-permission-seed defect, not intentional gating. By contrast Reference and Units
render because Reference reads regardless of permission (`reference/page.tsx` uses the perm only for `canEdit`)
and Units has its perm seeded (064).

**Fix** Add a migration that seeds `settings.infra.read`+`settings.infra.update` (the strings the code actually
checks — see F2) into the admin roles, mirroring the dual-write pattern of 050/064 (normalized
`role_permissions` + legacy `roles.permissions` JSONB), targeting `r.code in ('owner','admin','org_admin')
or r.slug in ('owner','admin','org.access.admin','org.platform.admin','org.schema.admin')`. Resolve the
enum-string question in F2 first so the seed and the code agree. Then re-run the Gate-5 infra screens.

---

## P1

### F2 — Permission string vs enum drift (recurring class the prompt flagged)

**Evidence**
- Enum (`packages/rbac/src/permissions.enum.ts`): `settings.infra.view`, `settings.infra.edit`,
  `settings.reference.view/.edit/.import`, `settings.schema.view/.edit`. **No `settings.infra.read`,
  no `settings.infra.update`, no `settings.units.*`.**
- Code checks the WRONG strings:
  - infra: `settings.infra.read` / `settings.infra.update` (warehouses/machines/lines/locations pages + all `actions/infra/*.ts`).
  - units: `settings.units.manage` (`settings/units/page.tsx:215`) — not in the enum.
  - schema page even hedges across three: `settings.schema.admin / .edit / .manage` (`settings/schema/page.tsx:161`).

**Impact** Even after F1 seeding, a maintainer must pick which spelling is canonical. The ESLint enum-lock guard
(T-130, `tooling/eslint-rules/`) only protects the enum FILE from edits; it does not detect consumer code that
checks a permission string absent from the enum. So this whole class can (and did) ship green.

**Fix** Decide canonical strings (recommend keeping the enum spellings `settings.infra.view/.edit` and ADDING
`settings.units.view/.manage` to the enum), then make code + seeds use exactly those. Add a lint/test that every
permission string literal used in a `hasPermission(... , 'settings.*')` call exists in the enum (closes the class).

### F3 — Outbox event-union drift: 6 emitted events violate the DB CHECK constraint

**Evidence** `outbox_events_event_type_check` (rebuilt fully in `140-outbox-event-type-reconcile-6.sql`) is the
authority. Diffing the emitted `eventType:` literals against that allow-list, these are emitted by real Server
Actions but in NO migration's constraint:

| Event | Emitted at |
|---|---|
| `settings.dept_override.updated` | `apps/web/actions/tenant/set-dept.ts:83` |
| `settings.rule_variant.updated` | `apps/web/actions/tenant/set-rule-variant.ts` |
| `settings.upgrade.scheduled` | `apps/web/actions/tenant/start-upgrade.ts` |
| `settings.upgrade.rolled_back` | `apps/web/actions/tenant/rollback-upgrade.ts` |
| `settings.user.invitation_resent` | `apps/web/actions/users/invitations-lifecycle.ts` |
| `settings.onboarding.first_wo_created` | `apps/web/actions/onboarding/mark-first-wo-created.ts` |

The emits are inside the action `try` (e.g. `set-dept.ts` returns `persistence_failed` on catch, line ~91), so a
CHECK violation is **swallowed into a generic save error** — the user sees "save failed" with no real cause.
Also note the outbox **enum file** `packages/outbox/src/events.enum.ts` lists only 12 settings events and is stale
vs the DB constraint (missing infra `*.upserted`, `warehouse.deactivated`, etc.) — declared T-003 ✅ is outdated.

**Impact** Dept-taxonomy edits, rule-variant changes, tenant upgrade start/rollback, invitation resend, and the
onboarding "first work order created" step all fail at the outbox insert the moment the path is exercised against
real Supabase. RTL/unit tests mock the client, so the green suite never saw it. The repeated 109/121/126/130/135/140
"reconcile" migrations show this drift is chronic.

**Fix** One migration extending `outbox_events_event_type_check` with the 6 events; sync
`packages/outbox/src/events.enum.ts` to the DB list; add a test asserting every `eventType:` literal under
`apps/web/actions/**` is a member of the constraint (mechanize the union so it stops drifting).

### F4 — Dual settings route tree NOT fully consolidated (W4 changelog overstated)

**Evidence** `STATUS.md:25-27` (W4) claims it "Dropped stale non-localized `(admin)/settings/**` duplicate routes."
Reality — `(admin)/settings/` still contains live `page.tsx`:
- `roles/page.tsx` → thin re-export of the localized client component ✅ (consolidated).
- `users/page.tsx`, `security/page.tsx` → redirect shims ✅ (but see F7 locale bug).
- `invitations/page.tsx` → **full ~330-line duplicate client component** with its own `listInvitations`
  dynamic import + render, NOT a redirect/re-export.
- `reference/manufacturing-operations/page.tsx` → **full duplicate client component** with its own table/DnD logic.

Both duplicates are reachable Next routes (`/settings/invitations`, `/settings/reference/manufacturing-operations`,
non-localized) and diverge from the canonical localized screens
(`[locale]/(app)/(admin)/settings/invitations/page.tsx`, `.../reference/manufacturing-operations/`).
The guard test (`(admin)/settings/__tests__/admin-settings-guards.test.ts`) was repointed to canonical paths for
roles/users/security but still reads the LOCAL duplicate for invitations/mfg-operations — so it green-lights the split.

**Impact** Two sources of truth for two screens; the bare-URL versions can drift from the localized ones, miss
i18n, and bypass the localized server loader. Consolidation is ~70% done, not done.

**Fix** Reduce `(admin)/settings/invitations/page.tsx` and `(admin)/settings/reference/manufacturing-operations/page.tsx`
to redirect shims (or re-exports) like roles/users/security; repoint the guard test to the canonical localized sources.

---

## P2

### F5 — Two divergent `hasPermission` implementations; dead role-name fallback
- Write action `actions/infra/warehouse.ts:187-200` adds `or r.code = any($4) or r.slug = any($4)` with
  `['owner','admin','module_admin']`. Load path `infra/warehouses/page.tsx:145-158` has NO such fallback.
- The fallback list never matches seeded role codes (`org.access.admin` etc. per 037), so it is dead code that
  gives a false sense of "owner always allowed." Net: load can deny while the action would allow → inconsistent UX;
  and neither actually rescues the F1 missing-seed because the codes don't match. Consolidate to one shared helper
  with the correct role codes.

### F6 — `deactivateWarehouse` unguarded `public.work_orders` query
- `actions/infra/warehouse.ts:173-185` (`countActiveWorkOrders`) selects from `public.work_orders` directly.
  `work_orders` is created in NO migration (`grep "create table.*work_orders"` → zero). Throw → caught →
  `persistence_failed` (line 120-122). The load query guards the same table via `to_regclass` (page.tsx:160-179);
  the action does not. Latent until F1 makes the screen reachable, then deactivate always fails.

### F7 — Legacy redirect shims hardcode `/en/` locale
- `(admin)/settings/users/page.tsx:4` `redirect('/en/settings/users')`; `(admin)/settings/security/page.tsx`
  `redirect('/en/settings/security')`. A `ro`/`uk`/`pl` user hitting the bare URL is forced to English.
  Use the request locale (or the locale-less canonical path) instead of a hardcoded `/en/`.

### F8 — Cross-module migration dependency not declared (decision)
- Settings RBAC reads `role_permissions` (created by `017-rbac.sql`, NPD-seeded by `080`) and the outbox CHECK is
  authoritative only after the 01-npd reconcile chain (109–140). 02-settings's own manifest declares migrations to
  ~074. So settings correctness silently depends on other modules' later migrations being applied. This is a
  sequencing/ownership hazard worth an explicit cross_module_dependency note (and is why F3 events "should" be
  added by a settings-owned migration, not left for an NPD reconcile to maybe pick up).

---

## Spot-verification of ✅ claims (sampling)
- T-034 SCIM bearer integration test — `apps/web/__tests__/scim/bearer.integration.test.ts` EXISTS (substantive). ✅
- T-130 ESLint enum-lock — `tooling/eslint-rules/rules/no-direct-permissions-enum-edit.mjs` EXISTS. ✅ (but see F2 scope gap)
- T-009 warehouses schema vs onboarding insert — columns match (`042-infra-master.sql:8-18`); onboarding
  `create-first-warehouse.ts` insert is correct. ✅
- No money-as-float in settings migrations (tax rate `numeric(5,4)`, capacity `numeric(18,6)`). ✅
- Orphan `(settings)/schema/_actions/draft.ts` + `(settings)/reference/allergens/_actions/emit-bulk-changed.ts`
  are still imported by localized pages — not dead, fine.

## Assumptions to revise
1. STATUS.md "11 groups CAPTURED, 6 RBAC_DENIED + intentional" → at least the 3 infra screens are NOT intentional;
   they are F1 defects. The sign-off's "no bugs" conclusion for the denied set is wrong for infra.
2. W4 "dropped duplicate routes" → only partially true (F4).
3. T-003 outbox enum ✅ "functionally complete" → enum file is stale and the DB constraint is the only thing kept
   current (and even it lacks the F3 six).
4. "RTL/unit parity green" as a quality bar hides the entire save-path/permission/outbox class (F1/F3); these only
   surface against real Supabase with a real authenticated click that performs a write.

---

## DECISIONS NEEDED (human)
1. **Canonical permission strings** — adopt enum spellings (`settings.infra.view/.edit`) and refactor code+seeds, OR
   add `settings.infra.read/.update` + `settings.units.*` to the enum to match code? (Pick one; F1+F2 both block on it.)
2. **Infra RBAC seed scope** — seed infra perms to the same admin-role set as 050/064, or introduce a distinct
   infra-admin role? (Affects whether the org-admin test account should see infra at all.)
3. **`work_orders` dependency** — is settings allowed to reference a table owned by 04-planning/08-production? If not,
   the warehouse active-WO guard must be capability-gated (`to_regclass`) in the action too (F6), consistent with the
   load path.
4. **Re-open the 02-settings sign-off?** F1 (P0) means a headline feature (warehouse management) is unreachable in
   the deployed product. Recommend: file the 3 proposed tasks below, fix F1+F2+F3, re-run Gate-5 on infra +
   one real dept-override/upgrade save, then re-sign.

## Proposed tasks
See `_meta/runs/sidecar/proposed-tasks/`:
- `settings-P0-infra-rbac-seed.md` (F1)
- `settings-P1-permission-enum-consumer-lock.md` (F2)
- `settings-P1-outbox-event-union-fix.md` (F3)
- `settings-P2-route-tree-consolidation.md` (F4 + F7)
- `settings-P2-warehouse-action-hardening.md` (F5 + F6)
