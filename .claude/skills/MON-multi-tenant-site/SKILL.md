---
name: MON-multi-tenant-site
description: "THE LAW: Wave0 lock — `org_id` NOT `tenant_id`, `app.current_org_id()` NOT raw `current_setting`. Use when adding tables, RLS, Server Actions, queries, permission strings. Covers multi-site extension via `app.current_site_id()` + withSiteContext. Reads ESLint enum-lock guard rules."
version: 1.0.0
model: opus
canonical_spec: _meta/audits/2026-05-14-tenant-context-remediation.md
---

# MON-multi-tenant-site — Tenancy + Multi-Site Implementation Law

**Purpose:** the single authoritative playbook for any work that touches tenancy (`org_id`), site-scoping (`site_id`), RLS, Server Actions / route handlers that need an org or site context, queries against scoped tables, or permission strings consumed by RBAC. This is the LAW skill — the Wave0 lock and the foundation primitives are non-negotiable: drift here resurfaces as silent cross-org / cross-site read leakage or audit-trigger NULL violations that have already been mechanically swept once (see `2026-05-14-tenant-context-remediation.md`, F1, F11, F14a/b).

## When to use

- Adding or altering a business table (column shape, RLS policy, indexes)
- Implementing a Server Action / route handler that reads or writes scoped data
- Adding a query module that touches an `org_id`-scoped or `site_id`-scoped table
- Adding a permission string (must register in `permissions.enum.ts` via the enum-lock guard)
- Extending a per-site-scoped feature in any of: 05-warehouse, 08-production, 09-quality, 10-finance, 11-shipping, 12-reporting, 13-maintenance, 15-OEE

## Do NOT use when

- Pure UI work with no DB read/write (use `MON-t3-ui`)
- Worker-only async jobs that never enter a tx with scoped data (use `MON-foundation-primitives`)
- Editing foundation primitives themselves (those live in `00-foundation`, T-007 / T-011 / T-125; do not redefine in modules)

## Required reading (load in this order)

1. `.claude/skills/prd-decompose-hybrid/SKILL.md` — task JSON shape + atomicity gate (FORMAT reference)
2. `_meta/audits/2026-05-14-tenant-context-remediation.md` — Wave0 lock rationale + canonical RLS function form
3. `_meta/audits/2026-05-14-fixer-F1-tenant-and-foundation-citations.md` — mechanical Wave0 sweep playbook (forbidden tokens, required red lines)
4. `_meta/audits/2026-05-14-fixer-F11-finance-multisite-validators.md` — 14-multi-site validator rules (helper, composite index, T-125 cross-mod dep)
5. `_meta/audits/2026-05-14-fixer-F14a-multisite-ac-consolidation.md` + `F14b-*.md` — multi-site cross-mod patterns (cross_module_dependencies to T-125, parity sections)
6. `_meta/atomic-tasks/14-multi-site/tasks/T-001.json` — `app.current_site_id()` + withSiteContext primitive contract
7. `_meta/atomic-tasks/14-multi-site/tasks/T-030.json` — site_id ALTER+backfill across 21 operational tables in 9 modules (cross-module coordination model)
8. `_meta/atomic-tasks/02-settings/tasks/T-130.json` — ESLint enum-lock guard rule (`no-direct-permissions-enum-edit`)
9. `packages/db/migrations/002-rls-baseline.sql` — actual `app.set_org_context` / `app.current_org_id()` bodies (do NOT redefine)

## Wave0 lock (NON-NEGOTIABLE)

| Forbidden | Canonical | Why |
|---|---|---|
| column `tenant_id` | column `org_id` | Wave0 v4.3 lock 2026-04. `tenant_id` is reserved for license/billing tier, not business scope. |
| `current_setting('app.tenant_id')::uuid` | `app.current_org_id()` | NULL-safe + audit-trigger-compatible + ties to non-spoofable setter. |
| `current_setting('app.current_org_id')` | `app.current_org_id()` | Same function abstraction; raw GUC read resolves NULL → silent zero-row leakage. |
| `current_setting('app.current_site_id')` | `app.current_site_id()` | Same contract on the site layer (T-001). |
| RLS predicate via raw GUC | RLS predicate via SQL function `app.current_org_id()` / `app.current_site_id()` | Foundation contract; pg_policies must reference the function, not a `current_setting` literal. |
| `SET LOCAL app.current_org_id = $1` | `SELECT app.set_org_context($1::uuid, $2::uuid)` | GUC writes bypass `session_org_contexts` trust store; spoofable. |
| Bypassing `withOrgContext` in a Server Action / route handler | `withOrgContext({ sessionToken, orgId, userId }, fn)` | Audit trigger needs `app.current_user_id` set via separate `SET LOCAL` inside the wrapper; bypassing it breaks audit attribution. |
| Bypassing `withSiteContext` on a site-scoped table | `withSiteContext({ sessionToken, orgId, siteId, userId }, fn)` | Composes ON TOP of `withOrgContext` (T-001 ext from 00-foundation T-125); skipping it means `app.current_site_id()` returns NULL → zero rows or accidental ALL-sites mode. |

Forbidden patterns are enforced by the F1/F11 fixer sweeps and reproduced as hard test asserts in `packages/db/__tests__/with-org-context.test.ts` and `with-site-context.test.ts` (source-grep ACs).

## RLS policy template (canonical, org-only)

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
CREATE POLICY <t>_org_context ON <t>
  FOR ALL TO authenticated
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());
```

## RLS policy template (canonical, org + site)

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
CREATE POLICY <t>_site_scope ON <t>
  FOR ALL TO authenticated
  USING (
    org_id = app.current_org_id()
    AND (app.current_site_id() IS NULL OR site_id = app.current_site_id())
  )
  WITH CHECK (
    org_id = app.current_org_id()
    AND (app.current_site_id() IS NULL OR site_id = app.current_site_id())
  );
```

Note: `app.current_site_id() IS NULL` is the explicit super_admin ALL-sites mode (V-MS-07; gated by `app.session_site_contexts` row with `site_id NULL`). Do not let NULL silently fall back without that trust row.

## Setter signature (foundation T-125 + T-001 ext)

```sql
-- packages/db/migrations/002-rls-baseline.sql (DO NOT redefine in modules)
app.set_org_context(session_token uuid, org_id uuid) RETURNS uuid  -- SECURITY DEFINER

-- packages/db/migrations/0040_site_context.sql (T-001 of 14-multi-site)
app.set_site_context(session_token uuid, site uuid) RETURNS void  -- SECURITY DEFINER
app.current_site_id() RETURNS uuid  -- SECURITY DEFINER STABLE  (NOT leakproof — see below)
```

> ⚠️ **NO `LEAKPROOF`** (corrected 2026-06-05). Only a superuser may define a leakproof function;
> the Supabase migration role is not superuser, so `LEAKPROOF` breaks the fail-loud deploy
> ("only superuser can define a leakproof function" — it broke mig 215). It is only a planner hint;
> `SECURITY DEFINER STABLE` is sufficient. Same family as the mig-124 owner-change gotcha.
>
> ⚠️ **SECURITY DEFINER fns that accept a caller-supplied `org_id` MUST guard it** — `if p_org_id
> is null or p_org_id <> app.current_org_id() then raise exception ... using errcode='42501'; end
> if;` at the top. A definer fn bypasses RLS, so an unguarded `p_org_id` arg lets any `app_user`
> act on another org (this was a real cross-org hole in the SSCC `next_sscc_serial`/`generate_sscc`
> functions — fixed by adding the guard). Prefer deriving org from `app.current_org_id()` over an arg.

**Argument order matters:** `session_token` FIRST, `org_id`/`site` SECOND. The setter verifies the session-token row exists in the trust store (`app.session_org_contexts` / `app.session_site_contexts`) and raises PG 28000 on mismatch. `app.current_user_id` for audit triggers is set via a separate `SET LOCAL app.current_user_id = $userId` inside the `withOrgContext` wrapper — it is NOT bundled into the setter signature.

## HOF composition (canonical)

```ts
// packages/db/src/with-org-context.ts (T-125)
await withOrgContext({ sessionToken, orgId, userId }, async (tx) => {
  // tx is in a transaction with:
  //   - app.set_org_context(sessionToken, orgId) called → app.current_org_id() returns orgId
  //   - SET LOCAL app.current_user_id = userId → audit trigger picks up actor
  //   - ROLLBACK on throw; typed OrgContextRejected on PG 28000
});

// packages/db/src/with-site-context.ts (14-multi-site T-001) — composes on top
await withSiteContext({ sessionToken, orgId, siteId, userId }, async (tx) => {
  // Inside: withOrgContext(...) wraps; then app.set_site_context(sessionToken, siteId);
  // siteId === null means ALL-sites mode and requires a trust-row with site_id NULL.
});
```

Server Actions and route handlers must enter via `withOrgContextRoute` / `withSiteContextRoute` (`apps/web/lib/auth/*`). Those wrappers translate session header to setter calls and surface 400 `SITE_CONTEXT_REQUIRED` (V-MS-15) / 403 `SITE_ACCESS_DENIED` (V-MS-16) without acquiring a DB connection.

## Multi-site extension (when applicable)

**Modules that exist per-site** — any business module whose rows belong to a specific physical site:

- 05-warehouse (warehouses, license_plates, grn_items, stock_movements)
- 08-production (work_orders, wo_outputs, wo_consumptions, wo_dependencies, downtime_events)
- 09-quality (quality_holds, quality_inspections, ncr_reports, haccp_plans)
- 10-finance (inventory_cost_layers, wip_balances — ledgers are per-site)
- 11-shipping (shipments, sales_orders)
- 13-maintenance (maintenance_work_orders, spare_parts_stock, calibration_instruments)
- 15-OEE (oee_snapshots)

**Org master data (do NOT add site_id)** — `sites`, `site_user_access`, `transport_lanes`, `permissions.enum.ts` consumers. These are org-scoped, not per-site (per F14b §Group 5 and D-MS-13/D-MS-4 notes).

### Required additions to a site-scoped table

1. Column: `site_id uuid NOT NULL REFERENCES sites(id)` (NULL during activation `dual_run`, NOT NULL post-`activated`)
2. Composite index `(org_id, site_id)` MANDATORY — D-MS-13. Required for every site-scoped operational table; planner must hit the composite for `WHERE org_id = ? AND site_id = ?`. Use `CREATE INDEX CONCURRENTLY` in production migrations.
3. RLS policy via `app.current_site_id()` (see template above) — DROP the pre-existing `<t>_org_context` policy, CREATE `<t>_site_scope` atomically (do not leave the table with NO policy mid-migration).
4. `cross_module_dependencies` entry to `00-foundation T-125` (the foundation HOF) — F11 rule #19, see F14b group 1 for the canonical reason string.

### Activation migration pattern (T-030)

`_meta/atomic-tasks/14-multi-site/tasks/T-030.json` is the canonical playbook for adding `site_id` to existing tables across 9 modules / 21 tables:

- ALTER ADD COLUMN IF NOT EXISTS (idempotent)
- CREATE INDEX CONCURRENTLY IF NOT EXISTS `(org_id, site_id)`
- Backfill in batched `LIMIT 10000` loops to `default_site_id` (avoid lock storms / bloat)
- Atomic policy swap per table
- V-MS-19 post-check: zero NULL `site_id` rows in the 21 §9.8 tables
- Transition `org_settings.multi_site_state` from `dual_run` to `activated` only after V-MS-19 passes

## ESLint enum-lock guard (Settings T-130)

Permission strings live in `packages/rbac/src/permissions.enum.ts`. The ESLint rule `@monopilot/eslint-rules/no-direct-permissions-enum-edit` (T-130) is the mechanised gate; it is loaded via `packages/rbac/.eslintrc.cjs` and the root `apps/web/.eslintrc.cjs`.

### Adding a permission

1. The module needs a dedicated per-module permission-enum task (see naming pattern below) — DO NOT add strings inline to a feature task.
2. Append the string to `permissions.enum.ts` matching the regex `^[a-z_]+\.[a-z_]+\.[a-z_]+$` (three dot-separated lowercase segments).
3. Append the string to the matching `ALL_<MODULE>_PERMISSIONS` typed array literal — every element must also be present in the parent `Permission` const.
4. Regenerate the baseline: `pnpm --filter @monopilot/eslint-rules snapshot` (writes `tooling/eslint-rules/baselines/permissions.snapshot.json`).
5. PR must carry the `permissions-enum-update` label — CI uses the label as the gate; the ESLint rule itself is always `error`.

### Per-module permission-enum task pattern

Naming (canonical, per F10 reconciliation + T-130 cross-module deps):

| Module | Permission-enum task | Typed export |
|---|---|---|
| 01-npd | T-101 | `ALL_NPD_PERMISSIONS` |
| 03-technical | T-091 | `ALL_TECHNICAL_PERMISSIONS` |
| 04-planning-basic | T-066 | `ALL_PLANNING_PERMISSIONS` |
| 05-warehouse | T-058 | `ALL_WAREHOUSE_PERMISSIONS` |
| 06-scanner-p1 | T-049 | `ALL_SCANNER_PERMISSIONS` |
| 07-planning-ext | T-058 | `ALL_SCHEDULER_PERMISSIONS` |
| 08-production | T-056 | `ALL_PRODUCTION_PERMISSIONS` |
| 09-quality | T-065 | `ALL_QUALITY_PERMISSIONS` |
| 10-finance | (perm-enum task) | matches `^fin\.[a-z_]+\.[a-z_]+$` (F11 rule #19) |
| 14-multi-site | T-031 | `ALL_MULTI_SITE_PERMISSIONS` |

See `_meta/audits/2026-05-14-permission-enum-addition.md` for the full pattern and `T-130.json` for the rule semantics.

### What the rule flags

- `permissions-enum-regex-violation` — added string fails `^[a-z_]+\.[a-z_]+\.[a-z_]+$`
- `permissions-enum-illegal-removal` — string disappears or changes vs snapshot
- `permissions-enum-orphan-array` — string appears in `ALL_<MODULE>_PERMISSIONS` but not in parent `Permission` const

Do NOT add `// eslint-disable-next-line` for this rule — reviewers reject it (T-130 risk red line).

### Granting permissions (the SEED half — the #1 recurring LIVE bug)

**Adding a permission string to `permissions.enum.ts` does NOT grant it to anyone.** The enum is just vocabulary. If you stop after the enum-lock steps above, the deployed app returns **403 on every page that CHECKs the new permission** — and vitest+tsc are both green, so only Gate-5 live click-through catches it. This hit BOTH 01-npd and 02-settings.

Every module that introduces permission strings MUST ship a wave-1 P0 seed migration `NNN-<module>-permission-seed.sql` (mirror existing migrations `116` / `146` / `148` / `150`) that:

1. **GRANTs the module's perms to the org-admin role family — not just `admin`.** The deployed test admin is on role **`org.access.admin`**, NOT `admin`. Grant to the whole family so any admin-shaped role works:
   `org.access.admin`, `org.platform.admin`, `owner`, `admin`, `org_admin` — plus the relevant operator roles for the module.
2. **Writes to BOTH stores:** the canonical `role_permissions` table AND the legacy `roles.permissions` jsonb column. Some code paths still read the jsonb; granting only one leaves a half-broken authz surface.
3. **Adds an org-insert trigger + a backfill.** The trigger grants the perms to admin roles of every newly-created org; the backfill loops existing orgs so already-provisioned tenants (incl. the live test org) get them immediately.
4. **Uses the EXACT strings the pages CHECK.** Vocabulary divergence — the page checks `settings.users.manage` but the seed grants `settings.user.manage` — is a silent 403 and was a root cause in both npd and settings. Grep the module's `hasPermission(...)` / RBAC-gate call sites and seed precisely those strings.
5. **Matches admin/operator/etc roles by `r.code` OR `r.slug`** — roles are seeded with `slug` as the primary identifier (mig 017); `code` is secondary. A seed JOIN that matches on `r.code = any(...)` ALONE silently grants nothing on orgs whose admin role's `code` differs from its `slug` → live 403 everywhere (this was bug QG-01: the OEE seed matched code-only; finance/maintenance/shipping seeds correctly use `(r.code = any(v_admin) OR r.slug = any(v_admin))`). Always include BOTH; copy the predicate from `199-finance-schema-and-rbac-seed.sql`. The admin family is `('org.access.admin','org.platform.admin','owner','admin','org_admin')`.

This is a wave-1 P0 task in `07-MODULE-EXECUTION.md` §"Wave-1 P0 standing tasks" — schedule it before the feature waves, not after. RBAC writes/grants still go through `packages/rbac` canonical helpers where a runtime grant is needed; the seed migration handles the bootstrap/backfill DDL.

## Cross-module impact when adding site_id

T-030 spans 21 tables across 9 modules. Before adding `site_id` to a new business table:

1. Confirm the table is site-scoped, not org master data (see lists above)
2. Coordinate with the owning module's T1-schema task (e.g., 05-warehouse if you're touching `license_plates`)
3. Update or piggyback the activation migration — do NOT ship a one-off ALTER without registering against the activation playbook
4. Add `cross_module_dependencies` entry to `14-multi-site T-030` so the scheduler enforces ordering
5. Add `cross_module_dependencies` entry to `00-foundation T-125` (HOF) per F11 rule #19

## Acceptance criteria template for tenancy-touching tasks

Use these 3-4 ACs (saturate the 4-AC validator cap; fuse when needed):

1. **Schema** — Given migration N applied, when `\dt+ <t>` + `\d <t>` inspected, then column `org_id uuid not null` exists (and `site_id uuid not null references sites(id)` if site-scoped), AND composite index `(org_id[, site_id])` exists.
2. **Policy** — Given migration applied, when `SELECT polname, polqual FROM pg_policies WHERE tablename='<t>'` runs, then exactly one policy row exists whose qual text references `app.current_org_id()` (and `app.current_site_id()` if site-scoped) and FORCE RLS is enabled.
3. **Isolation** — Given two orgs (and two sites if applicable) seeded with rows, when interleaved `withOrgContext` (and `withSiteContext`) txs run as `app_user`, then each handler's `SELECT` sees only its own org's (and site's) rows — zero leakage.
4. **Source-grep** — Given the new module's `apps/web/**` + `packages/*/src/**` source is grep'd for `current_setting\('app\.(tenant_id|current_org_id|current_site_id)'\)`, then zero matches (the only legal read is inside `app.current_org_id()` / `app.current_site_id()` SQL function bodies in `packages/db/migrations/`).

Hoist UI closeout / source-grep into `test_strategy` or `closeout_requires` when 4 ACs are full (F14a hoist pattern).

## Risk red lines (always include 2+, copy-paste verbatim)

- "Do not use `tenant_id` as the business-scope column; per Wave0 v4.3 lock it is `org_id`. See `_meta/audits/2026-05-14-tenant-context-remediation.md`."
- "Do not read `current_setting('app.tenant_id')` or `current_setting('app.current_org_id')` directly — use the foundation `app.current_org_id()` function so the NULL-safe setter contract is preserved."
- "Do not bypass `withOrgContext` / `withSiteContext` — audit triggers require `app.current_user_id` set via the setter wrapper, and site policies require `app.set_site_context` to be called inside the same tx."
- "Every new permission string MUST be registered in `packages/rbac/src/permissions.enum.ts` + matching `ALL_<MODULE>_PERMISSIONS` array + snapshot regeneration. The ESLint enum-lock guard (T-130) blocks any other path."
- "RLS policies must reference `app.current_org_id()` (and `app.current_site_id()` when site-scoped) via SQL function, never raw `current_setting` — foundation contract enforced by source-grep ACs."
- "Do not DROP `<t>_org_context` without atomically CREATEing `<t>_site_scope` in the same migration — the table must never be left without an RLS policy (T-030 atomic-swap rule)."

## Test commands

```bash
# pg_policies inspection — verify function reference, not raw GUC
psql "$DATABASE_URL" -c "SELECT polname, polqual::text FROM pg_policies WHERE tablename='<t>'"

# Integration test (testcontainers Postgres 16) — RLS isolation
pnpm --filter @monopilot/db test:integration -- <test-name>

# Cross-org isolation test (must show zero leakage)
pnpm --filter @monopilot/db vitest run packages/db/__tests__/with-org-context.test.ts
pnpm --filter @monopilot/db vitest run packages/db/__tests__/with-site-context.test.ts

# ESLint enum-lock guard — must pass against unmodified permissions.enum.ts
pnpm --filter @monopilot/rbac lint
pnpm --filter @monopilot/eslint-rules vitest run

# Source-grep — TS must NOT read raw context GUCs
rg --no-heading -n "current_setting\('app\.(tenant_id|current_org_id|current_site_id)'\)" apps/web packages/*/src
# expected: only matches inside packages/db/migrations/*.sql function bodies

# Web app lint — full pass including enum-lock rule
pnpm --filter @monopilot/web lint
```

## Cross-links

- [[MON-t1-schema]] — Drizzle + migration mechanics (this skill is its tenancy law)
- [[MON-t2-api]] — Server Actions / route handlers (must enter via withOrgContext/withSiteContext)
- [[MON-foundation-primitives]] — T-007, T-011, T-125 (org HOF), T-001 of 14-MS (site HOF), T-112 outbox, T-121 rate-limit
- [[MON-t4-test]] — testcontainers Postgres 16 setup, parallel-tx isolation harness, source-grep harness
