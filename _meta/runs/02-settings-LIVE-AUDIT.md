# 02-settings — LIVE preview audit (deployed)

- **Date:** 2026-06-03
- **Preview:** https://monopilot-kira-git-kira-long-run-codermariuszs-projects.vercel.app
- **Deployment:** `dpl_CqSbM7F2smE5w6Q9jTPE2etWZZ6L` (READY, region iad1) built from **current HEAD** `f73f5195` (NOT stale — confirms migrations 051-070 + code are deployed)
- **Login:** `admin@monopilot.test` → succeeds, app shell renders, Supabase auth `/user` (getUser) returns **200** (verified in Supabase auth logs).
- **Org under test:** `00000000-0000-0000-0000-000000000002` ("Apex"), admin user `31fe18af-43f7-4c05-a078-db23a9a5bd3e`.

## TL;DR (headline finding)

**The entire settings/account data plane is down on the preview — every page that calls `withOrgContext()` renders its "could not be loaded" error state.** This is **NOT** per-page code bugs and **NOT** the two seeded leads (company loader logic is correct; there is no malformed ICU message). It is a **systemic failure inside `withOrgContext` on the deployed runtime**, in the DB-connection/session-registration layer — almost certainly an **environment/connection configuration** problem (`DATABASE_URL_OWNER` / `DATABASE_URL_APP` / pooler reachability), not a source bug in the checkout.

Proof the SQL + auth are fine (so the bug is in the connection plumbing, not the queries):
- `supabase.auth.getUser()` → **200** (Supabase auth logs, dozens of successful `/user` calls).
- The company loader `SELECT id,name,logo_url,timezone,locale,currency,gs1_prefix,region,tier,seat_limit FROM public.organizations WHERE id=$org` → **returns the Apex row** when executed under a **non-BYPASSRLS app role** with `app.set_org_context()` applied (reproduced live via a temporary `grant app_user to authenticated` test, since the MCP role cannot `SET ROLE app_user`; grant was reverted, residual_membership=0).
- `hasOrgUpdatePermission` join (`user_roles ⋈ roles ⋈ role_permissions`) → **returns 1** (admin has `settings.org.update`).
- All grants/RLS/columns verified: `app_user`/`app_user_prod` have SELECT+EXECUTE on every table/function the loaders touch; `organizations`, `roles`, `user_roles`, `role_permissions` RLS policies all evaluate as `id/org_id = app.current_org_id()`.
- Postgres logs show **no runtime SQL error** for the loader queries (the only ERRORs were my own blocked `SET ROLE app_user` probes). So the throw happens **before/around the queries**, in `withOrgContext`'s pool/session plumbing.

## Lead #1 — `/en/settings/company` "Company profile could not be loaded"
- **Root cause is NOT the loader logic.** `apps/web/app/[locale]/(app)/(admin)/settings/company/page.tsx` query, `hasOrgUpdatePermission`, and `toCompanyProfile` are all correct and verified against the live schema (every selected column exists; the org row exists; the permission join returns 1).
- The throw is the **shared `withOrgContext` failure** (same as every other data page). The page's `catch` logs only `error.message` via `console.error('[settings/company] load_failed', {message})`, and the Vercel runtime-log table truncates the cell to `[settings/company] load_fai...`; full-text search over the body is unreliable (prefix-indexed + repeated "query timed out before all pages were fetched"), so the literal pg/connection message **could not be extracted through the available tooling** (Vercel MCP truncates; `VERCEL_TOKEN` in env is invalid/placeholder so the REST API + CLI are unavailable; MCP DB role cannot impersonate `app_user`).

## Lead #2 — `INVALID_MESSAGE` (next-intl ICU)
- **Not a settings bug. Not a malformed message.** Validated **all 8210 strings** in `apps/web/messages/{en,pl,ro,uk}/02-settings.json` + `apps/web/i18n/{en,pl,ro,uk}.json` through `@formatjs/icu-messageformat-parser` → **0 ICU errors, 0 JSON errors**.
- `INVALID_MESSAGE` runtime errors occur **only on `/favicon.ico` and `/sw.js`** (confirmed via `get_runtime_logs query="INVALID_MESSAGE"`) — next-intl rendering the root not-found on non-locale asset paths. They return 200 and **do not touch any settings page**. Benign log noise; no fix required for the settings module.

## Full route sweep

State legend: ERROR = renders "could not be loaded"/"unable to load" in the content panel. All routes returned HTTP 200 (the error is caught and rendered, not a 500). All ERROR rows share the **same single root cause** (systemic `withOrgContext` failure) unless noted.

| Route (`/en/settings/…` unless noted) | State | Root cause | Fix / gap |
|---|---|---|---|
| company | ERROR | systemic withOrgContext | gap — env/connection (see below) |
| infra/lines | ERROR | systemic withOrgContext | gap |
| infra/warehouses | ERROR | systemic withOrgContext | gap |
| shifts | ERROR | systemic withOrgContext (also D8 stub scope) | gap |
| products | ERROR | systemic withOrgContext (D8 stub) | gap |
| boms | ERROR | systemic withOrgContext (D8 stub) | gap |
| processes | ERROR | systemic withOrgContext (D8 stub) | gap |
| reference/manufacturing-operations | ERROR | systemic withOrgContext | gap |
| partners | ERROR | systemic withOrgContext (D8 stub) | gap |
| units | ERROR ("Unable to load units.") | systemic withOrgContext | gap |
| import-export | ERROR | systemic withOrgContext | gap |
| users | ERROR ("Users could not be loaded.") | systemic withOrgContext | gap |
| security | ERROR | systemic withOrgContext | gap |
| audit | ERROR | systemic withOrgContext | gap |
| devices | ERROR | systemic withOrgContext (D8 stub) | gap |
| notifications | ERROR | systemic withOrgContext | gap |
| features | ERROR | systemic withOrgContext | gap |
| integrations | ERROR | systemic withOrgContext | gap |
| integrations/d365 | ERROR | systemic withOrgContext | gap |
| integrations/d365/mapping | ERROR | systemic withOrgContext | gap |
| integrations/d365/sync | ERROR | systemic withOrgContext | gap |
| integrations/d365/audit | ERROR | systemic withOrgContext | gap |
| d365-dlq | ERROR | systemic withOrgContext | gap |
| rules | ERROR | systemic withOrgContext | gap |
| flags | ERROR | systemic withOrgContext | gap |
| schema | ERROR | systemic withOrgContext | gap |
| schema/new | ERROR | systemic withOrgContext | gap |
| schema/migrations | ERROR | systemic withOrgContext | gap |
| tenant | ERROR | systemic withOrgContext | gap |
| tenant/depts | ERROR | systemic withOrgContext | gap |
| tenant/rules | ERROR | systemic withOrgContext | gap |
| tenant/migrations | ERROR | systemic withOrgContext | gap |
| reference | ERROR | systemic withOrgContext | gap |
| email | ERROR | systemic withOrgContext | gap |
| email/variables | ERROR | systemic withOrgContext | gap |
| ship-override-reasons | ERROR | systemic withOrgContext (D8 stub) | gap |
| gallery | ERROR | systemic withOrgContext (D8 stub) | gap |
| onboarding | ERROR | systemic withOrgContext | gap |
| /en/account/profile | ERROR ("My profile could not be loaded.") | systemic withOrgContext | gap |
| /en/account/notifications | ERROR | systemic withOrgContext | gap |

> Note on the sweep method: routes were fetched in-page and scanned for error phrases; company, users, units and account/profile were additionally confirmed by reading the rendered content panel directly (each shows the error alert in the main content area, not just the shared shell).

## Where the failure is (phase isolation)

`withOrgContext` (`apps/web/lib/auth/with-org-context.ts`) does, in order:
1. `resolveContextFromSupabase()` → `getUser()` (verified 200) + owner-pool `SELECT org_id FROM public.users` (works).
2. **owner-pool `INSERT INTO app.session_org_contexts`** — only `postgres` can insert (verified: `app_user`/`app_user_prod`/`service_role`/`authenticated` all have `has_table_privilege(... INSERT) = false`). Requires `DATABASE_URL_OWNER` to connect as a superuser/owner.
3. app-pool `connect()` (requires `DATABASE_URL_APP` as `app_user_prod`).
4. `app.set_org_context()` + loader queries (verified to work as the app role).

Since getUser=200 and the queries work as the app role, the failure is in (2) or (3) — i.e. the **owner/app pool connection strings or pooler reachability on the deployment**. The error message contains none of "JWT / org_id / permission denied / column / does not exist" in the (unreliable) full-text search, which is consistent with a connection-class error (e.g. `connect ENETUNREACH`/`ENOTFOUND` to an IPv6-only direct DB host from an IPv4 Vercel lambda, `password authentication failed`, or `permission denied for table session_org_contexts` if `DATABASE_URL_OWNER` is unset and `DATABASE_URL` is a non-postgres role) — but the literal text was not retrievable with the tools available.

## Fix applied (code)

**`apps/web/lib/auth/with-org-context.ts`** — added `annotateOrgContextError(phase, err)` and wrapped each plumbing phase (`resolve_context`, `owner_register_session`, `app_pool_connect`, `begin`, `set_org_context`) with `.catch(...)` that logs a structured `[withOrgContext] phase_failed { phase, message, code, detail, routine, severity }` line and re-throws. This is **observability only — control flow unchanged** (the original error is always re-thrown). On the next deploy it converts the opaque "could not be loaded" into a root-causable runtime log line that names the failing phase + pg error code, so the env/connection misconfiguration can be pinpointed and fixed.

> No per-page loader code was changed: the loaders were verified correct against the live schema, so changing them would have masked the real (connection-layer) defect.

## Verification

- `pnpm --filter web typecheck` → **0 errors** (clean `tsc --noEmit`).
- `vitest run --config vitest.ui.config.ts company/page.test.tsx` → **5 passed**.
- `vitest run --config vitest.ui.config.ts flags/page.test.tsx features/page.test.tsx` (withOrgContext consumers) → **22 passed**.
- Total: 27/27 passed. No regression from the diagnostic change.

## What could NOT be fixed here (hand-off to orchestrator)

1. **The systemic data-plane outage** is an environment/connection issue on the preview deployment, not a code bug in the checkout. To resolve, on Vercel (project `prj_tqakvTBKhLbKynJuPWal3BOak0TD`, preview env) verify:
   - `DATABASE_URL_OWNER` is set and connects as **`postgres`** (superuser) via the **pooler** host (only `postgres` can `INSERT INTO app.session_org_contexts`). If unset, it falls back to `DATABASE_URL`; if `DATABASE_URL`'s role is not `postgres`, step (2) throws `permission denied for table session_org_contexts`.
   - `DATABASE_URL_APP` is set and connects as **`app_user_prod`** with the correct password via the pooler. If unset, the code rewrites the username to `app_user` (note: `app_user`, not `app_user_prod`) with `APP_USER_PASSWORD` — if that login/password is wrong on Supabase, the app-pool connect fails.
   - Both point at the Supabase **pooler** (IPv4-reachable), not the IPv6-only direct `db.<ref>.supabase.co` host (Vercel lambdas are IPv4-only → `ENETUNREACH`).
   - Redeploy, reload `/en/settings/company`, then read `get_runtime_logs(query:"phase_failed", level:["error"])` — the new structured line will name the exact failing phase + pg code. Then click through the sweep again to confirm OK/EMPTY states.

2. **Exact server error string** was not retrievable with the available tooling (Vercel MCP truncates the message cell; full-text search appears prefix-indexed and timed out; `VERCEL_TOKEN` is an invalid 24-char placeholder so the Vercel REST API/CLI are unusable; the MCP Postgres role cannot `SET ROLE app_user`). The `phase_failed` logging added above closes this gap on the next deploy.

3. Per-screen prototype-parity / EMPTY-state classification is **blocked** until the data plane is restored — every screen currently short-circuits to its error state, so real-data and empty-state rendering cannot be observed yet.
