# 02-settings — Gate-5 Live Verification Sweep

- **Date:** 2026-06-03
- **Preview deploy (verified against):** `dpl_BB8GcQeDcAExwB4z8Myp65REWkxQ`
  (`monopilot-kira-gzmyy641s…`, branchAlias `monopilot-kira-git-kira-long-run…`, READY, commit `e63345f5` = migration 071)
- **Branch / checkout:** `kira/long-run` (main checkout). Code fixes applied locally, NOT committed/pushed (orchestrator owns commits).
- **Auth:** admin@monopilot.test (org "MonoPilot MES" / Apex). NOTE: this account is org-admin for most screens but **not** org-owner (d365/sync) and **not** flags-admin (settings/flags) — those are graceful RBAC denials, not bugs.

## Headline result

Data plane is healthy. Every authenticated settings/account route renders real Supabase data, an honest empty-state, or a graceful permission/forbidden state. **Two screens were CRASHING with an uncaught server exception (Next.js RSC error boundary). Both are now fixed in code** — same root cause class.

## Root cause of both crashes (identical class)

Live server error (captured from Vercel runtime logs for `GET /en/settings/infra/lines` and `GET /en/settings/users`, level=error):

```
Error: Functions cannot be ...   ← truncated by the API; full form is the standard Next.js RSC error:
"Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with 'use server'."
```

A Server Component page was passing a **plain function** (not a `'use server'` server action) as a prop to a Client Component. Next.js 16 cannot serialize a plain closure across the RSC boundary → it throws during render → the page is replaced by the global error boundary ("This page couldn't load / A server error occurred", `ERROR 2923698551` for lines, `ERROR 173187991` for users).

### Fixes applied

| File | Bug | Fix |
|------|-----|-----|
| `apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx` | `activateLineForClient` fell back to an inline arrow `((input) => activateProductionLine(input))` — a plain closure — passed to `LinesScreen` (client). | Pass the `'use server'` action `activateProductionLine` **directly** (no wrapping closure). |
| `apps/web/app/[locale]/(app)/(admin)/settings/users/page.tsx` | `resetPasswordAction={async ({ userId }) => { … }}` — an inline async arrow defined in the Server Component — passed to `SettingsUsersScreen` (client). | Extracted a module-scope `async function resetPasswordAction(...) { 'use server'; … }` that maps `{ userId }` → `resetPassword({ targetUserId })`, and reference it directly. |

Note: the lines page's `loadLines()` is already wrapped in try/catch (graceful 'error' state), so the SQL was never the crash — the crash happened later, when rendering the client component with the bad prop. Verified the lines loader SQL columns (`production_lines`, `line_machines.sequence`, `locations.path`, `machines`, `warehouses`) all match the live schema via `information_schema.columns`.

## Full route sweep

State legend: OK = real data rendered · EMPTY = honest empty-state (real loader, no rows) · DENIED = graceful permission/forbidden state (RBAC, not a bug) · STUB = other-module placeholder per D8 (not a bug) · CRASH = uncaught error boundary.

| Route (`/en…`) | State | Real data? | Root cause / note |
|---|---|---|---|
| /settings/company | OK | yes | Identity/Address/Contact/Locale, org "MonoPilot MES" |
| /settings/infra/lines | **CRASH → FIXED** | yes (loader OK) | RSC "Functions cannot be passed" — inline closure prop. Fixed. |
| /settings/infra/warehouses | OK | yes | `settings-warehouse-list` |
| /settings/infra/locations | OK | yes | 1 row (BIN_1/Zone A, ltree depth 3), read-only |
| /settings/infra/machines | DENIED/OK | yes | Loader renders; machine edit gated on `settings.infra.update` |
| /settings/shifts | STUB | n/a | "Shifts & calendar" — other-module/stub per D8 |
| /settings/products | STUB | n/a | "Products & SKUs" — other-module/stub per D8 |
| /settings/boms | STUB | n/a | "BOMs & recipes" — other-module/stub per D8 |
| /settings/processes | STUB | n/a | "Processes" — other-module/stub per D8 |
| /settings/reference/manufacturing-operations | OK | yes | "Manufacturing Operations" |
| /settings/partners | STUB | n/a | "Suppliers & customers" — other-module/stub per D8 |
| /settings/units | OK | yes | 9 rows (kg/g/mg/t…), base-unit flags |
| /settings/import-export | OK | yes | "Import / Export" |
| /settings/users | **CRASH → FIXED** | yes (loader OK) | RSC "Functions cannot be passed" — inline `resetPasswordAction`. Fixed. |
| /settings/security | OK | yes | 13 policy rows (2FA/session/password) |
| /settings/audit | EMPTY | yes | Renders; 0 audit rows (org-scoped, honest empty) |
| /settings/devices | STUB | n/a | "Scanner devices" — other-module/stub per D8 |
| /settings/notifications | OK | yes | `notifications_screen` |
| /settings/features | EMPTY | yes | "No feature flags configured for this workspace" (Premium plan note) |
| /settings/integrations | OK | yes | `integrations_screen` |
| /settings/integrations/d365 | OK | yes | `d365_connection_screen` |
| /settings/integrations/d365/mapping | OK | yes | `d365_mapping_screen` |
| /settings/integrations/d365/sync | DENIED | n/a | "403 — Owner access required" (RBAC; user is admin not owner) |
| /settings/integrations/d365/audit | OK | yes | "D365 sync audit" |
| /settings/d365-dlq | OK | yes | "D365 DLQ" |
| /settings/rules | OK | yes | 1 rule row, read-only DSL browser |
| /settings/flags | DENIED | n/a | "You need org admin access to view and change feature flags" (RBAC) |
| /settings/schema | OK | yes | "Schema browser" |
| /settings/schema/new | OK | yes | `schema-column-wizard` |
| /settings/schema/migrations | OK | yes | `schema-migrations-queue` |
| /settings/schema/preview | OK | yes | "Schema shadow preview" |
| /settings/tenant | EMPTY | yes | "No tenant variations configured. Standard baseline." |
| /settings/tenant/depts | OK | yes | `dept-taxonomy` |
| /settings/tenant/rules | OK | yes | `rule-variant-selector` |
| /settings/tenant/migrations | OK | yes | `tenant-migration-history` |
| /settings/reference | EMPTY | yes | Allergens "0 rows" (honest empty) |
| /settings/email | OK | yes | `email_templates_screen` |
| /settings/email/variables | OK | yes | `email_variables_screen` |
| /settings/ship-override-reasons | STUB | n/a | other-module/stub per D8 |
| /settings/gallery | OK | n/a | "Modal gallery" (dev/demo screen) |
| /settings/onboarding | OK | yes | "Onboarding wizard" |
| /account/profile | OK | yes | Real profile form |
| /account/notifications | OK | yes | Real prefs (070 grant fix confirmed live — no longer broken) |

Totals: 2 CRASH (both fixed), 0 remaining CRASH, 0 unexplained errors. The rest split across OK / EMPTY / DENIED / STUB.

## WRITE-path verification (outbox CHECK / migration 071)

Could not exercise a flag/feature toggle through the UI on this account: `/settings/flags` is RBAC-denied for this user and `/settings/features` has zero flag rows for the org (empty-state, nothing to toggle). Instead verified the actual concern — the outbox CHECK that migration 071 rebuilt — directly against the live DB:

`outbox_events_event_type_check` on Supabase (project khjvkhzwfzuwzrusgobp) is the full 44-type union and includes every settings write event:
`settings.module.toggled`, `settings.org.updated`, `settings.reference.row_updated`, `settings.role.assigned`, `settings.scim.token_created`, `settings.sso.config_changed`, `settings.user.invited/accepted/deactivated`, `settings.notification_*`, `fa.*`, `onboarding.*`, etc.

So the prior failure mode (23514 CHECK violation rolling back the writing action) is structurally gone — settings WRITE actions that dispatch these event types will be accepted by the constraint. (Confirmed at the DB-constraint level; the code-level write fixes above are not yet deployed.)

## Verification output (real)

- `pnpm --filter web typecheck` → **0 errors** (`tsc --noEmit`, clean exit).
- Changed-screen tests:
  - `settings/infra/lines/page.test.tsx` + `settings/users/users-screen.client.test.tsx` (vitest.ui.config) → **2 files, 16 tests passed**.
  - `settings/users/route-contract.test.ts` (default config) → **1 file, 4 tests passed**.
  - Combined: **20 passed, 0 failed.**

## Errors I could NOT fix

None. Both crashes were real bugs with a single shared root cause and both are fixed + typecheck/tests green. All other non-OK states are intentional (graceful empty-states, RBAC denials, or D8 other-module stubs).

## Caveat

Code fixes for lines + users are in the working tree only (not committed/deployed). They are validated by typecheck + unit tests, but the live preview still shows the crash until the orchestrator commits + redeploys. Re-run the lines/users routes on the next deploy to confirm the boundary is gone in the browser.
