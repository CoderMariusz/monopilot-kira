# 02-Settings Reachability + Fix — Side-car Report

**Agent:** SIDE-CAR reachability+fix (runs alongside 01-npd sign-off — no NPD files touched)
**Worktree:** `/Users/mariuszkrawczyk/Projects/kira-wt/sc-settings-reach`
**Branch:** `wt/sc-settings-reach`
**New migration:** `packages/db/migrations/210-settings-infra-permission-seed.sql`
**Date:** 2026-06-04
**Live env checked:** Supabase project `khjvkhzwfzuwzrusgobp`, org `Apex` (`00000000-0000-0000-0000-000000000002`)
**Test user:** `admin@monopilot.test` (auth uid `31fe18af-43f7-4c05-a078-db23a9a5bd3e`) → DB role **`org.access.admin`** (NOT `admin`)

---

## Root causes

### (a) Cannot add a warehouse — CONFIRMED BUG (fixed in worktree)

**Root cause: permission string-name mismatch / unseeded permission (the recurring repo bug class).**

The entire Settings → Infrastructure section (warehouses, machines, locations, lines) gates on:
- READ gate (page-level): `settings.infra.read`
- WRITE gate (create/edit/deactivate, in both the page and the Server Action): `settings.infra.update`

Neither string is seeded by any migration in the branch. On the **live** DB the admin role instead carries the *wrong* strings `settings.infra.view` and `settings.infrastructure.edit` — which **no code path ever reads**. Result for `admin@monopilot.test`:

1. `settings/infra/warehouses/page.tsx` → `loadWarehouses()` calls `hasPermission(READ_PERMISSION='settings.infra.read')`. The page-level `hasPermission` (page.tsx lines 145-158) only accepts `rp.permission is not null OR roles.permissions ? perm` — it has **NO admin role-code fallback**. Both are false → page returns `state: 'permission_denied'`. The user sees "You do not have permission to view warehouse infrastructure settings." and the **"Add warehouse" control is never rendered** (`canUpdateInfra=false`).
2. Even if the user reached the create action (`actions/infra/warehouse.ts`), its `hasPermission` fallback only accepts role codes `owner`/`admin`/`module_admin` — and the live user is `org.access.admin`, which is **not** in that list — so it would also 403.

This is the identical class to the `npd.allergen.write` (migration 146) and `gdpr.erasure.execute` (migration 116) bugs.

**Blast radius:** same two strings gate machines, locations, and lines too (`actions/infra/{machine,location,line}.ts` + their pages). The fix covers all four infra sub-pages.

### (b) Cannot access the onboarding wizard — NOT A BUG (expected; no fix made)

**Root cause: onboarding is already complete for this org — the wizard is a one-time flow, by design.**

Live data:
- `auth.users.app_metadata` for the test user: `role=admin`, `onboarding_completed_at=2026-06-03T19:20:27.981Z` (also mirrored in `user_metadata`).
- `organizations` (Apex): `onboarding_completed_at` set; `onboarding_state = {current_step:6, completed_steps:[1,2,3], skipped_steps:[4,5]}` → step 6 = `completion`.

Flow analysis:
- Middleware (`apps/web/proxy.ts:232`) only force-redirects into onboarding **when `onboarding_completed_at` is null**. It is set, so the user is NOT pushed into the wizard.
- Wizard step pages call `redirectIfOnboardingStepMismatch(expectedStep, actualStep)` (`app/onboarding/_routing.ts`). With `current_step = completion`, visiting `/onboarding/profile` (or any step) redirects to `/onboarding/complete`. There is **no "restart / re-open onboarding" entry path** once complete — the settings panel `settings/onboarding/page.tsx` only shows a "Review onboarding" CTA pointing back at the (already-completed, redirect-looping) wizard.
- The onboarding data loader (`actions/onboarding/load.ts`) does **not** gate on any RBAC permission. `settings.onboarding.complete` is checked only at the completion step, and it IS seeded. So onboarding is NOT permission-blocked.

**Conclusion:** "Can't access the wizard" = the wizard is correctly closed because Apex already finished onboarding during Gate-5. This is expected. No code/DB fix is warranted. **If the human wants a re-runnable wizard or an admin "reset onboarding" affordance, that is a NEW feature, not a bug** (see Decisions Needed).

### (c) Is warehouse a 02-settings feature? — YES (settings-scoped)

Warehouse **infrastructure CRUD** lives in 02-settings (`settings/infra/warehouses`, `actions/infra/warehouse.ts`) — this is org infrastructure config, distinct from the unbuilt 05-warehouse module (License Plates / FEFO inventory). The reported "add a warehouse" maps to the settings infra page. The fix is correctly settings-scoped.

---

## The fix

**File added (worktree only — NOT committed, NOT merged):**
`packages/db/migrations/210-settings-infra-permission-seed.sql`

**What it does** (mirrors the `116-gdpr-erasure-permission-seed.sql` pattern: SECURITY DEFINER function + AFTER INSERT trigger + backfill, idempotent):
- Seeds `settings.infra.read` AND `settings.infra.update` into both `role_permissions` (normalized) and `roles.permissions` (legacy JSONB cache).
- Grants to the **admin-class role set used by migration 050**: codes `owner`/`admin`/`org_admin` and slugs `owner`/`admin`/`org.access.admin`/`org.platform.admin`/`org.schema.admin`. Deliberately includes `org.access.admin` because that is the live test user's role.
- Trigger `trg_zzz_seed_settings_infra_permissions` fires AFTER `trg_seed_npd_role_permissions` (080) so roles exist; new orgs inherit the grant automatically.
- Backfills every existing org.

**Migration numbering:** 210 — well above the active NPD range (075-147; current HEAD max = 147), 3-digit prefix as required by the runner (`packages/db/scripts/migrate.ts` regex `^(\d{3})-[a-z0-9-]+\.sql$`). No collision.

### Validation (real output, throwaway clone)

```
# clone canon -> sc_settings_test (template copy of monopilot @ migration 147)
$ psql .../postgres -c "drop database if exists sc_settings_test;" -c "create database sc_settings_test template monopilot;"
DROP DATABASE
CREATE DATABASE

# BEFORE: zero infra permission rows
$ psql .../sc_settings_test -At -c "select count(*) from role_permissions where permission in ('settings.infra.read','settings.infra.update');"
0

# APPLY migration 210
$ psql .../sc_settings_test -v ON_ERROR_STOP=1 -f packages/db/migrations/210-settings-infra-permission-seed.sql
CREATE FUNCTION / REVOKE x2 / CREATE FUNCTION / REVOKE x2 / DROP TRIGGER / CREATE TRIGGER / DO    (no errors)

# AFTER: rows seeded to all 4 admin-class roles x 2 perms x 2 orgs = 16; JSONB synced
admin              -> read t, update t
org.access.admin   -> read t, update t   <-- the live test user's role
org.platform.admin -> read t, update t
org.schema.admin   -> read t, update t
core_user / viewer -> f, f               <-- least-privilege preserved

# IDEMPOTENT: re-run backfill, count stays 16 (on conflict do nothing works)
16

# NEW-ORG TRIGGER: insert a fresh org -> auto-seeds 8 rows (4 admin roles x 2 perms), no dupes
admin/org.access.admin/org.platform.admin/org.schema.admin -> read + update    (8 rows)

# cleanup
$ psql .../postgres -c "drop database if exists sc_settings_test;"
DROP DATABASE
```

The migration is validated: backfill + new-org trigger + idempotency all proven against a real clone.

> **NOTE on env drift (important for the integrator):** The **live** Supabase DB already carries a much richer admin-role grant than the branch migrations produce (30 settings.* perms incl. users/roles/audit/reference/authorization/flags/org) — it was hand-seeded during Gate-5 and is **NOT reproducible from version control**. The branch's local canon DB only has 3 settings perms on `org.access.admin`. Migration 210 is the **durable, version-controlled** fix for the infra strings; it makes the infra pages reachable on any freshly-migrated DB (local, new tenants, and a future clean re-provision of live), independent of the manual live seed.

---

## Reachability audit — 02-settings × admin test user (`org.access.admin`)

"Live" = state observed on Supabase `khjvkhzwfzuwzrusgobp` for the Apex org test user. "Canon/branch" = behavior on a clean DB built from this branch's migrations (what ships).

| Route / feature | Gate (permission) | Seeded on LIVE? | Seeded by branch migrations? | Page has admin fallback? | Reachable LIVE (now) | Reachable on clean branch DB | After migration 210 |
|---|---|---|---|---|---|---|---|
| **settings/infra/warehouses** (add/deactivate WH) | `settings.infra.read` (view) + `settings.infra.update` (write) | ❌ (live has wrong strings `infra.view`/`infrastructure.edit`) | ❌ | ❌ none | **FORBIDDEN-missing-perm** | FORBIDDEN | **OK** ✅ |
| **settings/infra/machines** | `settings.infra.read`/`update` | ❌ | ❌ | ❌ none | FORBIDDEN-missing-perm | FORBIDDEN | **OK** ✅ |
| **settings/infra/locations** | `settings.infra.update` | ❌ | ❌ | ❌ none | FORBIDDEN-missing-perm | FORBIDDEN | **OK** ✅ |
| **settings/infra/lines** | `settings.infra.read`/`update` | ❌ | ❌ | ❌ none | FORBIDDEN-missing-perm | FORBIDDEN | **OK** ✅ |
| settings/warehouses | (redirect → infra/warehouses) | n/a | n/a | n/a | redirect then FORBIDDEN | redirect then FORBIDDEN | redirect then OK ✅ |
| **/onboarding/** wizard | none (already-complete state gate) | onboarding complete | n/a | n/a | **EMPTY/redirect-to-complete (expected — finished)** | reachable if onboarding not done | unchanged (out of scope) |
| settings/onboarding (panel) | none | n/a | n/a | n/a | OK (shows status, "Review" CTA loops to complete) | OK | unchanged |
| settings/users | `settings.users.view`/`invite`/`roles.assign`/`create`/`deactivate` (JSONB `?\|`) | ✅ (live seed) | ❌ (050 seeds only `users.manage`) | JSONB fallback only | **OK** (live) | FORBIDDEN on clean DB ⚠️ | OK live / still FORBIDDEN clean |
| settings/roles | `settings.roles.view`/`assign`/`manage` + code/slug `owner`/`admin` | ✅ | ❌ | code/slug `owner`/`admin` only (not `org.access.admin`) | **OK** (live, via seeded perm) | FORBIDDEN clean ⚠️ | OK live / FORBIDDEN clean |
| settings/security | `settings.security.view`/`manage`/`edit` + code/slug fallback | ✅ (`security.manage` seeded by 050 + live) | partial (050 seeds `security.manage`) | code/slug fallback | OK | depends (manage seeded → OK) | OK |
| settings/audit-logs, settings/audit | `settings.audit.read` | ✅ | ❌ | varies | OK live | FORBIDDEN clean ⚠️ | OK live / FORBIDDEN clean |
| settings/reference (+ import) | `settings.reference.view`/`edit`/`import` | ✅ | ❌ | direct check | OK live | FORBIDDEN clean ⚠️ | OK live / FORBIDDEN clean |
| settings/authorization | `settings.authorization.edit`/`view` | ✅ | ❌ | direct check | OK live | FORBIDDEN clean ⚠️ | OK live / FORBIDDEN clean |
| settings/flags, settings/features, settings/modules | `settings.flags.edit`/`view` | ✅ | ❌ | ❌ none (same broken pattern) | OK live | FORBIDDEN clean ⚠️ | OK live / FORBIDDEN clean |
| settings/integrations/d365 (+ sync/mapping/audit) | `settings.d365.*` | ✅ | ❌ | varies | OK live | FORBIDDEN clean ⚠️ | OK live / FORBIDDEN clean |
| settings/company, settings/profile, settings/my-profile, settings/my-notifications | `settings.org.read`/`update` / self | ✅ / self | partial | varies | OK | mostly OK | OK |
| settings/* stub/placeholder routes (gallery, promotions, partners, processes, products, quality, shifts, sites, units, labels, devices, boms, ship-override-reasons, schema-*, tenant/*, etc.) | varies / stub | varies | mostly ❌ | varies | mixed (many are stubs → EMPTY/NOT-BUILT) | mixed | unchanged |

**Audit headline:** On the **live** env the ONLY reported-class failure is the **infra group (warehouses/machines/locations/lines)** — every other functional settings page is reachable because the live admin role was hand-seeded with the correct strings. On a **clean branch DB**, the failure is much broader (⚠️ rows) because the branch migrations seed only 3 settings perms (`onboarding.complete`, `security.manage`, `users.manage`) while pages check ~25 different strings. Migration 210 fixes the infra group everywhere; the broader clean-DB gap is a separate decision (below).

---

## Decisions needed (human)

1. **Integrate migration 210** after 01-npd sign-off. It is the durable fix for "can't add a warehouse." Branch `wt/sc-settings-reach`, file `packages/db/migrations/210-settings-infra-permission-seed.sql`. (Renumber only if 075-209 fill up before integration; runner needs a 3-digit prefix.) Apply to live too — live currently relies on hand-seeded wrong strings (`settings.infra.view`/`settings.infrastructure.edit`) that no code reads. **Optional cleanup:** drop those two dead strings from the live admin role after 210 is applied.

2. **Onboarding is NOT broken — confirm expected.** Apex finished onboarding (step 6) during Gate-5, so the wizard correctly redirects to `/onboarding/complete`. If the product needs a re-runnable wizard or an admin "reset onboarding" action, that is a **new feature** to scope, not a bug fix. No change made.

3. **Branch-vs-live RBAC drift (systemic, bigger than this side-car).** The live admin role carries ~30 settings perms that **do not exist in any version-controlled migration** (hand-seeded during Gate-5). On a clean re-provision, ~10 settings page-groups (users, roles, audit, reference, authorization, flags/features/modules, d365) would be FORBIDDEN for admins because migration 050 seeds only `users.manage`/`security.manage` while the pages check `users.view`, `roles.assign`, `audit.read`, `reference.view`, `authorization.edit`, `flags.edit`, etc. **Recommend** a follow-up migration (a settings RBAC matrix seed, analogous to 080 for NPD) that grants the full settings.* permission set the pages actually check to the admin-class roles — so the live hand-seed becomes reproducible. This is out of scope for the reported warehouse/onboarding bug and is left as a flagged decision rather than silently expanded here.

4. **Secondary hardening (optional).** The infra Server Action `hasPermission` role-code fallbacks (`actions/infra/{warehouse,machine,location,line}.ts`) use `['owner','admin','module_admin']` and omit `org.access.admin`/`org.platform.admin`. With migration 210 the seeded permission rows make this moot, but for defense-in-depth the fallback lists could be aligned to the migration-050 admin set. Not changed (would be gold-plating beyond the reported bug).

---

## Constraints honored
- No 01-npd files touched; no migrations 075-147 touched; only NEW file `210-...sql` added in the worktree.
- No `package.json` / `pnpm-lock` / repo tooling / `with-org-context` changes.
- Not committed, not merged. All changes isolated in `wt/sc-settings-reach`. Throwaway validation DB `sc_settings_test` created and dropped.
