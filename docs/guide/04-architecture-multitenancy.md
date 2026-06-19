# 04 — Architecture & Multi-Tenancy

MonoPilot Kira's system architecture, the org/site tenancy model, and the cross-cutting
foundation packages. Every claim below is grounded in a real file — paths are absolute from
the repo root.

---

## Key answers (owner questions)

### 1. Is multi-site built? — **Partial. The DB foundation + a read-side UI seam are production-shipped; RLS site-scoping, the IST workflow, and the `/multi-site` module page are NOT.**

What exists and is real:

- **Sites registry + site-context primitives** — `packages/db/migrations/215-multi-site-sites-registry-context.sql`:
  - `public.sites` — the canonical physical-site registry, **org-scoped master data** (RLS
    `sites_org_context` → `org_id = app.current_org_id()`; `sites` itself carries no `site_id`).
    V-MS-01 "exactly one default site per org" via partial unique index `idx_sites_default`.
  - `app.set_site_context(session_token, site)` setter + `app.current_site_id()` reader — a
    trust-store pair (`app.session_site_contexts` / `app.active_site_contexts`) that mirrors the
    org-context contract from migration `002-rls-baseline.sql`. `current_site_id()` returning
    `NULL` = super_admin "ALL-sites" mode (V-MS-07).
  - `public.operational_tables` registry + `app.is_site_scoped_table()` — declares which
    operational tables carry a **day-1 nullable `site_id` column** awaiting the T-030 backfill
    (NOT NULL + an `(org_id, site_id)` policy). The seed lists ~22 operational tables
    (`license_plates`, `work_orders`, `wo_outputs`, `quality_holds`, `shipments`, `oee_snapshots`, …).
  - `public.inter_site_transfer_orders` (IST) — the one operational site-scoped table the
    foundation owns: a **shell** with status machine, `from_site_id`/`to_site_id` FKs,
    `transfer_cost NUMERIC(18,2)`, dual cross-site approval refs, and an `(org_id, site_id)` RLS policy.

- **`site_id` reach** — a `site_id` column is referenced across **~38 migration files**
  (`grep -rl site_id packages/db/migrations/*.sql` → 38). Per the §9.8 registry seed in mig 215,
  the operational tables that already shipped a day-1 `site_id` are `license_plates` (@191),
  `quality_holds`/`ncr_reports` (@197), `inventory_cost_layers` (@199), `shipments`/`sales_orders`
  (@211); the rest are registered `pending` (column not yet present).

- **RLS site behaviour** — the IST policy was **tightened** in
  `packages/db/migrations/227-ist-rls-tighten-site-null.sql`. The original mig-215 policy let
  `site_id IS NULL` rows leak to every specific-site caller in the org; mig 227 removed the
  `site_id is null` escape so NULL-site rows are visible **only** in ALL-sites mode
  (`app.current_site_id() IS NULL`). Net rule today:
  `org_id = app.current_org_id() AND (app.current_site_id() IS NULL OR site_id = app.current_site_id())`.

- **UI seam (shipped, read-side only)** — `apps/web/lib/site/site-context.ts` reads an
  `mp_site_id` cookie via `getActiveSiteId()` and passes it as an **optional filter** into the
  handful of explicitly site-wired read actions (production WO list, warehouse LP list, OEE
  dashboard). Its own doc-comment is explicit: this is **NOT** `withSiteContext` /
  `app.current_site_id()` RLS scoping — it is additive, reversible read filtering. No cookie /
  invalid cookie = "All sites" = no filter.
  - Topbar picker: `apps/web/components/shell/site-switcher.tsx` (renders when the org has sites;
    persists via the `setSiteAction` server action, then `router.refresh()`).
  - Placeholder host: `apps/web/components/shell/site-crumb.tsx` — still a text-only `orgName`
    crumb tagged `data-todo="multi-site-T-020"`, replaced by `SiteSwitcher` when sites exist.

- **`withSiteContext` HOF — does NOT exist.** It is named only as a *future* seam in the
  doc-comments of `site-context.ts` and `site-switcher.tsx`. There is no `app.current_site_id()`
  scoping in the request path; org RLS is the only enforced tenancy boundary today.

- **`/multi-site` module page is a stub** —
  `apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx` renders a heading plus
  `<ModuleStubNotice …/>` (the same "stub" badge/notice used by not-yet-built modules). There is
  **no** site CRUD UI, no IST workflow UI.

**Conclusion.** Production-ready: the `public.sites` registry (org-scoped), the
`app.current_site_id()` / `set_site_context` primitives, the IST table + its (tightened) RLS, and
the cookie-based read-side site filter on three screens. Partial / not built: the day-1 `site_id`
backfill to NOT-NULL site RLS across operational tables (T-030), a `withSiteContext` request HOF,
the IST business workflow, and the `/multi-site` module page (stub).

### 2. Are scanners per-site or per-org? — **SITE-scoped (and line/shift-scoped) within an org, with one wiring gap.**

- **Session shape carries site + line + shift** — `ScannerSession` in
  `apps/web/app/[locale]/(scanner)/_components/scanner-session.tsx:29-36` has
  `siteId?: string | null`, `lineId?: string | null`, `shift?: string | null`. The scanner
  session row persists these server-side (`apps/web/app/api/scanner/context/route.ts` updates
  `site_id` / `line_id` / `shift` on the session).

- **Login flow forces a site pick** — `apps/web/app/[locale]/(scanner)/scanner/login/site/page.tsx`
  renders `SiteSelectScreen`
  (`.../scanner/login/site/_components/site-select-screen.tsx`, SCN-012 "Site / Line / Shift
  selection (start of shift)"). It loads sites+lines from `GET /api/scanner/bootstrap`, then
  commits the chosen site/line/shift via `POST /api/scanner/context`.

- **Bootstrap route** — `apps/web/app/api/scanner/bootstrap/route.ts` lists the org's active
  `public.sites` (`where org_id = $1 and is_active`) and active `public.production_lines`.
  **Gap to flag:** the lines query returns `null::uuid as site_id` (line 18) — i.e. lines are not
  yet wired to their parent site, so the UI cannot filter lines by the selected site. (Migration
  `268-production-lines-site.sql` adds the `site_id` column to lines; the bootstrap query has not
  been updated to select it.)

- **Org/site context is set transactionally** — scanner bearer sessions are **not** Supabase user
  sessions, so they use `withScannerOrg` (`apps/web/lib/scanner/with-scanner-org.ts`) instead of
  `withOrgContext`. It registers a fresh `session_token`, opens an **app-role** (RLS-enforcing)
  transaction, and calls `select app.set_org_context($token, $org)` bound to the verified
  session's `org_id` — the same RLS execution context as `withOrgContext`, minted from the scanner
  session rather than a JWT.

**Conclusion.** A scanner is **org-scoped at the RLS boundary** (every query runs under
`app.set_org_context` for the session's `org_id`) and **site/line/shift-scoped at the
session/business level** (the operator picks one site + line + shift at shift start and it rides on
every scanner action). It is therefore **per-site within an org**, not per-org-global. The one open
wiring gap is `production_lines.site_id` being hard-coded `null` in the bootstrap response.

---

## Stack & deploy

- **App** — Next.js App Router, `apps/web` (`apps/web/package.json`: `next ^16.0.0`,
  `react ^19.2.0`). pnpm monorepo (root `package.json` scripts shell out via
  `pnpm --filter web …` / `pnpm -r …`).
- **Data + auth** — Supabase: Postgres (schema/RLS in `packages/db/migrations/*.sql`) + Supabase
  Auth via `@supabase/ssr` (`apps/web/package.json`: `@supabase/ssr ^0.10.2`). Server-side client
  in `apps/web/lib/auth/supabase-server.ts` uses `createServerClient` reading/writing cookies.
  Auth trust decisions use `supabase.auth.getUser()` (verifies the JWT against JWKS), **never**
  `getSession()` (see `with-org-context.ts` red lines).
- **Deploy** — Vercel (per `CLAUDE.md`: "Deploy = Vercel; DB + auth = Supabase"). "Real data" means
  querying Supabase, never mocks.
- **Worker** — `apps/worker` drains the outbox.

### Monorepo packages (`packages/`)

`auth`, `cascade-engine`, `db`, `domain`, `e-sign`, `gdpr`, `gs1`, `observability`, `ops`,
`outbox`, `queries`, `rate-limit`, `rbac`, `rule-engine`, `schema-driven`, `schema-runtime`,
`server`, `storage`, `sync-queue`, `ui`, `validation`. Drizzle schema + SQL migrations + RLS live
in `packages/db`.

---

## Routing structure (`apps/web/app/[locale]/…`)

Everything is under a `[locale]` segment (next-intl). The route **groups**:

- `(auth)/` — login / auth pages (unauthenticated).
- `(app)/` — the authenticated shell. Inside it:
  - `(modules)/…` — the operational modules (e.g. `multi-site/`, production, warehouse, planning,
    quality). Each module page lives at `(app)/(modules)/<module>/page.tsx`.
  - `(npd)/…` — New Product Development surfaces.
  - `(admin)/…` — admin-only surfaces nested in the app shell.
  - `_actions/` — shared Server Actions for the app group.
- `(admin)/…` — top-level admin (e.g. `(admin)/schema`).
- `(scanner)/…` — the PWA scanner lane (its own shell, bearer-session auth, `_components/`).
- `onboarding/` — onboarding flow.

**Co-location convention:** Server Actions live in `_actions/` folders next to the routes that use
them; client/server components live in `_components/`. API route handlers live under
`apps/web/app/api/…` (e.g. `api/scanner/bootstrap/route.ts`, `api/scanner/context/route.ts`).

---

## Multi-tenancy law (Wave0 lock)

The non-negotiable tenancy contract (`CLAUDE.md` "Hard rules", and the `MON-multi-tenant-site`
skill):

- **`org_id`, NOT `tenant_id`** — `org_id` is the business scope on every tenant-owned table.
- **RLS via `app.current_org_id()`, NOT raw `current_setting`** — the GUC trust store is read only
  through the SECURITY DEFINER function defined in `packages/db/migrations/002-rls-baseline.sql`.
  Migration 215 explicitly mirrors this contract for `app.current_site_id()`.

### How a request resolves org context — `withOrgContext`

`apps/web/lib/auth/with-org-context.ts` is the HOF that **must wrap every Server Action / route
handler that touches the data plane**. Per call it:

1. Verifies the Supabase JWT via `supabase.auth.getUser()` (validates against JWKS — does **not**
   trust cookies / `getSession()`).
2. Resolves `org_id` from `public.users.org_id` for the verified user (authoritative — **not** from
   JWT claims, which can drift). No row → throws (never grants empty context).
3. Mints a fresh per-call `session_token`, registers it in `app.session_org_contexts` via the
   **owner** pool (BYPASSRLS).
4. Opens a transaction on the **app-role** (RLS-enforcing) pool, runs
   `select app.set_org_context($token, $org)` inside it, runs the callback, COMMIT on success /
   ROLLBACK on throw.
5. Best-effort cleanup of the session row in `finally{}` (orphans GC'd by
   `app.gc_session_org_contexts`, wired to cron — see mig `031-session-org-contexts-janitor.sql`).

Resolution (steps 1-2) is memoised per request via React `cache()` so a fan-out page does one JWT
verify + one users lookup; the per-connection `set_org_context` still runs per call. The dual-pool
pattern (owner pool not exported by `@monopilot/db`) is an explicit ADR documented in the file
header; `apps/web/lib/scim/middleware.ts` is the one sibling exception. The scanner equivalent is
`withScannerOrg` (`apps/web/lib/scanner/with-scanner-org.ts`), which binds the same app-role context
from a verified scanner bearer session instead of a JWT.

---

## RBAC

- **Source of truth** — `packages/rbac/src/permissions.enum.ts` is the authoritative
  `Permission` map (string constants like `'org.access.admin'`, `'settings.users.manage'`,
  `'production.corrections.closed_wo'`, …).
- **Enum-lock guard** — `packages/rbac/eslint.config.mjs` applies the custom rule
  `@monopilot/eslint-rules/no-direct-permissions-enum-edit` to `src/permissions.enum.ts`
  (T-130). Changes must go through the codegen snapshot + a `permissions-enum-update` PR label,
  not hand-edits.
- **Two storage forms** — permissions are seeded into **both**:
  - `public.role_permissions` (normalized, one row per role×permission), and
  - `public.roles.permissions` (legacy jsonb cache),
  kept in sync by an AFTER-INSERT trigger on `organizations` + a full backfill (see the seed
  migrations below).
- **Seeding pattern** — permissions are granted to role families per module via migrations:
  - `packages/db/migrations/214-reporting-outbox-and-rbac-seed.sql` is the canonical pattern
    (inserts into `role_permissions` + rebuilds the `roles.permissions` jsonb).
  - Today's adds: `300-r4-correction-perms-seed.sql` (R4 correction perms + supervisor/manager
    families) and `301-e6-mrp-perms-and-event-seed.sql` (E6 MRP perms — and the matching outbox
    event admit). Both seed into both storage forms with the trigger+backfill pattern.

---

## Events / outbox

- **Source of truth** — `packages/outbox/src/events.enum.ts` (`EventType` enum +
  `LegacyEventAlias`; the union of canonical values and alias keys = `DB_EVENT_TYPES`). The enum is
  AUTHORITATIVE per the foundation-audit human decision; `fg.*` is the canonical finished-good
  prefix, with four legacy `fa.*` strings kept only as aliases.
- **DB CHECK + drift gate** — every emitted/stored event must appear in the
  `outbox_events_event_type_check` constraint on `public.outbox_events`. The constraint is
  regenerated in the **highest-numbered** migration that touches it (mig 215 regenerated it for the
  multi-site `transfer_order.*` / `transport_lane.*` events; mig 301 is the current latest).
  `packages/outbox/src/__tests__/check-drift.test.ts` parses that latest migration's CHECK list and
  asserts its string set === `DB_EVENT_TYPES` — so the enum and the DB CHECK can never silently
  desync.
- **Producer + consumer + worker** — events are queued into `public.outbox_events`
  (`packages/outbox/src/queue.ts` / `dispatch-queue.ts`) and drained by
  `packages/outbox/src/worker.ts` (and `apps/worker`). Contract tests:
  `packages/outbox/src/__tests__/events.test.ts`, `dispatch-queue.test.ts`,
  `dispatcher-error-surface.test.ts`, `worker.e2e.test.ts`.

---

## E-sign, audit & corrections

- **`packages/e-sign`** (`src/index.ts`):
  - `signEvent` (`src/sign.ts`) — verifies the signer's PIN (`@monopilot/auth` `verifyPin`, with a
    login-password fallback for signers with no enrolled PIN), canonicalises the subject, and
    SHA-256 hashes it (`hashESignSubject`). Replay-protected (`EReplayError` on a `23505` unique
    violation). MUST be called inside an active `app.current_org_id()` context
    (`withOrgContext` / `runWithOrgContext`) — it throws otherwise.
  - `dualSign` (`src/dual.ts`) — segregation-of-duties dual signature (`ESignSoDError`).
  - Error taxonomy: `EPinFailedError`, `EReplayError`, `ESignSoDError`.
- **Corrections framework** (`apps/web/lib/corrections/`):
  - `correct-ledger-entry.ts` exposes `assertCorrectionAllowed` — the gate for reversibility/
    correction actions. It checks the caller's permission (e.g.
    `CLOSED_WO_CORRECTION_PERMISSION = 'production.corrections.closed_wo'`), validates the WO
    status, and optionally requires an e-sign signature (delegating to `signEvent`). Errors:
    `CorrectionForbiddenError`, `CorrectionInvalidInputError`.
  - Callers include `production/_actions/corrections-actions.ts` and
    `planning/transfer-orders/_actions/reverse-receive.ts` (the W11 reversibility wave: void/storno
    output & waste, reverse consumption, cancel GRN, reverse IST receive).
- **Audit** — `audit_events` is the immutable audit log; the outbox emits `audit.recorded` /
  `quality.recorded` etc., and scanner actions write session audit rows
  (`apps/web/lib/scanner/audit.ts`).

---

## Canonical owners (do not cross — `CLAUDE.md`)

| Table / artifact | Canonical writer | Notes |
| --- | --- | --- |
| `wo_outputs` | **08-production** | NOT 04-planning-basic. |
| `schedule_outputs` | **04-planning** | NOT `wo_outputs`. |
| `oee_snapshots` | **08-production** (sole writer) | 15-oee is **read-only** (D-OEE-1). |

The mig-215 `operational_tables` seed encodes the same ownership in its `owning_module` column
(`wo_outputs` → `08-production`, `oee_snapshots` → `08-production (15-oee read-only)`, etc.).

---

## File index (primary citations)

| Concern | Path |
| --- | --- |
| Sites registry + site-context primitives + IST shell | `packages/db/migrations/215-multi-site-sites-registry-context.sql` |
| IST site-RLS tighten (NULL site) | `packages/db/migrations/227-ist-rls-tighten-site-null.sql` |
| Lines→site column | `packages/db/migrations/268-production-lines-site.sql` |
| Active-site read seam (cookie) | `apps/web/lib/site/site-context.ts` |
| Topbar site picker / crumb | `apps/web/components/shell/site-switcher.tsx`, `site-crumb.tsx` |
| `/multi-site` module page (stub) | `apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx` |
| Scanner session shape (site/line/shift) | `apps/web/app/[locale]/(scanner)/_components/scanner-session.tsx` |
| Scanner site picker | `apps/web/app/[locale]/(scanner)/scanner/login/site/page.tsx` + `_components/site-select-screen.tsx` |
| Scanner bootstrap (site_id gap) | `apps/web/app/api/scanner/bootstrap/route.ts` |
| Scanner context commit | `apps/web/app/api/scanner/context/route.ts` |
| Scanner org-context HOF | `apps/web/lib/scanner/with-scanner-org.ts` |
| Org-context HOF | `apps/web/lib/auth/with-org-context.ts` |
| Supabase server client | `apps/web/lib/auth/supabase-server.ts` |
| Org RLS baseline | `packages/db/migrations/002-rls-baseline.sql` |
| RBAC SoT + enum-lock | `packages/rbac/src/permissions.enum.ts`, `packages/rbac/eslint.config.mjs` |
| RBAC seed pattern | `packages/db/migrations/214-…`, `300-…`, `301-…` |
| Outbox SoT + drift gate | `packages/outbox/src/events.enum.ts`, `packages/outbox/src/__tests__/check-drift.test.ts` |
| E-sign | `packages/e-sign/src/{index,sign,dual}.ts` |
| Corrections gate | `apps/web/lib/corrections/correct-ledger-entry.ts` |
