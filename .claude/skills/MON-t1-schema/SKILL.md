---
name: MON-t1-schema
description: Use when implementing T1-schema tasks (Drizzle schemas + SQL migrations + RLS policies). Covers org_id Wave0 lock, app.current_org_id() RLS, audit triggers, indexes, NUMERIC precision. Required reading before touching packages/db/.
version: 1.0.0
model: opus
canonical_spec: _meta/audits/2026-05-14-tenant-context-remediation.md
---

# MON-t1-schema — Drizzle + Postgres + RLS Implementation Playbook

**Purpose:** implementation guidance for any atomic task with `task_type: T1-schema`. Produces a Drizzle schema file (`packages/db/schema/*.ts`), a numbered SQL migration (`packages/db/migrations/NNNN_*.sql`), RLS policies referencing `app.current_org_id()`, audit-trigger attachment, and the indexes/constraints declared in the task JSON.

**Why this skill exists:** every T1-schema task assumes a long list of project invariants (Wave0 `org_id` lock, foundation function signatures, RLS-on-MV pattern, NUMERIC precision rules, audit trigger contract). Re-deriving them per task wastes tokens and reintroduces drift the 2026-05-14 remediation pass already cleaned up.

## When to use

- Implementing a task whose `pipeline_inputs.task_type` is `T1-schema`
- Implementing a task whose `labels` array contains `T1-schema`
- Adding a new business table, materialized view, or migration to `packages/db/`
- Modifying RLS policy, audit trigger attachment, or `org_id` shape on an existing table

## Do NOT use when

- Task is `T2-api` (Server Action / route handler) — schema must already exist; use MON-t2-api instead
- Task is `T3-ui` — no DB work
- Task is `T4-wiring-test` — wiring/integration test only; do not extend schema
- Task is `T5-seed` — seed data only; no DDL
- Task bundles schema + Server Action — that violates the atomicity gate; stop and report; the task should have been split

## Required reading (load in this order, every time)

1. `_meta/audits/2026-05-14-tenant-context-remediation.md` — canonical `org_id` + `app.current_org_id()` pattern, list of 16 rewritten tasks for cross-reference
2. `_meta/audits/2026-05-14-foundation-primitives-additions.md` — foundation function signatures (`app.set_org_context`, `app.current_org_id`, T-111 worker, T-112 outbox, T-113 GDPR, T-116 OTel, T-125 `withOrgContext`)
3. `_meta/audits/2026-05-14-fixer-F1-tenant-and-foundation-citations.md` — mechanical sweep rules: forbidden tokens, required red lines, citation strings
4. `packages/db/migrations/002-rls-baseline.sql` — actual function bodies for `app.set_org_context`, `app.current_org_id`; do NOT redefine them
5. `packages/db/migrations/004-audit.sql` — `audit_events` table shape, retention classes, append-only enforcement
6. The target task JSON itself — `scope_files`, `acceptance_criteria`, `risk_red_lines`, `out_of_scope` are normative; do not exceed them

## Canonical file locations

| Artefact | Path | Notes |
|---|---|---|
| Drizzle schema (module barrel) | `packages/db/schema/<module>.ts` | NOT `packages/db/src/schema/` — actual project uses `packages/db/schema/` (verified 2026-05-14). Re-exported via `packages/db/schema/index.ts`. |
| Schema barrel index | `packages/db/schema/index.ts` | Append re-export for every new schema file |
| Migration (numbered) | `packages/db/migrations/NNN-<descriptor>.sql` | **Runner regex is `^(\d{3})-[a-z0-9-]+\.sql$`** — three-digit prefix, hyphen, lowercase a-z0-9, `.sql`. A `0NN_` underscore name or a 4-digit prefix is **silently skipped** (never runs) and/or sorts wrong. Highest existing number wins — `git ls-files packages/db/migrations \| sort \| tail`, bump by 1. |
| Test (contract) | `packages/db/__tests__/<table>.test.ts` or `packages/<module>/__tests__/<table>.test.ts` | testcontainers Postgres 16 + run migration + assert behaviour |
| Cross-module schema | `packages/<module>/src/schema/*.ts` | Allowed when a domain package owns its own read-models (e.g., `packages/reporting/src/schema/reporting-views.ts`). Re-export from `packages/db/schema/index.ts` only if business tables. |

## Hard rules — Wave0 `org_id` lock + RLS contract

| Wrong | Right | Reason |
|---|---|---|
| `tenant_id` column | `org_id` column | Wave0 v4.3 lock; `tenant_id` is a different concept (license/billing tier) per F1 fixer §A. |
| `current_setting('app.tenant_id')::uuid` | `app.current_org_id()` | NULL-safe; ties to non-spoofable `app.set_org_context` setter contract (migration 002). |
| `current_setting('app.current_org_id')` | `app.current_org_id()` | Same. GUC read resolves NULL → silent zero-row leakage. |
| `SET LOCAL app.current_org_id = $1` | `select app.set_org_context($1::uuid, $2::uuid)` | Spoofable GUC writes bypass session-token trust store. |
| `RLS by tenant_id` | `RLS via app.current_org_id() on org_id column` | Phrasing locked to canonical citation. |
| `RLS policy on materialized view` / granting `app_user` SELECT on a raw MV | `security_invoker` wrapper VIEW `v_<mv>` filtering `where org_id = app.current_org_id()`, grant the view (revoke the raw MV) | MVs can't host policies AND `REFRESH` runs as owner across all orgs → raw grant = cross-org leak. See migs 221/228 + "Supabase-applyable migration gotchas". Service-layer filter alone is not enough if the raw MV is grantable. |
| Bare `NUMERIC` for money | `NUMERIC(18,4)` for money, `NUMERIC(18,6)` for unit-cost | Drift causes rounding errors in variance_gbp / weighted-avg KPIs. |
| Single-column `(org_id)` index when business pkey includes more | Composite `(org_id, <site_id?>, <business_keys>)` | Wave0 reads always include `org_id`; planner must hit composite. |
| `policy_name` without `_org_context` suffix | `<table>_org_context` | F1 fixer convention; pg_policies AC greps for the suffix. |

## Drizzle schema pattern (canonical)

```ts
// packages/db/schema/quality-holds.ts
import { pgTable, uuid, text, timestamp, numeric, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { sites } from './sites';

export const qualityHolds = pgTable(
  'quality_holds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'restrict' }), // nullable per REC-L1
    holdReason: text('hold_reason').notNull(),
    labourHours: numeric('labour_hours', { precision: 10, scale: 2 }).notNull(),
    variancePerKg: numeric('variance_per_kg', { precision: 18, scale: 6 }), // money: 18,4 / unit-cost: 18,6
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // soft FK comment (cross-package boundary, no DB-level reference):
    // license_plate_id — soft FK to 05-warehouse.license_plates, enforced via service layer.
    licensePlateId: uuid('license_plate_id'),
  },
  (t) => ({
    orgIdx: index('quality_holds_org_idx').on(t.orgId),
    orgSiteIdx: index('quality_holds_org_site_idx').on(t.orgId, t.siteId), // composite for multi-site
    orgReasonUq: uniqueIndex('quality_holds_org_reason_uq').on(t.orgId, t.holdReason),
  }),
);
```

Rules:
- `org_id uuid not null references organizations(id)` on EVERY new business table — no exceptions.
- Nullable `site_id` only on tables explicitly marked REC-L1 (`OR site_id IS NULL` cross-site queries). Otherwise `site_id uuid not null`.
- Money columns: `numeric(18, 4)`. Unit-cost / per-kg: `numeric(18, 6)`. Percentages stored as decimal: `numeric(7, 4)` (0.0000–100.0000).
- Soft FKs (cross-package, e.g., to `08-PROD.wo_outputs` from `12-REPORTING`): NO `references()` clause — leave comment `// soft FK to <module>.<table>; service-layer-validated.` Drizzle reference would force a circular dep.
- Re-export from `packages/db/schema/index.ts`: `export * from './quality-holds';`.

## Migration SQL pattern (canonical)

```sql
-- Migration NNNN: <module> — <table>: org-scoped business table with RLS + audit
-- PRD: docs/prd/<NN-MODULE>-PRD.md §<section>
-- Wave0: org_id (not tenant_id). RLS via app.current_org_id().

-- 1. Table DDL
create table if not exists public.quality_holds (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid references public.sites(id) on delete restrict,
  hold_reason     text not null,
  labour_hours    numeric(10, 2) not null,
  variance_per_kg numeric(18, 6),
  license_plate_id uuid, -- soft FK to license_plates (05-warehouse), service-layer-validated
  created_at      timestamptz not null default pg_catalog.now(),
  updated_at      timestamptz not null default pg_catalog.now()
);

-- 2. Indexes (org_id always first; composite for multi-site)
create index if not exists quality_holds_org_idx       on public.quality_holds (org_id);
create index if not exists quality_holds_org_site_idx  on public.quality_holds (org_id, site_id);
create unique index if not exists quality_holds_org_reason_uq
  on public.quality_holds (org_id, hold_reason);

-- 3. Enable + FORCE RLS (FORCE = also applies to table owner; required for app_user)
alter table public.quality_holds enable row level security;
alter table public.quality_holds force row level security;

-- 4. Policies — one per operation, referencing app.current_org_id()
create policy quality_holds_org_context_select on public.quality_holds
  for select to app_user
  using (org_id = app.current_org_id());

create policy quality_holds_org_context_insert on public.quality_holds
  for insert to app_user
  with check (org_id = app.current_org_id());

create policy quality_holds_org_context_update on public.quality_holds
  for update to app_user
  using      (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

create policy quality_holds_org_context_delete on public.quality_holds
  for delete to app_user
  using (org_id = app.current_org_id());

-- 5. Grants — app_user gets DML; PUBLIC gets nothing
revoke all on public.quality_holds from public;
grant select, insert, update, delete on public.quality_holds to app_user;

-- 6. Audit trigger (see Audit Triggers section)
drop trigger if exists quality_holds_audit on public.quality_holds;
create trigger quality_holds_audit
  after insert or update or delete on public.quality_holds
  for each row execute function app.audit_event();

-- 7. updated_at trigger (if updates allowed)
drop trigger if exists quality_holds_set_updated_at on public.quality_holds;
create trigger quality_holds_set_updated_at
  before update on public.quality_holds
  for each row execute function app.set_updated_at();
```

Notes:
- `FORCE ROW LEVEL SECURITY` is mandatory — without it, the table owner bypasses RLS, defeating the contract.
- Four separate policies (SELECT/INSERT/UPDATE/DELETE), not one `for all`. UPDATE needs both `using` (visibility) and `with check` (post-update row must still belong to org).
- Policy names end `_org_context_<op>` — pg_policies AC greps for it.
- Index names: `<table>_<purpose>_idx` (lowercase, snake_case).
- `revoke all from public` is required for fail-closed default.

## Audit + updated_at triggers  ⚠️ CORRECTED 2026-06-05 (this caused a live deploy failure)

**There is NO generic `app.audit_event()` row-trigger function in this repo.** Verified: no
migration defines `create function app.audit_event` (004-audit.sql ships only the `audit_events`
TABLE + `public.audit_events_impersonation_guard()`). Attaching `... execute function
app.audit_event()` will pass a superuser local Postgres but **FAIL the Vercel fail-loud migrate on
Supabase** with `function app.audit_event() does not exist` (this is exactly how migration 204
broke deploy `eb011dc8` on 2026-06-05; migs 197/199/181 all document the same). The canonical R13
audit pattern is:

1. **Audit COLUMNS** on the table: `created_by uuid`, `updated_by uuid`, `created_at timestamptz
   not null default pg_catalog.now()`, `updated_at timestamptz not null default pg_catalog.now()`.
2. **A module-local `updated_at` trigger** — define your OWN inline fn, do NOT call a shared one
   (there is also NO shared `app.set_updated_at()`; references to it in 063/064/072 are comments):
   ```sql
   create or replace function public.<module>_set_updated_at()
   returns trigger language plpgsql as $$
   begin new.updated_at := pg_catalog.now(); return new; end; $$;

   drop trigger if exists <table>_set_updated_at on public.<table>;
   create trigger <table>_set_updated_at
     before update on public.<table>
     for each row execute function public.<module>_set_updated_at();
   ```
3. **Mutating-action `audit_events` rows are written by the Server Action layer** (T2-api), NOT a
   DB row trigger. `retention_class` defaults `'standard'`; opt into `'security'` for e-sign/security
   surfaces. The columns are `(org_id, actor_user_id, actor_type, action, resource_type,
   resource_id, before_state, after_state, retention_class)`; `actor_type ∈
   ('user','system','scim','impersonation')`, `retention_class ∈
   ('security','standard','operational','ephemeral')`.

## Supabase-applyable migration gotchas (the migration role is NOT superuser)

Vercel build runs `pnpm --filter @monopilot/db migrate` fail-loud against Supabase as a
non-superuser role. A migration that works on local superuser Postgres can still break the deploy.
Avoid (all caused real failures or are known landmines):

- ❌ `app.audit_event()` / `app.set_updated_at()` — don't exist (see above). Use module-local fns.
- ❌ `LEAKPROOF` on a function — "only superuser can define a leakproof function" (broke mig 215).
  Drop the keyword; it's only a planner hint. `SECURITY DEFINER STABLE` is fine.
- ❌ `ALTER FUNCTION ... OWNER TO service_role` / any owner-change in schema public — wrap in a
  `DO $$ BEGIN ... EXCEPTION WHEN insufficient_privilege THEN ... END $$;` guard (mig 124 precedent).
- ❌ `CREATE EXTENSION` — not permitted; extensions are pre-provisioned.
- ✅ **Materialized-view unique index for `REFRESH ... CONCURRENTLY`** must use **plain columns,
  NOT expressions** (`coalesce(...)` functional indexes are rejected). If the unique key has
  nullable columns, add a real `site_key` column (`coalesce(site_id,'000…'::uuid)`) to the MV and
  index that — a plain-column index — which requires recreating the MV. (QG-12 stayed deferred
  because the functional-index shortcut silently breaks concurrent refresh.)
- ✅ **Cross-org safety for MVs**: a materialized view cannot host an RLS policy and `REFRESH` runs
  as the owner across ALL orgs. Do NOT grant `app_user` SELECT on the raw MV. Instead ship a
  `security_invoker` wrapper view and grant THAT (see the corrected MV row in Hard rules):
  ```sql
  create or replace view public.v_<mv> with (security_invoker = true) as
    select * from public.<mv> where org_id = app.current_org_id();
  revoke select on public.<mv> from app_user;  grant select on public.v_<mv> to app_user;
  ```
  (Pattern shipped in migs 221 reporting + 228 oee, fixing QG-02/QG-06 cross-org leaks.)
- ✅ **Outbox CHECK**: if your migration recreates `outbox_events_event_type_check`, it must list
  the FULL `DB_EVENT_TYPES` union, not just your module's events — each module narrowly recreating
  it drops the others (drift). Regenerate from `packages/outbox/src/events.enum.ts DB_EVENT_TYPES`;
  the highest-numbered migration that touches the CHECK wins (see mig 217).
- ✅ **Canonical-owner table-name collisions**: before `create table public.X`, confirm no other
  module already owns `X` (e.g. `spare_parts_stock` clashed between 05-warehouse + 13-maintenance →
  renamed maintenance's to `maintenance_spare_parts_stock`). `if not exists` SILENTLY skips a
  second creator, leaving the table with the wrong module's columns — a latent bug, not an error.

## Multi-site extension

If the module is multi-site-aware (anything Warehouse, Production, Quality, Shipping, OEE, Scanner), the table almost always carries `site_id`:

| Pattern | Detail |
|---|---|
| Column | `site_id uuid` — `not null` if business-mandatory; `null`-able only when REC-L1 cross-site applies |
| Index | Composite `(org_id, site_id)` plus `(org_id, site_id, <business_keys>)` for hot paths |
| RLS | Use BOTH `app.current_org_id()` AND `app.current_site_id()` when current_site is bound, else `(site_id = app.current_site_id() or site_id is null)` for REC-L1 nullable case |
| Cross-link | See `[[MON-multi-tenant-site]]` for the RLS dual-context pattern and `app.set_site_context` setter |

REC-L1 policy template (site-nullable cross-site read):

```sql
create policy quality_holds_org_site_context_select on public.quality_holds
  for select to app_user
  using (
    org_id = app.current_org_id()
    and (site_id = app.current_site_id() or site_id is null)
  );
```

If your task JSON does not mention site_id and the module is not multi-site, omit the site_id column entirely. Do not add it speculatively — that bloats migrations and adds index work for unrelated rows.

## Mandatory risk red lines (copy into task JSON if missing)

At least three of the following must be present in `risk_red_lines`. If absent in the task JSON, append before implementing — file a follow-up note in the closeout.

1. "Do not use `tenant_id` as the business-scope column; per Wave0 v4.3 lock it is `org_id`. See `_meta/audits/2026-05-14-tenant-context-remediation.md`."
2. "Do not read `current_setting('app.tenant_id')` or `current_setting('app.current_org_id')` directly — use the foundation `app.current_org_id()` function so the NULL-safe setter contract is preserved."
3. "Every new table MUST have `org_id` not null, RLS enabled + FORCED, and policies referencing `app.current_org_id()` for SELECT/INSERT/UPDATE/DELETE."
4. "Do not GRANT to PUBLIC; grant DML only to `app_user`; tighter roles (`app_reporting_role`, `app_cron_role`) per module needs."
5. "Do not attempt RLS policies on materialized views — Postgres does not support; enforce filter at service layer."
6. "Do not use bare `NUMERIC` for money/unit-cost — use `numeric(18, 4)` for money, `numeric(18, 6)` for unit-cost, `numeric(7, 4)` for percentages."

## Acceptance criteria template (3–4 ACs per task)

Always cover these four shapes; merge to fit the 4-AC saturation rule from prd-decompose-hybrid:

1. **Schema + migration + RLS created.** "Given migration NNNN runs against a fresh testcontainers Postgres, when `\d <table>` is inspected, then all declared columns, indexes, and RLS=enabled+forced appear."
2. **pg_policies sanity.** "Given the migration completes, when `select * from pg_policies where tablename = '<table>'` runs, then exactly four policies exist (`<table>_org_context_select/insert/update/delete`) and each `qual`/`with_check` contains the literal `app.current_org_id()`."
3. **Cross-org isolation.** "Given two orgs A and B insert rows under their respective `app.set_org_context()` sessions, when org_A runs `select * from <table>`, then zero org_B rows are returned (and vice versa)."
4. **Audit emission.** "Given an INSERT/UPDATE/DELETE runs under an org-context session, when `audit_events` is queried for the resulting `resource_type='<table>'`, then exactly one matching row appears with `org_id` populated from `app.current_org_id()`."

(For MVs, replace AC2 with: "Given the MV is created, when `\d+ <mv>` is inspected, then a UNIQUE INDEX exists on the row-identifying tuple — required for `REFRESH MATERIALIZED VIEW CONCURRENTLY`.")

## RED test commands

```bash
# Drizzle schema unit + migration runner contract
pnpm --filter @monopilot/db test

# Module-owned schema (e.g., reporting MV)
pnpm --filter @monopilot/<module> test <feature>

# psql one-liners to verify after migration in a CI/devcontainer Postgres
psql "$DATABASE_URL" -c "select schemaname, tablename, rowsecurity, forcerowsecurity
  from pg_tables where tablename = '<table>';"

psql "$DATABASE_URL" -c "select policyname, cmd, qual, with_check
  from pg_policies where tablename = '<table>' order by policyname;"

psql "$DATABASE_URL" -c "select tgname, tgrelid::regclass
  from pg_trigger where tgrelid = 'public.<table>'::regclass and not tgisinternal;"
```

If the project ships a contract test (`_foundation/__tests__/marker-discipline.test.ts`, or a `pnpm db:check` script), run it after migration to catch GUC-drift regressions automatically.

## Common mistakes (caught in audits, do not repeat)

- Adding `org_id` but forgetting `FORCE ROW LEVEL SECURITY` — owner bypasses RLS in psql admin sessions; tests pass under `app_user` but security review fails.
- Using `policy_name without _org_context` suffix — pg_policies grep AC fails.
- Forgetting `with check` on UPDATE policy — allows org A to "move" its row to org B by updating `org_id`.
- Re-declaring `app.current_org_id()` or `app.audit_event()` — foundation owns these; redefinition breaks migration ordering.
- Putting `site_id` on a table where the module is not multi-site — bloat + index churn + breaks composite-index PRD anchors.
- Bare `numeric` for money columns — variance KPIs round wrong; reviewer hard-fails per F1 fixer notes.
- Adding seed data inside the migration — that is T5-seed, separate task.
- **Editing an already-applied migration** — migrations are checksum-tracked; mutating an applied file makes the runner refuse or skip silently and the live schema drifts from the repo. ALWAYS add a new forward migration (next number) instead of editing a shipped one. (This + a fail-silent build deployed a stale schema to 02-settings live.)
- **Naming a migration `0NN_*` or with a 4-digit prefix** — the runner regex `^(\d{3})-[a-z0-9-]+\.sql$` skips it silently (it never runs), so the table is missing live while local tests that re-run all SQL still pass. Use a 3-digit prefix ≥ current HEAD, hyphen-separated, lowercase.

## Cross-links

- `[[MON-multi-tenant-site]]` — `app.set_site_context` + REC-L1 cross-site read pattern + dual-context RLS
- `[[MON-foundation-primitives]]` — `app.set_org_context`, `app.current_org_id`, `app.audit_event`, T-111/T-112/T-116 contracts
- `[[MON-t2-api]]` — Server Action / route handler implementation; consumes the schema this skill produces, wraps with `withOrgContext`
- `[[MON-t4-test]]` — integration/wiring tests; verifies cross-org isolation + audit emission end-to-end
- `[[prd-decompose-hybrid]]` — task JSON shape, T1 vs T2 vs T3 boundaries, priority bands

## Pipeline checklist (closeout requires all)

- [ ] Drizzle schema file written under `packages/db/schema/<module>.ts` (or `packages/<module>/src/schema/*.ts` for module-owned read-models)
- [ ] Re-exported from `packages/db/schema/index.ts` (business tables only)
- [ ] Migration file numbered correctly (`NNNN-<descriptor>.sql`), highest+1
- [ ] `enable row level security` + `force row level security`
- [ ] Four policies (SELECT/INSERT/UPDATE/DELETE) named `<table>_org_context_<op>` referencing `app.current_org_id()`
- [ ] `revoke all from public` + targeted `grant` to `app_user` (or narrower role)
- [ ] Audit trigger attached: `<table>_audit after insert or update or delete ... execute function app.audit_event()`
- [ ] Indexes: `(org_id)` always; `(org_id, site_id)` if multi-site; unique indexes per business invariants and for MV REFRESH CONCURRENTLY
- [ ] NUMERIC precisions explicit for money/unit-cost/percent
- [ ] testcontainers Postgres test covers 4 ACs (schema, pg_policies, cross-org isolation, audit emission)
- [ ] All mandatory red lines present in task JSON (append + note if missing)
- [ ] No `tenant_id`, no `current_setting('app.tenant_id'|'app.current_org_id')`, no `SET LOCAL app.current_org_id` anywhere in the diff
