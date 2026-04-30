---
title: Phase E-0 Foundation — Merged Backlog (ready for execution)
version: 1.0
date: 2026-04-22
status: ready-for-execution
authors: Claude (Opus 4.7) orchestrator — merged from alt 61-task backlog + existing 47-task governance + 6 user decisions
scope: Phase E-0 Foundation only (sub-modules 00-a..00-i)
inputs:
  - .claude/worktrees/agent-a64af338/_meta/plans/2026-04-22-foundation-alt-plan.md (61 alt tasks, authoritative source)
  - .taskmaster/tasks/tasks.json (existing 47 tasks — governance titles)
  - _meta/plans/2026-04-22-foundation-backlog-comparison.md (decision record)
decisions_applied:
  - Main Table 69 cols — KEEP in E-0 (gap-fill T-00b-M01)
  - D365/Peppol/GS1 stubs — DEFER (single out-of-scope pointer)
  - PWA + IndexedDB — KEEP in E-0 (gap-fills T-00a-008 + T-00a-009)
  - Per-tenant theming — DEFER to E-1 (pointer only)
  - Pre-commit token-cap gate — PORT with 40000 (gap-fill T-00a-006b)
  - T-43 ADR stubs — SPLIT NOW into 15 atomic docs/adr tasks
total_tasks: 95
---

# Phase E-0 Foundation — Merged Backlog

**Method:** alt 61-task decomposition (atomic per §11.3) + 12 governance items preserved from existing 47 + 15 T-43 splits + 6 gap-fill tasks from user decisions + 1 out-of-scope pointer = 95 tasks.

**Integration milestone (dogfood target):** "A developer can `pnpm dev` a fresh checkout; CI is green on a trivial PR; a Playwright test shows that a logged-in user in Org-A cannot read Org-B data (RLS enforces); inserting a row in any business table produces one `audit_log` entry and one `outbox_events` row which the pg-boss worker processes and marks consumed; the rule engine returns a deterministic output for a canned `dry-run` input; a Zod schema generated from `Reference.DeptColumns` metadata validates a sample payload; the 69-col Main Table migration applied cleanly; PWA registers a service worker and IndexedDB sync queue accepts offline writes."

---

## §0 — Architect-owned enum locks (HARD BLOCKERS)

Four tasks gate all parallel atomic work. No dispatch until all four merged. Copied verbatim from alt plan §0.

### T-00b-000 — Baseline migration `001-baseline.sql` (architect lock)

**Type:** T1-schema
**Context budget:** ~50k tokens
**Est time:** 75 min
**Parent feature:** 00-b scaffolding
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending (HARD BLOCKER)

#### Dependencies
- **Upstream:** [T-00a-005, T-00b-001]
- **Downstream:** [every T-00d-*, T-00e-*, T-00f-*]
- **Parallel:** none (architect-owned, serial)

#### GIVEN / WHEN / THEN
**GIVEN** Supabase local + Drizzle config are initialised
**WHEN** the baseline migration is applied
**THEN** tables `tenants`, `users`, `user_tenants`, `roles`, `user_roles`, `modules`, `organization_modules` exist with `tenant_id UUID NOT NULL` and the R13 columns (`id UUID`, `external_id`, `created_at`, `created_by_user`, `created_by_device`, `app_version`, `model_prediction_id`, `epcis_event_id`) on every business table

#### Implementation
1. Author `drizzle/schema/baseline.ts` with 7 tables + typed cols
2. Add `schema_version INT NOT NULL DEFAULT 1` column to every business table
3. Generate migration via `pnpm drizzle-kit generate`
4. Dry-run migration on ephemeral Postgres, verify DDL with `\d+ <table>`
5. Commit migration SQL file `drizzle/migrations/001-baseline.sql`

#### Files
- **Create:** `drizzle/schema/baseline.ts`, `drizzle/migrations/001-baseline.sql`
- **Modify:** `drizzle.config.ts`

#### Test gate
- **Integration:** `vitest drizzle/migrations/001-baseline.integration.test.ts` — asserts all 7 tables exist, R13 cols present, `schema_version` default 1
- **CI gate:** `pnpm test:migrations` green

#### Rollback
`pnpm drizzle-kit drop` (drops all in the baseline migration).

---

### T-00b-E01 — `permissions.enum.ts` lock (architect)

**Type:** T1-schema
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** cross-cutting enum locks
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending (HARD BLOCKER)

#### Dependencies
- **Upstream:** [T-00a-005]
- **Downstream:** every task that checks RBAC (00-c, 00-d, 00-e, 00-f)
- **Parallel:** [T-00b-E02, T-00b-E03]

#### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** the RBAC enum file is merged
**THEN** a single source of truth exists for permission strings (`org.admin`, `fa.create`, `fa.edit`, `brief.convert_to_fa`, `closed_flag.unset`, `ref.edit`, `audit.read`, `outbox.admin`, `impersonate.tenant`), each with a docstring

#### Implementation
1. Author `lib/rbac/permissions.enum.ts` with const object + exported `Permission` union type
2. Add JSDoc per permission describing scope + ADR ref
3. Export `ALL_PERMISSIONS` as const array for codegen/tests
4. Add unit test that asserts no duplicate strings, all lowercase-dot format
5. Commit; mark file readonly in CODEOWNERS (architect-only)

#### Files
- **Create:** `lib/rbac/permissions.enum.ts`, `lib/rbac/permissions.test.ts`
- **Modify:** `CODEOWNERS`

#### Test gate
- **Unit:** `vitest lib/rbac/permissions.test.ts` — no dupes, regex `^[a-z]+(\.[a-z_]+)+$`
- **CI gate:** `pnpm test:unit` green

#### Rollback
Delete file; no downstream consumers yet (must land before parallel dispatch).

---

### T-00b-E02 — `events.enum.ts` lock (architect)

**Type:** T1-schema
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** cross-cutting enum locks
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending (HARD BLOCKER)

#### Dependencies
- **Upstream:** [T-00a-005]
- **Downstream:** every task emitting outbox events
- **Parallel:** [T-00b-E01, T-00b-E03]

#### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** the events enum file is merged
**THEN** a single source of truth exists for outbox `event_type` strings in ISA-95 dot format (`org.created`, `user.invited`, `role.assigned`, `brief.created`, `fa.created`, `lp.received`, `wo.ready`, `audit.recorded`)

#### Implementation
1. Author `lib/outbox/events.enum.ts` with const object + `EventType` union
2. Document ISA-95 prefix convention per §10 of PRD
3. Export `ALL_EVENTS` array for codegen
4. Unit test asserts no dupes + format regex
5. Commit; readonly in CODEOWNERS

#### Files
- **Create:** `lib/outbox/events.enum.ts`, `lib/outbox/events.test.ts`
- **Modify:** `CODEOWNERS`

#### Test gate
- **Unit:** `vitest lib/outbox/events.test.ts`
- **CI gate:** `pnpm test:unit` green

#### Rollback
Delete file; gate before downstream dispatch.

---

### T-00b-E03 — `ref-tables.enum.ts` lock (architect)

**Type:** T1-schema
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** cross-cutting enum locks
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending (HARD BLOCKER)

#### Dependencies
- **Upstream:** [T-00a-005]
- **Downstream:** 00-h schema-driven runtime, 02-SET-a seeds
- **Parallel:** [T-00b-E01, T-00b-E02]

#### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** the ref-tables enum file is merged
**THEN** the 7 E-0-relevant reference table names are locked (`dept_columns`, `pack_sizes`, `lines_by_pack_size`, `dieset_by_line_pack`, `templates`, `processes`, `close_confirm`) plus a comment pointing to the 10 deferred E-1/E-2 tables

#### Implementation
1. Author `lib/reference/ref-tables.enum.ts` with `RefTable` union
2. Add comment block listing deferred tables (pointer to ADR-032 §1.3)
3. Unit test: no dupes
4. Commit; readonly CODEOWNERS
5. Cross-link to 02-SETTINGS PRD §8.1

#### Files
- **Create:** `lib/reference/ref-tables.enum.ts`, `lib/reference/ref-tables.test.ts`
- **Modify:** `CODEOWNERS`

#### Test gate
- **Unit:** `vitest lib/reference/ref-tables.test.ts`
- **CI gate:** `pnpm test:unit` green

#### Rollback
Delete file.

---

## §1 — Sub-module 00-a — Monorepo + Next.js 14 scaffold (7 tasks)

### T-00a-001 — Initialise pnpm workspace + Turborepo config

**Type:** T1-schema (scaffold infra)
**Context budget:** ~30k tokens
**Est time:** 45 min
**Parent feature:** 00-a scaffold
**Agent routing:** any
**Track:** α
**Status:** pending

> `[infra/monorepo]`

#### Dependencies
- **Upstream:** none (root of graph)
- **Downstream:** [T-00a-002, T-00a-003, T-00a-004, T-00a-005]
- **Parallel:** none

#### GIVEN / WHEN / THEN
**GIVEN** an empty repo
**WHEN** `pnpm install` runs from root
**THEN** `pnpm-workspace.yaml` resolves `apps/*` + `packages/*`, `turbo.json` defines `build | lint | test | dev` pipelines, and `pnpm turbo run build --filter=^` is a no-op green

#### Implementation
1. `pnpm init -w` + author `pnpm-workspace.yaml`
2. Install Turborepo devDep; author `turbo.json` with `build/lint/test/dev` pipelines
3. Add `.gitignore`, `.nvmrc`, `engines` in root `package.json`
4. Verify `pnpm turbo run build --filter=^` exits 0
5. Commit

#### Files
- **Create:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.nvmrc`

#### Test gate
- **CI gate:** `pnpm turbo run build --filter=^` exits 0

#### Rollback
Revert commit.

---

### T-00a-002 — Bootstrap `apps/web` (Next.js 14 App Router, TS strict)

**Type:** T3-ui (app shell)
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-a scaffold
**Agent routing:** frontend-specialist
**Track:** γ
**Status:** pending

> `[ui/layout]`

#### Dependencies
- **Upstream:** [T-00a-001]
- **Downstream:** [T-00a-003, T-00a-004, T-00a-005, T-00c-001]
- **Parallel:** [T-00a-007]

#### GIVEN / WHEN / THEN
**GIVEN** workspace is initialised
**WHEN** `pnpm --filter web dev` runs
**THEN** Next.js 14 App Router boots at `localhost:3000`, serves a placeholder `/` RSC page, TypeScript `strict: true` + `noUncheckedIndexedAccess: true` enforced

#### Implementation
1. `pnpm create next-app@14 apps/web --ts --app --no-eslint` (bare)
2. Harden `tsconfig.json` (strict + noUncheckedIndexedAccess)
3. Replace `/page.tsx` with an RSC placeholder returning `<main>Monopilot</main>`
4. Add `pnpm dev` script wired through Turbo
5. Smoke: `curl localhost:3000 | grep Monopilot`

#### Files
- **Create:** `apps/web/*`
- **Modify:** `turbo.json`

#### Test gate
- **CI gate:** `pnpm --filter web build` green

#### Rollback
`rm -rf apps/web`.

---

### T-00a-003 — Tailwind + shadcn/ui init in `apps/web`

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-a scaffold
**Agent routing:** frontend-specialist
**Track:** γ
**Status:** pending

> `[ui/layout]`

#### Dependencies
- **Upstream:** [T-00a-002]
- **Downstream:** [T-00c-004, every future T3]
- **Parallel:** [T-00a-004]

#### GIVEN / WHEN / THEN
**GIVEN** Next.js app boots
**WHEN** shadcn `Button` is imported and rendered on `/`
**THEN** Tailwind classes resolve, Radix primitives render, dark mode class strategy works

#### Implementation
1. Install tailwindcss + init `tailwind.config.ts` with `content` globs
2. `npx shadcn@latest init` with default theme
3. `npx shadcn@latest add button card dialog input label form`
4. Render `<Button>Hello</Button>` on `/`
5. Verify build + runtime class presence

#### Files
- **Create:** `apps/web/tailwind.config.ts`, `apps/web/components.json`, `apps/web/components/ui/*`
- **Modify:** `apps/web/app/page.tsx`, `apps/web/app/globals.css`

#### Test gate
- **CI gate:** `pnpm --filter web build` green + RTL render test asserting the button renders

#### Rollback
Revert commit.

---

### T-00a-004 — ESLint + Prettier + TypeScript project references

**Type:** T4-wiring+test
**Context budget:** ~30k tokens
**Est time:** 40 min
**Parent feature:** 00-a scaffold
**Agent routing:** any
**Track:** δ
**Status:** pending

> `[infra/config]`

#### Dependencies
- **Upstream:** [T-00a-002]
- **Downstream:** [T-00i-002]
- **Parallel:** [T-00a-003]

#### GIVEN / WHEN / THEN
**GIVEN** the Next.js app scaffold exists
**WHEN** `pnpm lint` and `pnpm typecheck` run at the root
**THEN** both pass across all workspaces with unified config

#### Implementation
1. Add root `eslint.config.mjs` (flat config) + `prettier.config.mjs`
2. Install `eslint-config-next`, `eslint-plugin-tailwindcss`, `prettier-plugin-tailwindcss`
3. Add `tsconfig.base.json` at root; apps extend it
4. Add `lint` and `typecheck` pipelines to `turbo.json`
5. Run both, fix any initial errors, commit

#### Files
- **Create:** `eslint.config.mjs`, `prettier.config.mjs`, `tsconfig.base.json`
- **Modify:** `turbo.json`, `apps/web/tsconfig.json`

#### Test gate
- **CI gate:** `pnpm lint && pnpm typecheck` exits 0

#### Rollback
Revert commit.

---

### T-00a-005 — Root README + CONTRIBUTING skeleton

**Type:** docs
**Context budget:** ~15k tokens
**Est time:** 20 min
**Parent feature:** 00-a scaffold
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/readme]`

#### Dependencies
- **Upstream:** [T-00a-001]
- **Downstream:** none (doc)
- **Parallel:** [T-00a-002, T-00a-003, T-00a-004]

#### Done check
- Final output path: `README.md`, `CONTRIBUTING.md`
- Outline: Stack overview (D1-D12 refs), How to run locally, Monorepo layout, Test discipline (00-i), PR rules (40k token cap per §11.3), Link to Phase E-0 plan
- Verifiable: a fresh dev reaches `pnpm dev` green at `localhost:3000` in ≤10 min

---

### T-00a-006 — Husky pre-commit hook (lint + typecheck on staged)

**Type:** T4-wiring+test
**Context budget:** ~25k tokens
**Est time:** 25 min
**Parent feature:** 00-a scaffold
**Agent routing:** any
**Track:** δ
**Status:** pending

> `[infra/ci]`

#### Dependencies
- **Upstream:** [T-00a-004]
- **Downstream:** [T-00a-006b]
- **Parallel:** none

#### GIVEN / WHEN / THEN
**GIVEN** ESLint + Prettier are configured
**WHEN** a developer commits
**THEN** Husky pre-commit runs `lint-staged` (ESLint + Prettier on staged files) and blocks on failure

#### Implementation
1. Install husky + lint-staged
2. Author `.husky/pre-commit` invoking `pnpm exec lint-staged`
3. Configure `lint-staged` in root `package.json`
4. Smoke: intentionally break a file, commit, observe block
5. Commit fix

#### Files
- **Create:** `.husky/pre-commit`
- **Modify:** `package.json`

#### Test gate
- Manual smoke; CI gate unchanged

#### Rollback
Remove husky install scripts.

---

### T-00a-007 — Env var loader (`@t3-oss/env-nextjs`) + `.env.example`

**Type:** T2-api
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** 00-a scaffold
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

> `[infra/config]`

#### Dependencies
- **Upstream:** [T-00a-002]
- **Downstream:** [T-00b-001, T-00c-001, T-00i-006]
- **Parallel:** [T-00a-003]

#### GIVEN / WHEN / THEN
**GIVEN** Next.js app scaffold exists
**WHEN** any server component reads `env.SUPABASE_URL`
**THEN** missing/invalid env is caught at build time via Zod, typed, with a clear error; `.env.example` lists all required keys

#### Implementation
1. Install `@t3-oss/env-nextjs`
2. Author `apps/web/lib/env.ts` with `server` + `client` + Zod
3. Add keys: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN`
4. Commit `.env.example` (no secrets)
5. Unit test: missing key throws at import

#### Files
- **Create:** `apps/web/lib/env.ts`, `.env.example`

#### Test gate
- **Unit:** `vitest apps/web/lib/env.test.ts` — missing var throws
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Revert commit.

---

## §2 — Sub-module 00-b — Supabase + Drizzle + migrations (6 tasks)

### T-00b-001 — Supabase local (Docker) bootstrap + project link

**Type:** T1-schema
**Context budget:** ~30k tokens
**Est time:** 35 min
**Parent feature:** 00-b db scaffold
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

> `[infra/docker]`

#### Dependencies
- **Upstream:** [T-00a-007]
- **Downstream:** [T-00b-000, T-00b-002, T-00i-003]
- **Parallel:** [T-00b-E01, T-00b-E02, T-00b-E03]

#### GIVEN / WHEN / THEN
**GIVEN** Docker is installed
**WHEN** `supabase start` runs from repo root
**THEN** a local Postgres + GoTrue + Storage stack is up at known ports, `.env.local` is populated with anon + service role keys

#### Implementation
1. `pnpm dlx supabase init`
2. Commit `supabase/config.toml`
3. `supabase start`, capture keys into `.env.local`
4. Add `db:start` / `db:stop` / `db:reset` npm scripts
5. Verify `psql` connection

#### Files
- **Create:** `supabase/config.toml`, scripts in `package.json`

#### Test gate
- **CI gate:** job `supabase-local` starts cluster and connects

#### Rollback
`supabase stop && rm -rf supabase/`.

---

### T-00b-002 — Drizzle config + client singleton

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 00-b db scaffold
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-001]
- **Downstream:** [T-00b-000, T-00b-003]
- **Parallel:** [T-00b-E01, T-00b-E02, T-00b-E03]

#### GIVEN / WHEN / THEN
**GIVEN** Supabase local is up
**WHEN** `import { db } from 'packages/db'` runs server-side
**THEN** Drizzle client connects via `DATABASE_URL`, honours transactions, exposes typed `schema` namespace

#### Implementation
1. Create `packages/db/` workspace
2. Install `drizzle-orm`, `postgres`, `drizzle-kit`
3. Author `packages/db/index.ts` exporting `db` singleton + `client` + `schema`
4. Author `drizzle.config.ts` pointing at `packages/db/schema/*`
5. Smoke: `db.execute(sql`select 1`)`

#### Files
- **Create:** `packages/db/package.json`, `packages/db/index.ts`, `drizzle.config.ts`

#### Test gate
- **Integration:** `vitest packages/db/smoke.test.ts` — `select 1` returns `[{?column?: 1}]`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete package.

---

### T-00b-003 — Migration runner scripts (up/down) + `pnpm migrate`

**Type:** T2-api
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 00-b db scaffold
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

> `[infra/config]`

#### Dependencies
- **Upstream:** [T-00b-000, T-00b-002]
- **Downstream:** [T-00d-001, T-00e-001, T-00f-001, T-00i-003]
- **Parallel:** [T-00b-004]

#### GIVEN / WHEN / THEN
**GIVEN** Drizzle + baseline migration exist
**WHEN** a dev runs `pnpm migrate` or `pnpm migrate:down`
**THEN** drizzle-kit applies / reverts migrations idempotently, `drizzle_migrations` tracks applied set, CI runs the same script headless

#### Implementation
1. `packages/db/scripts/migrate.ts` wrapping `drizzle-kit migrate`
2. `scripts/migrate-down.ts` (uses `drizzle-kit drop` with guard)
3. npm scripts: `migrate`, `migrate:down`, `migrate:status`
4. Integration test runs `migrate up → down → up`
5. Document in README

#### Files
- **Create:** `packages/db/scripts/migrate.ts`, `packages/db/scripts/migrate-down.ts`
- **Modify:** `package.json`

#### Test gate
- **Integration:** `vitest packages/db/scripts/migrate.test.ts`
- **CI gate:** `pnpm migrate && pnpm migrate:status` green

#### Rollback
Revert; drop `drizzle_migrations`.

---

### T-00b-004 — Seed runner + named snapshots registry

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 50 min
**Parent feature:** 00-b db scaffold
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-000]
- **Downstream:** [T-00i-004, T-00d-004]
- **Parallel:** [T-00b-003]

#### GIVEN / WHEN / THEN
**GIVEN** baseline migration applied
**WHEN** `pnpm seed forza-baseline` runs
**THEN** named snapshot populates deterministic Forza seed (1 tenant, 3 users, 3 roles) idempotently; re-running is a no-op

#### Implementation
1. `packages/db/seed/index.ts` with `applySnapshot(name)` dispatcher
2. `packages/db/seed/snapshots/forza-baseline.ts`
3. `packages/db/seed/snapshots/empty-tenant.ts`
4. `packages/db/seed/snapshots/multi-tenant-3.ts`
5. npm script `seed` + test

#### Files
- **Create:** `packages/db/seed/*`
- **Modify:** `package.json`

#### Test gate
- **Integration:** `vitest packages/db/seed/seed.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
`DELETE FROM tenants` on test DB.

---

### T-00b-005 — Schema drift detector (daily job + CI gate)

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 50 min
**Parent feature:** 00-b db scaffold
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

> `[infra/monitoring]`

#### Dependencies
- **Upstream:** [T-00b-003, T-00h-001]
- **Downstream:** none
- **Parallel:** [T-00b-004]

#### GIVEN / WHEN / THEN
**GIVEN** Drizzle schema + `Reference.DeptColumns` metadata exist
**WHEN** the drift job runs
**THEN** differences between `information_schema.columns` and declared Drizzle schema are reported (`drift_events` table row + Sentry breadcrumb), exit code 1 in CI on any drift

#### Implementation
1. Author `packages/db/scripts/drift-check.ts`
2. Compare `pg_catalog` column list vs Drizzle schema introspection
3. Emit to `drift_events` table + stdout
4. Add CI step that runs on ephemeral DB
5. Integration test with deliberate drift fixture

#### Files
- **Create:** `packages/db/scripts/drift-check.ts`, `drizzle/migrations/002-drift-events.sql`
- **Modify:** `turbo.json`

#### Test gate
- **Integration:** `vitest packages/db/drift-check.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Disable CI step; `DROP TABLE drift_events`.

---

### T-00b-006 — Supabase client singleton + `setCurrentOrgId` RLS context setter

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-b db scaffold
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-002]
- **Downstream:** [T-00c-003, T-00d-002]
- **Parallel:** [T-00b-005]

#### GIVEN / WHEN / THEN
**GIVEN** Drizzle client exists
**WHEN** a request handler calls `await setCurrentOrgId(db, orgId)`
**THEN** the Postgres session has `SET LOCAL app.current_org_id = '…'`; subsequent RLS policies see it

#### Implementation
1. Author `packages/db/rls-context.ts` with `setCurrentOrgId(db, uuid)` using `SET LOCAL`
2. Error if not in a transaction
3. Export typed helper `withOrgContext(orgId, fn)`
4. Unit + integration tests
5. Commit

#### Files
- **Create:** `packages/db/rls-context.ts`, `packages/db/rls-context.test.ts`

#### Test gate
- **Integration:** `vitest packages/db/rls-context.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete file.

---

## §3 — Sub-module 00-c — Auth + session + org_id middleware (6 tasks)

### T-00c-001 — Supabase Auth (GoTrue) schema migration + `users` FK

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-c auth
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-000]
- **Downstream:** [T-00c-002, T-00c-003]
- **Parallel:** [T-00d-001]

#### GIVEN / WHEN / THEN
**GIVEN** Supabase local has auth.users table
**WHEN** baseline migration `003-auth-users.sql` runs
**THEN** `public.users` has FK to `auth.users.id` with ON DELETE CASCADE + `email` column mirrored at insert via trigger

#### Implementation
1. Author migration `003-auth-users.sql`
2. Add trigger `on_auth_user_created`
3. Integration test: insert via supabase client, assert public row
4. Update Drizzle schema types
5. Commit

#### Files
- **Create:** `drizzle/migrations/003-auth-users.sql`
- **Modify:** `packages/db/schema/baseline.ts`

#### Test gate
- **Integration:** `vitest auth-users.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
`drop trigger; drop fk;`.

---

### T-00c-002 — Email+password signup/login Server Actions

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00c-001, T-00b-E01]
- **Downstream:** [T-00c-004, T-00c-005]
- **Parallel:** [T-00c-003]

#### GIVEN / WHEN / THEN
**GIVEN** auth schema exists
**WHEN** `signupAction({ email, password })` or `loginAction` is called
**THEN** the GoTrue call succeeds, a Supabase session cookie is set, a `user.invited` or `user.logged_in` outbox event is emitted, bad inputs return typed Zod errors

#### Implementation
1. Author `apps/web/actions/auth/signup.ts` + `login.ts` with `'use server'`
2. Input Zod schema + parse
3. Call `supabase.auth.signUp/signInWithPassword`
4. Set cookie via `cookies()`, emit outbox event
5. Unit test happy + bad input

#### Files
- **Create:** `apps/web/actions/auth/signup.ts`, `apps/web/actions/auth/login.ts`, tests

#### Test gate
- **Unit:** mocks GoTrue, asserts cookie + event
- **Integration:** real Supabase local, asserts session
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete actions.

---

### T-00c-003 — Next.js middleware: extract session + `app.current_org_id`

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00c-001, T-00b-006]
- **Downstream:** [T-00d-002, T-00d-003, every business route]
- **Parallel:** [T-00c-002]

#### GIVEN / WHEN / THEN
**GIVEN** a request arrives with a Supabase session cookie
**WHEN** `middleware.ts` resolves
**THEN** the user + active `org_id` (from `user_tenants` or `active_org_id` cookie) is attached to request context; downstream `db` calls run inside `withOrgContext`

#### Implementation
1. Author `apps/web/middleware.ts` using `@supabase/ssr`
2. Resolve active org_id
3. Stash in `x-org-id` request header
4. Unit test: unauthenticated → redirect `/login`
5. Commit

#### Files
- **Create:** `apps/web/middleware.ts`, test

#### Test gate
- **Unit:** `vitest middleware.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete middleware file.

---

### T-00c-004 — Login page UI (shadcn Form + RHF + Zod)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 00-c auth
**Agent routing:** frontend-specialist
**Track:** γ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00c-002, T-00a-003]
- **Downstream:** [T-00c-006]
- **Parallel:** [T-00c-005]

#### GIVEN / WHEN / THEN
**GIVEN** shadcn is installed and signup/login actions exist
**WHEN** a user navigates to `/login`
**THEN** a form with email + password renders, Zod client-side validates, submit invokes Server Action, error/loading states render

#### Implementation
1. Create route `apps/web/app/(auth)/login/page.tsx`
2. Build `<LoginForm />` with shadcn Form primitives
3. Wire Server Action via `useFormState`
4. Loading + error states (toast)
5. RTL render test

#### Files
- **Create:** `apps/web/app/(auth)/login/page.tsx`, `apps/web/components/auth/login-form.tsx`, test

#### Test gate
- **Unit:** RTL renders form + shows error on bad input
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete route + component.

---

### T-00c-005 — Logout Server Action + session invalidation

**Type:** T2-api
**Context budget:** ~30k tokens
**Est time:** 25 min
**Parent feature:** 00-c auth
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00c-002]
- **Downstream:** [T-00c-006]
- **Parallel:** [T-00c-004]

#### GIVEN / WHEN / THEN
**GIVEN** an authenticated session cookie
**WHEN** `logoutAction()` runs
**THEN** the cookie is cleared, GoTrue session revoked, an outbox `user.logged_out` event recorded

#### Implementation
1. Author `apps/web/actions/auth/logout.ts`
2. `supabase.auth.signOut()` + clear cookie
3. Emit outbox event
4. Unit test
5. Commit

#### Files
- **Create:** `apps/web/actions/auth/logout.ts`, test

#### Test gate
- **Unit:** `vitest logout.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete action.

---

### T-00c-006 — E2E: login → middleware sets org_id → logout

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00c-003, T-00c-004, T-00c-005, T-00i-005]
- **Downstream:** none
- **Parallel:** none

#### GIVEN / WHEN / THEN
**GIVEN** a seeded forza-baseline DB
**WHEN** Playwright navigates `/login`, submits known creds, calls a `/api/whoami` route, then logs out
**THEN** the `whoami` route returns the correct user + org_id via `current_setting('app.current_org_id')`, and post-logout `/login` redirect occurs

#### Implementation
1. Add Playwright spec `e2e/auth.spec.ts`
2. Implement `GET /api/whoami` route
3. Run spec in CI matrix
4. Assert 3 steps
5. Commit

#### Files
- **Create:** `e2e/auth.spec.ts`, `apps/web/app/api/whoami/route.ts`

#### Test gate
- **E2E:** `playwright e2e/auth.spec.ts` green
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove spec + route.

---

## §4 — Sub-module 00-d — RLS baseline (5 tasks)

### T-00d-001 — RLS policy generator helper (`policyFor(table)`)

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-000]
- **Downstream:** [T-00d-002]
- **Parallel:** [T-00c-001]

#### GIVEN / WHEN / THEN
**GIVEN** baseline tables exist with `tenant_id UUID NOT NULL`
**WHEN** `policyFor('fa')` is called during migration authoring
**THEN** it emits `ENABLE RLS` + `USING (tenant_id = current_setting('app.current_org_id')::uuid)` + `WITH CHECK` SQL fragments

#### Implementation
1. Author `packages/db/rls/policy-for.ts`
2. Generates 4 policy statements (select/insert/update/delete)
3. Unit test asserts SQL shape
4. Wire into migration helper
5. Commit

#### Files
- **Create:** `packages/db/rls/policy-for.ts`, test

#### Test gate
- **Unit:** `vitest policy-for.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete file.

---

### T-00d-002 — Migration `004-rls-baseline.sql` (enable RLS on 7 baseline tables)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00d-001, T-00c-003]
- **Downstream:** [T-00d-004]
- **Parallel:** [T-00d-003]

#### GIVEN / WHEN / THEN
**GIVEN** baseline tables + `app.current_org_id` setter exist
**WHEN** migration runs
**THEN** every baseline table has `ENABLE RLS` + policies; superuser is never used in test connections (R3)

#### Implementation
1. Generate policies via `policyFor` for each baseline table
2. Commit migration SQL
3. Add `app_role` Postgres role
4. Update `DATABASE_URL` documentation
5. Integration test: app_role can't bypass RLS

#### Files
- **Create:** `drizzle/migrations/004-rls-baseline.sql`
- **Modify:** `supabase/config.toml`

#### Test gate
- **Integration:** `vitest rls-baseline.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
`drop policy` per table.

---

### T-00d-003 — LEAKPROOF SECURITY DEFINER wrappers (SQL functions)

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-d RLS
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00d-001]
- **Downstream:** [T-00d-004]
- **Parallel:** [T-00d-002]

#### GIVEN / WHEN / THEN
**GIVEN** policies use `current_setting(..., true)`
**WHEN** migration adds `SECURITY DEFINER LEAKPROOF` helpers (e.g., `fn_current_org()`)
**THEN** policies use wrappers; functions marked `LEAKPROOF` so planner pushes down across views safely (R3)

#### Implementation
1. Author migration `005-rls-wrappers.sql`
2. Define `fn_current_org()` `RETURNS uuid` `SECURITY DEFINER LEAKPROOF`
3. Reroute policies to use it
4. Integration test
5. Commit

#### Files
- **Create:** `drizzle/migrations/005-rls-wrappers.sql`

#### Test gate
- **Integration:** `vitest rls-wrappers.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Drop functions.

---

### T-00d-004 — Integration test: cross-tenant leak regression suite

**Type:** T4-wiring+test
**Context budget:** ~65k tokens
**Est time:** 60 min
**Parent feature:** 00-d RLS
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00d-002, T-00d-003, T-00b-004]
- **Downstream:** none (gate)
- **Parallel:** [T-00e-004]

#### GIVEN / WHEN / THEN
**GIVEN** 2 seeded tenants (`multi-tenant-3` snapshot)
**WHEN** the suite runs SELECT/INSERT/UPDATE/DELETE on every baseline table with org A context
**THEN** zero rows belonging to org B are ever returned or mutated

#### Implementation
1. Author `tests/rls/cross-tenant-leak.integration.test.ts`
2. For each baseline table, run 4 ops under org A, assert B untouched
3. Include "would-leak" scenario that must fail
4. Add to CI gate job `pnpm test:rls`
5. Commit

#### Files
- **Create:** `tests/rls/cross-tenant-leak.integration.test.ts`

#### Test gate
- **Integration:** green
- **CI gate:** `pnpm test:rls` green

#### Rollback
Remove test (permanent gate).

---

### T-00d-005 — `impersonating_as` flag plumbing (session + audit)

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00c-003, T-00e-002]
- **Downstream:** none
- **Parallel:** [T-00d-004]

#### GIVEN / WHEN / THEN
**GIVEN** a superadmin session
**WHEN** they POST to `/api/impersonate` with `target_org_id`
**THEN** session gets `impersonating_as` set, every DB call logs `actor` and `impersonating_as` into `audit_log`; RLS never silently bypassed

#### Implementation
1. Add session field `impersonating_as` (signed cookie)
2. Server Action `startImpersonation(targetOrgId)` with RBAC guard `impersonate.tenant`
3. Audit emit
4. Extend `withOrgContext`
5. Unit test

#### Files
- **Create:** `apps/web/actions/impersonate.ts`, test
- **Modify:** `packages/db/rls-context.ts`

#### Test gate
- **Unit + Integration:** assert audit records actor + impersonating_as
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Revert action; remove cookie field.

---

## §5 — Sub-module 00-e — Audit log infrastructure (5 tasks)

### T-00e-001 — Migration `006-audit-log.sql` (partitioned append-only)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-e audit
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-000]
- **Downstream:** [T-00e-002, T-00e-003]
- **Parallel:** [T-00c-001, T-00d-001]

#### GIVEN / WHEN / THEN
**GIVEN** baseline applied
**WHEN** `006-audit-log.sql` runs
**THEN** `audit_log` table partitioned by month on `created_at`, append-only (REVOKE UPDATE/DELETE), with `tenant_id`, `actor`, `impersonating_as`, `entity_type`, `entity_id`, `before_jsonb`, `after_jsonb`, `app_version`

#### Implementation
1. Author partitioned parent + initial 3 partitions
2. REVOKE UPDATE/DELETE from `app_role`
3. GRANT SELECT to `app_role`, INSERT via trigger only
4. Index on `(tenant_id, entity_type, created_at)`
5. Integration test

#### Files
- **Create:** `drizzle/migrations/006-audit-log.sql`
- **Modify:** `packages/db/schema/audit.ts`

#### Test gate
- **Integration:** `vitest audit-log.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
`DROP TABLE audit_log CASCADE`.

---

### T-00e-002 — Generic audit trigger factory (`install_audit_trigger(table)`)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-e audit
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00e-001]
- **Downstream:** [T-00e-003]
- **Parallel:** [T-00e-004]

#### GIVEN / WHEN / THEN
**GIVEN** audit table exists
**WHEN** `install_audit_trigger('fa')` runs
**THEN** INSERT/UPDATE/DELETE on `fa` emits an `audit_log` row with diff JSONB, actor from `current_setting('app.current_actor_id')`

#### Implementation
1. Author PL/pgSQL function `fn_audit_trigger()`
2. Author SQL helper `install_audit_trigger(regclass)`
3. Install on baseline business tables
4. Integration test
5. Commit

#### Files
- **Create:** `drizzle/migrations/007-audit-triggers.sql`

#### Test gate
- **Integration:** `vitest audit-trigger.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Drop triggers.

---

### T-00e-003 — `audit.recorded` outbox emission hook

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-e audit
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00e-002, T-00f-002, T-00b-E02]
- **Downstream:** none
- **Parallel:** [T-00e-004]

#### GIVEN / WHEN / THEN
**GIVEN** audit triggers + outbox helper exist
**WHEN** an audit row is inserted
**THEN** the trigger also calls `insertOutboxEvent('audit.recorded', …)` in same txn

#### Implementation
1. Extend `fn_audit_trigger()` to call outbox insert helper
2. Verify transactional atomicity
3. Integration test
4. Document
5. Commit

#### Files
- **Modify:** `drizzle/migrations/008-audit-outbox.sql`

#### Test gate
- **Integration:** insert on `fa` → audit row + outbox row both present in same txn
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Drop helper call.

---

### T-00e-004 — Audit query API (`GET /api/audit?entity=…`)

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 45 min
**Parent feature:** 00-e audit
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00e-002, T-00b-E01]
- **Downstream:** none
- **Parallel:** [T-00e-003, T-00d-004]

#### GIVEN / WHEN / THEN
**GIVEN** audit_log populated
**WHEN** a user with `audit.read` calls `GET /api/audit?entity_type=fa&entity_id=<uuid>`
**THEN** returns the full diff timeline JSON, scoped by RLS to their tenant, limited to 500 rows

#### Implementation
1. Author `apps/web/app/api/audit/route.ts`
2. Zod parse query params
3. RBAC guard `audit.read`
4. Query `audit_log` with pagination
5. Unit + integration test

#### Files
- **Create:** `apps/web/app/api/audit/route.ts`, test

#### Test gate
- **Integration:** tenant isolation + RBAC guard
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete route.

---

### T-00e-005 — Retention policy config + partition maintenance cron

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-e audit
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

> Per PRD §11 "Retention per tabela"

#### Dependencies
- **Upstream:** [T-00e-001, T-00f-003]
- **Downstream:** none
- **Parallel:** [T-00e-004]

#### GIVEN / WHEN / THEN
**GIVEN** audit table is partitioned by month
**WHEN** the monthly maintenance cron runs
**THEN** future partition pre-created, partitions older than config (default 7y) detached (not dropped)

#### Implementation
1. Author `packages/db/scripts/partition-maintenance.ts`
2. Config table `audit_retention_config(entity_type, retain_months)`
3. Schedule via pg-boss cron
4. Integration test with time-travel
5. Commit

#### Files
- **Create:** `packages/db/scripts/partition-maintenance.ts`, `drizzle/migrations/009-audit-retention.sql`

#### Test gate
- **Integration:** `vitest partition-maintenance.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Disable cron.

---

## §6 — Sub-module 00-f — Outbox pattern runtime (6 tasks)

### T-00f-001 — Migration `010-outbox-events.sql` + DLQ table

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-f outbox
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-000]
- **Downstream:** [T-00f-002]
- **Parallel:** [T-00e-001]

#### GIVEN / WHEN / THEN
**GIVEN** baseline migration applied
**WHEN** `010-outbox-events.sql` runs
**THEN** `outbox_events` table exists per PRD §10 (id BIGSERIAL, tenant_id, event_type, aggregate_type, aggregate_id, payload, created_at, consumed_at, app_version) + `outbox_dlq` for poisoned messages + partial index on unconsumed

#### Implementation
1. Author migration SQL
2. Index `(tenant_id, created_at) WHERE consumed_at IS NULL`
3. FK `event_type` via check constraint
4. Drizzle types
5. Integration smoke

#### Files
- **Create:** `drizzle/migrations/010-outbox-events.sql`

#### Test gate
- **Integration:** `vitest outbox-events.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
`DROP TABLE outbox_events, outbox_dlq`.

---

### T-00f-002 — `insertOutboxEvent` helper with UUID v7 transaction_id

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-f outbox
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00f-001, T-00b-E02]
- **Downstream:** [T-00f-003, T-00e-003]
- **Parallel:** [T-00f-004]

#### GIVEN / WHEN / THEN
**GIVEN** outbox migrations applied
**WHEN** `insertOutboxEvent(tx, { tenantId, eventType, aggregateType, aggregateId, payload, transactionId? })`
**THEN** row is inserted in same transaction; `transaction_id` UUID v7 (R14) is generated if absent; duplicate `transaction_id` is a no-op (idempotent)

#### Implementation
1. Author `packages/outbox/insert-event.ts`
2. UUID v7 helper (`uuid@>=10`)
3. Zod input schema
4. Unit + integration (idempotency)
5. Export

#### Files
- **Create:** `packages/outbox/insert-event.ts`, test

#### Test gate
- **Integration:** idempotent on replay
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete file.

---

### T-00f-003 — pg-boss worker config + queue registration

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-f outbox
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

> D9: pg-boss (Postgres-backed)

#### Dependencies
- **Upstream:** [T-00f-001]
- **Downstream:** [T-00f-005]
- **Parallel:** [T-00f-004]

#### GIVEN / WHEN / THEN
**GIVEN** outbox table exists
**WHEN** a worker process `pnpm worker` starts
**THEN** pg-boss polls `outbox_events WHERE consumed_at IS NULL`, dispatches by `event_type`, marks consumed on success, applies retry schedule 5/30/120/720/1440 min, moves to `outbox_dlq` after 5 failures

#### Implementation
1. Install pg-boss
2. Author `packages/outbox/worker.ts` with `boss.work(eventType, handler)`
3. Handler registry pattern
4. Retry + DLQ policy
5. Integration test: 3 success + 1 poison → DLQ

#### Files
- **Create:** `packages/outbox/worker.ts`, `apps/worker/index.ts`, test

#### Test gate
- **Integration:** `vitest outbox-worker.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Stop worker; clear pg-boss schema.

---

### T-00f-004 — Outbox retry policy config table + backoff formula

**Type:** T1-schema
**Context budget:** ~30k tokens
**Est time:** 35 min
**Parent feature:** 00-f outbox
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00f-001]
- **Downstream:** [T-00f-003]
- **Parallel:** [T-00f-002]

#### GIVEN / WHEN / THEN
**GIVEN** outbox + DLQ tables exist
**WHEN** migration adds `outbox_retry_policy(event_type, max_attempts, backoff_schedule[])`
**THEN** pg-boss worker reads policy row; default policy inserted for every entry of `events.enum.ts`

#### Implementation
1. Author migration `011-outbox-retry.sql`
2. Seed default policy per event type
3. Integration test
4. Drizzle types
5. Commit

#### Files
- **Create:** `drizzle/migrations/011-outbox-retry.sql`

#### Test gate
- **Integration:** defaults inserted; FK respected
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Drop table.

---

### T-00f-005 — Outbox healthcheck endpoint + release gate

**Type:** T2-api
**Context budget:** ~30k tokens
**Est time:** 30 min
**Parent feature:** 00-f outbox
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00f-003]
- **Downstream:** [T-00i-008]
- **Parallel:** [T-00f-006]

#### GIVEN / WHEN / THEN
**GIVEN** pg-boss worker is running
**WHEN** `/api/health/outbox` is called
**THEN** returns 200 iff queue backlog < threshold AND last consumed within 60s

#### Implementation
1. Author `apps/web/app/api/health/outbox/route.ts`
2. Query backlog + last consumed
3. Threshold config via env
4. Unit test
5. Deploy doc

#### Files
- **Create:** `apps/web/app/api/health/outbox/route.ts`, test

#### Test gate
- **Unit:** returns 503 when no worker; 200 when healthy
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete route.

---

### T-00f-006 — Integration test: emit → worker → consumed + DLQ path

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-f outbox
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00f-002, T-00f-003, T-00f-004]
- **Downstream:** none
- **Parallel:** [T-00d-004]

#### GIVEN / WHEN / THEN
**GIVEN** seeded DB + worker running in-test
**WHEN** 10 events emitted (8 handled, 2 poisoned)
**THEN** 8 marked consumed; 2 in `outbox_dlq` after 5 retries; idempotent replay is a no-op

#### Implementation
1. Author `tests/outbox/pipeline.integration.test.ts`
2. Use pg-boss test harness
3. Assert counts + timing
4. Replay test
5. Commit

#### Files
- **Create:** `tests/outbox/pipeline.integration.test.ts`

#### Test gate
- **Integration:** green
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove test.

---

## §7 — Sub-module 00-g — Rule engine DSL runtime (7 tasks)

> Scope: runtime only, admin UI deferred to E-2.

### T-00g-001 — Migration `012-reference-rules.sql` (rules catalog)

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-g rule engine
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-000]
- **Downstream:** [T-00g-002]
- **Parallel:** [T-00h-001]

#### GIVEN / WHEN / THEN
**GIVEN** baseline applied
**WHEN** migration runs
**THEN** `reference_rules` table exists with `(tenant_id, rule_id, rule_type IN ('cascading','conditional_required','gate','workflow'), definition_json JSONB, version INT, active_from, active_to)` + unique index

#### Implementation
1. Author migration
2. CHECK constraint on `rule_type`
3. JSONB GIN index on `definition_json`
4. Drizzle types
5. Integration smoke

#### Files
- **Create:** `drizzle/migrations/012-reference-rules.sql`

#### Test gate
- **Integration:** schema + constraints
- **CI gate:** `pnpm test:smoke` green

#### Rollback
`DROP TABLE reference_rules`.

---

### T-00g-002 — DSL interpreter: cascading rule type

**Type:** T2-api
**Context budget:** ~60k tokens
**Est time:** 75 min
**Parent feature:** 00-g rule engine
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00g-001]
- **Downstream:** [T-00g-005, T-00g-006]
- **Parallel:** [T-00g-003, T-00g-004]

#### GIVEN / WHEN / THEN
**GIVEN** a `reference_rules` row of type `cascading`
**WHEN** `evaluate(rule, input)` runs
**THEN** returns downstream field values deterministically, pure function, no DB writes

#### Implementation
1. Author `packages/rule-engine/types.ts`
2. `packages/rule-engine/interpreters/cascading.ts`
3. Pure function + Zod validation
4. Unit tests for canonical cases
5. Export via `packages/rule-engine/index.ts`

#### Files
- **Create:** `packages/rule-engine/*`

#### Test gate
- **Unit:** ≥5 canonical cascade cases
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete interpreter file.

---

### T-00g-003 — DSL interpreter: conditional-required rule type

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-g rule engine
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00g-001]
- **Downstream:** [T-00g-005]
- **Parallel:** [T-00g-002, T-00g-004]

#### GIVEN / WHEN / THEN
**GIVEN** a `conditional_required` rule (e.g., catch-weight → require tare+gross)
**WHEN** `evaluate(rule, input)`
**THEN** returns list of required field names based on predicate match

#### Implementation
1. Author `interpreters/conditional-required.ts`
2. Predicate primitives (`EQUALS`, `CONTAINS_ANY`, `GT`, `LT`, `IN`)
3. Unit tests
4. Document
5. Commit

#### Files
- **Create:** `packages/rule-engine/interpreters/conditional-required.ts`

#### Test gate
- **Unit:** ≥5 cases
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete file.

---

### T-00g-004 — DSL interpreter: gate rule type

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 70 min
**Parent feature:** 00-g rule engine
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00g-001]
- **Downstream:** [T-00g-005]
- **Parallel:** [T-00g-002, T-00g-003]

#### GIVEN / WHEN / THEN
**GIVEN** a `gate` rule (e.g., allergen changeover gate per PRD §7)
**WHEN** `evaluate(rule, context)`
**THEN** returns `{ ok: boolean, missing_actions: [...], notify: [...] }`; pure function

#### Implementation
1. Author `interpreters/gate.ts`
2. Implement `triggers`, `conditions`, `actions`, `on_fail`
3. Unit tests using the allergen changeover example
4. Error surface
5. Commit

#### Files
- **Create:** `packages/rule-engine/interpreters/gate.ts`

#### Test gate
- **Unit:** the PRD §7 example passes
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete file.

---

### T-00g-005 — Rule registry loader + LRU cache per schema_version

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 50 min
**Parent feature:** 00-g rule engine
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00g-002, T-00g-003, T-00g-004]
- **Downstream:** [T-00g-006]
- **Parallel:** [T-00h-002]

#### GIVEN / WHEN / THEN
**GIVEN** `reference_rules` populated
**WHEN** `loadRules(tenantId)` is called
**THEN** returns interpreter-ready rule set, cached in LRU keyed by `(tenant_id, schema_version)`

#### Implementation
1. Author `packages/rule-engine/loader.ts`
2. LRU cache (lru-cache npm)
3. Invalidation on `schema_version` bump
4. Unit + integration test
5. Commit

#### Files
- **Create:** `packages/rule-engine/loader.ts`

#### Test gate
- **Integration:** cache hit/miss behaviour
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete file.

---

### T-00g-006 — Dry-run harness (`POST /api/rules/dry-run`)

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 50 min
**Parent feature:** 00-g rule engine
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00g-005, T-00b-E01]
- **Downstream:** none
- **Parallel:** [T-00g-007]

#### GIVEN / WHEN / THEN
**GIVEN** loader + interpreters live
**WHEN** POST to `/api/rules/dry-run` with `{ rule_id, sample_input }`, RBAC `ref.edit`
**THEN** returns evaluation result JSON with trace — no DB writes

#### Implementation
1. Author route handler
2. Zod parse
3. Call loader + interpreter
4. Return trace
5. Unit test

#### Files
- **Create:** `apps/web/app/api/rules/dry-run/route.ts`, test

#### Test gate
- **Unit + Integration:** trace shape stable
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete route.

---

### T-00g-007 — `reference_rules` seed helper + snapshot updater

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-g rule engine
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00g-001, T-00b-004]
- **Downstream:** none
- **Parallel:** [T-00g-006]

#### GIVEN / WHEN / THEN
**GIVEN** rule table exists
**WHEN** seed `forza-baseline` applies rule snapshot
**THEN** 3 canonical rules are present: `fefo_pick_v1` (cascading), `catch_weight_required_v1` (conditional), `allergen_changeover_gate_v1` (gate)

#### Implementation
1. Author `packages/db/seed/rules.ts`
2. JSON definitions inline (PRD §7)
3. Wire into `forza-baseline` snapshot
4. Integration test
5. Commit

#### Files
- **Create:** `packages/db/seed/rules.ts`
- **Modify:** `packages/db/seed/snapshots/forza-baseline.ts`

#### Test gate
- **Integration:** seed applies + rules load
- **CI gate:** `pnpm test:smoke` green

#### Rollback
`DELETE FROM reference_rules WHERE …`.

---

## T-00g-008 — DSL interpreter: workflow-as-data rule type

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-g-04-workflow-as-data
**Agent:** backend-specialist
**Status:** pending

### Dependencies
- **Upstream (must be done first):** [T-00g-001] (rule engine schema + registry)
- **Downstream (will consume this):** [T-02SETa tasks using rule engine]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** Rule engine registry is live (T-00g-001 done), 3 of 4 rule type interpreters implemented (schema, validation, cascade); `workflow_rules` table exists with `rule_type = 'workflow'` entries
**WHEN** Rule engine evaluates a rule with `rule_type = 'workflow'` (e.g., state machine transition guard)
**THEN** `evaluateRule(ruleId, context)` returns correct `{allowed: boolean, next_state: string | null}` result; dry-run mode logs evaluation trace without side effects; unknown workflow step returns structured error, not throw

### Implementation (max 5 sub-steps)
1. Add `WorkflowRuleInterpreter` class to `lib/rule-engine/interpreters/workflow.ts` implementing `RuleInterpreter` interface — input: `{current_state, event, context}`; output: `{allowed, next_state, trace}`
2. Register interpreter in `lib/rule-engine/registry.ts` under key `'workflow'` alongside existing 3 types
3. Add dry-run mode: if `options.dryRun === true`, skip side-effect emits, append trace entry `{step, result, timestamp}` to returned trace array
4. Write unit tests in `lib/rule-engine/interpreters/workflow.test.ts` covering: valid transition, blocked transition, unknown state, dry-run trace output
5. Add integration test: seed 1 workflow rule in `workflow_rules` table → call `evaluateRule` → assert correct `next_state` returned

### Files
- **Create:** `lib/rule-engine/interpreters/workflow.ts`, `lib/rule-engine/interpreters/workflow.test.ts`
- **Modify:** `lib/rule-engine/registry.ts` (register WorkflowRuleInterpreter), `lib/rule-engine/types.ts` (add WorkflowRuleResult type if not present)

### Test gate
- **Unit:** `vitest lib/rule-engine/interpreters/workflow.test.ts` — covers: valid/blocked transition, unknown state, dry-run trace
- **Integration:** `vitest lib/rule-engine/interpreters/workflow.integration.test.ts` — covers: seeded rule evaluated against real DB row
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert` the commit adding workflow.ts + registry registration; existing 3 interpreters unaffected

---

## §8 — Sub-module 00-h — Schema-driven engine runtime (5 tasks)

> Runtime only. Admin wizard UI → E-2.

### T-00h-001 — Migration `013-reference-dept-columns.sql` + schema_migrations

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 55 min
**Parent feature:** 00-h schema-driven
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-000, T-00b-E03]
- **Downstream:** [T-00h-002, T-00h-003, T-00h-004]
- **Parallel:** [T-00g-001]

#### GIVEN / WHEN / THEN
**GIVEN** baseline applied
**WHEN** migration runs
**THEN** `Reference.DeptColumns` exists + `schema_migrations` audit + `main_table` placeholder with `ext_jsonb JSONB` + `private_jsonb JSONB` + GIN index on `ext_jsonb`

#### Implementation
1. Author migration
2. CHECK constraint on `field_type` enum
3. GIN index on `ext_jsonb`
4. Drizzle types
5. Integration test

#### Files
- **Create:** `drizzle/migrations/013-reference-dept-columns.sql`

#### Test gate
- **Integration:** schema shape + GIN index
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Drop tables.

---

### T-00h-002 — JSON-Schema → Zod runtime compiler

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 60 min
**Parent feature:** 00-h schema-driven
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00h-001]
- **Downstream:** [T-00h-003, T-00h-004]
- **Parallel:** [T-00g-005]

#### GIVEN / WHEN / THEN
**GIVEN** `Reference.DeptColumns` rows exist
**WHEN** `compileZod(tenantId, deptCode)` is called
**THEN** returns a Zod schema derived from metadata, cached LRU per `schema_version`, ready for RHF resolver

#### Implementation
1. Author `packages/schema-driven/compile-zod.ts`
2. Use `json-schema-to-zod` + custom mappers
3. LRU cache
4. Unit tests across all field types
5. Export

#### Files
- **Create:** `packages/schema-driven/*`

#### Test gate
- **Unit:** covers each field_type
- **Integration:** hits DB + cache
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete package.

---

### T-00h-003 — `ext_jsonb` read/write helpers + expression indexes

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-h schema-driven
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00h-001]
- **Downstream:** [T-00h-005]
- **Parallel:** [T-00h-002]

#### GIVEN / WHEN / THEN
**GIVEN** main_table has `ext_jsonb`
**WHEN** `readExt(row, key)` / `writeExt(row, key, value)` run
**THEN** typed access helpers enforce shape via compiled Zod; expression index created for frequently-queried L3 cols

#### Implementation
1. Author `packages/schema-driven/ext-jsonb.ts`
2. Migration `014-ext-jsonb-indexes.sql` (sample expression index)
3. Unit tests
4. Document pattern
5. Commit

#### Files
- **Create:** `packages/schema-driven/ext-jsonb.ts`, `drizzle/migrations/014-ext-jsonb-indexes.sql`

#### Test gate
- **Unit + Integration:** type-safe access, query hits index
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Drop expression index.

---

### T-00h-004 — `schema_version` bump + idempotent add-column helper

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 45 min
**Parent feature:** 00-h schema-driven
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00h-001]
- **Downstream:** [T-00h-005]
- **Parallel:** [T-00h-003]

#### GIVEN / WHEN / THEN
**GIVEN** a new DeptColumns row is inserted
**WHEN** `addColumn(defn)` runs
**THEN** migration record appended, `schema_version` bumped (tenant-scoped), migration idempotent, cache invalidated

#### Implementation
1. Author `packages/schema-driven/add-column.ts`
2. Transactional: insert + bump version + log migration
3. Hook cache invalidation
4. Integration test: add → re-compile → row validates
5. Commit

#### Files
- **Create:** `packages/schema-driven/add-column.ts`

#### Test gate
- **Integration:** end-to-end add → compile → validate
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Revert migration row manually.

---

### T-00h-005 — Integration test: metadata change → Zod runtime picks up

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-h schema-driven
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00h-003, T-00h-004]
- **Downstream:** none
- **Parallel:** [T-00f-006]

#### GIVEN / WHEN / THEN
**GIVEN** main_table + DeptColumns seeded
**WHEN** test adds new L3 column "custom_flag", validates payloads before/after
**THEN** pre-add payload rejects unknown field, post-add payload accepts; `schema_version` distinct

#### Implementation
1. Author `tests/schema-driven/metadata-live.integration.test.ts`
2. Use `addColumn` + `compileZod`
3. Assert pre/post behaviour
4. CI gate step
5. Commit

#### Files
- **Create:** `tests/schema-driven/metadata-live.integration.test.ts`

#### Test gate
- **Integration:** green
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove test.

---

## §9 — Sub-module 00-i — Testing + CI + Observability (10 tasks)

### T-00i-001 — Vitest workspace harness + coverage config

**Type:** T4-wiring+test
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-i testing
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00a-004]
- **Downstream:** every test-gated task
- **Parallel:** [T-00i-005]

#### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** `pnpm test:unit` runs
**THEN** Vitest resolves workspace globs, coverage reporter v8 emits `coverage/` at ≥85% target, RTL works

#### Implementation
1. Author root `vitest.workspace.ts`
2. Install vitest, coverage-v8, RTL
3. Turbo pipeline `test:unit`
4. Tiny sample test
5. Commit

#### Files
- **Create:** `vitest.workspace.ts`, `vitest.config.ts` per workspace

#### Test gate
- **CI gate:** `pnpm test:unit` green + coverage report

#### Rollback
Remove config.

---

### T-00i-002 — GitHub Actions workflow (matrix: lint, typecheck, unit, integration, e2e)

**Type:** T4-wiring+test
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-i testing
**Agent routing:** any
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00i-001, T-00i-003, T-00i-005]
- **Downstream:** none
- **Parallel:** [T-00i-004]

#### GIVEN / WHEN / THEN
**GIVEN** all test harnesses exist
**WHEN** a PR is pushed
**THEN** `.github/workflows/ci.yml` runs 5 jobs in matrix; failure blocks merge; artifacts uploaded for E2E traces

#### Implementation
1. Author `.github/workflows/ci.yml`
2. 5 jobs (lint, typecheck, unit, integration, e2e)
3. Supabase local via Docker service
4. Artifact upload on E2E fail
5. Branch protection rule

#### Files
- **Create:** `.github/workflows/ci.yml`

#### Test gate
- Observed green on dummy PR
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Disable workflow.

---

### T-00i-003 — Integration test harness (Supabase local + `db:reset` per test)

**Type:** T4-wiring+test
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-i testing
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-001, T-00b-003, T-00i-001]
- **Downstream:** every integration test
- **Parallel:** [T-00i-005]

#### GIVEN / WHEN / THEN
**GIVEN** Supabase local + migrations exist
**WHEN** an integration test file runs
**THEN** global setup resets DB via `supabase db reset`, applies seed snapshot, exposes `app_role` connection

#### Implementation
1. Author `tests/setup/integration-setup.ts`
2. Wire into vitest config via `setupFiles`
3. Utility `withTenant(orgId, fn)`
4. Smoke test under app_role
5. Commit

#### Files
- **Create:** `tests/setup/integration-setup.ts`

#### Test gate
- **Integration:** smoke test passes
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove setup.

---

### T-00i-004 — Seed fixture library (Forza baseline + synthetic multi-tenant)

**Type:** T5-seed
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-i testing
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

#### Dependencies
- **Upstream:** [T-00b-004]
- **Downstream:** [T-00d-004, T-00f-006, T-00h-005]
- **Parallel:** [T-00i-002]

#### GIVEN / WHEN / THEN
**GIVEN** seed runner + named snapshots
**WHEN** `applySnapshot('multi-tenant-3')`
**THEN** 3 tenants with disjoint users/roles, 2 shared role kinds, deterministic UUIDs

#### Implementation
1. Extend `multi-tenant-3.ts` with deterministic UUIDs
2. Factory functions
3. Test util `seedAndConnect`
4. Unit test for determinism
5. Commit

#### Files
- **Modify:** `packages/db/seed/snapshots/multi-tenant-3.ts`, `tests/utils/seed.ts`

#### Test gate
- **Unit:** deterministic output
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove factories.

---

### T-00i-005 — Playwright harness + auth fixture

**Type:** T4-wiring+test
**Context budget:** ~50k tokens
**Est time:** 55 min
**Parent feature:** 00-i testing
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00a-002, T-00i-001]
- **Downstream:** [T-00c-006, every E2E]
- **Parallel:** [T-00i-003]

#### GIVEN / WHEN / THEN
**GIVEN** Next.js app boots
**WHEN** `pnpm test:e2e` runs
**THEN** Playwright resolves projects, uses shared auth fixture (storageState), produces HTML report

#### Implementation
1. `pnpm create playwright` scoped to `e2e/`
2. Auth fixture `e2e/fixtures/auth.ts`
3. `playwright.config.ts` with reporter + baseURL + webServer
4. Tiny smoke spec
5. Commit

#### Files
- **Create:** `playwright.config.ts`, `e2e/fixtures/auth.ts`, `e2e/smoke.spec.ts`

#### Test gate
- **E2E:** smoke passes
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove Playwright install.

---

### T-00i-006 — Sentry init (web + worker) + source maps upload

**Type:** T4-wiring+test
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-i observability
**Agent routing:** backend-specialist
**Track:** δ
**Status:** pending

> `[infra/monitoring]`

#### Dependencies
- **Upstream:** [T-00a-007]
- **Downstream:** [T-00i-008]
- **Parallel:** [T-00i-007]

#### GIVEN / WHEN / THEN
**GIVEN** Sentry DSN in env
**WHEN** the app starts
**THEN** `@sentry/nextjs` captures errors with release tag + source maps; worker uses `@sentry/node`

#### Implementation
1. Install `@sentry/nextjs`, `@sentry/node`
2. Init instrumentation files
3. Source-map upload in CI
4. Test via deliberate throw
5. Commit

#### Files
- **Create:** `apps/web/instrumentation.ts`, `apps/web/sentry.client.config.ts`, `apps/worker/sentry.ts`

#### Test gate
- Manual smoke (error visible in Sentry UI)
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove Sentry init files.

---

### T-00i-007 — PostHog self-host skeleton + feature-flag client singleton

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-i observability
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00a-007]
- **Downstream:** none
- **Parallel:** [T-00i-006]

#### GIVEN / WHEN / THEN
**GIVEN** PostHog self-host URL + key in env
**WHEN** `flag('npd.brief_v2')` is called
**THEN** returns boolean, scoped to `tenant_id` + `user_id`; fallback to `false` on outage

#### Implementation
1. Install `posthog-node` + `posthog-js`
2. Server singleton `packages/flags/server.ts`
3. Client hook `packages/flags/use-flag.ts`
4. Unit test with mock network
5. Document sample flag seed

#### Files
- **Create:** `packages/flags/*`

#### Test gate
- **Unit:** fallback on outage
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove package.

---

### T-00i-008 — Vercel preview deploys + deploy gates

**Type:** T4-wiring+test
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-i observability
**Agent routing:** any
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00i-002, T-00f-005, T-00i-006]
- **Downstream:** none
- **Parallel:** [T-00i-009]

#### GIVEN / WHEN / THEN
**GIVEN** Vercel project linked
**WHEN** a PR opens
**THEN** Vercel builds preview deploy; post-deploy job hits `/api/health/outbox` + returns metrics; fail → PR status red

#### Implementation
1. Connect Vercel project via CLI
2. `vercel.json` config
3. GitHub Action polls preview URL health
4. Preview cleanup cron
5. Document

#### Files
- **Create:** `vercel.json`, `.github/workflows/preview-cleanup.yml`

#### Test gate
- Observed green preview on dummy PR
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Disable Vercel integration.

---

### T-00i-009 — Accessibility baseline via `@axe-core/playwright`

**Type:** T4-wiring+test
**Context budget:** ~35k tokens
**Est time:** 35 min
**Parent feature:** 00-i testing
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

#### Dependencies
- **Upstream:** [T-00i-005]
- **Downstream:** every future UI sub-module
- **Parallel:** [T-00i-008]

#### GIVEN / WHEN / THEN
**GIVEN** Playwright + login page
**WHEN** `pnpm test:a11y` runs
**THEN** axe-core sweeps `/login`, 0 critical violations; CI gate fails on critical

#### Implementation
1. Install `@axe-core/playwright`
2. Author `e2e/a11y/login.spec.ts`
3. Add `test:a11y` script
4. CI job
5. Commit

#### Files
- **Create:** `e2e/a11y/login.spec.ts`

#### Test gate
- **E2E:** no critical violations
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Remove spec.

---

### T-00i-010 — `/api/health` composite healthcheck + readiness probe

**Type:** T2-api
**Context budget:** ~30k tokens
**Est time:** 30 min
**Parent feature:** 00-i observability
**Agent routing:** backend-specialist
**Track:** β
**Status:** pending

#### Dependencies
- **Upstream:** [T-00f-005, T-00b-002]
- **Downstream:** none
- **Parallel:** [T-00i-009]

#### GIVEN / WHEN / THEN
**GIVEN** DB + outbox + Sentry are wired
**WHEN** `GET /api/health`
**THEN** returns `{ db: 'ok', outbox: 'ok'|'degraded', sentry: 'ok', app_version, git_sha }` in <200ms

#### Implementation
1. Author route
2. Parallelize 3 sub-probes
3. Return worst-of tri-state
4. Unit test with mocks
5. Commit

#### Files
- **Create:** `apps/web/app/api/health/route.ts`

#### Test gate
- **Unit:** returns expected shape
- **CI gate:** `pnpm test:smoke` green

#### Rollback
Delete route.

---

## §10 — Governance + docs (12 tasks, ported from existing 47)

### T-GOV-001 — Publish ADR-028 Schema-driven column definition

**Type:** docs
**Context budget:** ~20k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** none
- **Downstream:** [T-GOV-005]

#### Done check
- Final output path: `docs/adr/ADR-028-schema-driven-column-definition.md`
- Outline: Context, Decision, Reference.DeptColumns/FieldTypes/Formulas metadata, forms/validators/views generation, open item hard-lock flag
- Verifiable: another engineer can implement the runtime engine from this ADR alone

---

### T-GOV-002 — Publish ADR-029 Rule engine DSL + workflow-as-data

**Type:** docs
**Context budget:** ~20k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** none
- **Downstream:** [T-GOV-005]

#### Done check
- Final output path: `docs/adr/ADR-029-rule-engine-dsl-workflow-as-data.md`
- Outline: 4 rule types (cascading/conditional/gate/workflow), JSON runtime, Mermaid docs, wizard plans
- Verifiable: another engineer can implement interpreters from this ADR

---

### T-GOV-003 — Publish ADR-030 Configurable department taxonomy

**Type:** docs
**Context budget:** ~20k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** none
- **Downstream:** [T-GOV-005]

#### Done check
- Final output path: `docs/adr/ADR-030-configurable-department-taxonomy.md`
- Outline: Forza 7-dept baseline, split/merge/custom via tenant.dept_overrides JSONB, runtime resolution
- Verifiable: seed + override round-trip described unambiguously

---

### T-GOV-004 — Publish ADR-031 Schema variation per org L1-L4

**Type:** docs
**Context budget:** ~20k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** none
- **Downstream:** [T-GOV-005]

#### Done check
- Final output path: `docs/adr/ADR-031-schema-variation-per-org-L1-L4.md`
- Outline: L1 core / L2 org config / L3 ext_jsonb / L4 private_jsonb, canary upgrade orchestration
- Verifiable: another engineer can classify any new column into L1-L4

---

### T-GOV-005 — Marker discipline reference doc

**Type:** docs
**Context budget:** ~15k tokens
**Est time:** 45 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/readme]`

#### Dependencies
- **Upstream:** [T-GOV-001, T-GOV-002, T-GOV-003, T-GOV-004]
- **Downstream:** [T-GOV-006]

#### Done check
- Final output path: `docs/MARKER-DISCIPLINE.md`
- Outline: [UNIVERSAL] / [FORZA-CONFIG] / [EVOLVING] / [LEGACY-D365] with canonical examples from PRD §2
- Verifiable: pick any PRD/ADR section, classify correctly in <60s

---

### T-GOV-006 — Marker discipline lint check

**Type:** T4-wiring+test
**Context budget:** ~25k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent routing:** any
**Track:** δ
**Status:** pending

> `[infra/lint]`

#### Dependencies
- **Upstream:** [T-GOV-005, T-00a-006]
- **Downstream:** none

#### GIVEN / WHEN / THEN
**GIVEN** marker discipline reference doc exists
**WHEN** a pre-commit or CI run evaluates modified PRD/ADR/skill files
**THEN** sections describing business behaviour without one of the 4 markers are rejected with a pointer to MARKER-DISCIPLINE.md

#### Implementation
1. Author `scripts/lint-markers.ts`
2. Regex scan for "business behaviour" section shapes
3. Wire into `.husky/pre-commit` + CI
4. Test with fixtures (valid + invalid)
5. Commit

#### Files
- **Create:** `scripts/lint-markers.ts`, `scripts/lint-markers.test.ts`
- **Modify:** `.husky/pre-commit`, `.github/workflows/ci.yml`

#### Test gate
- **Unit:** fixtures pass/fail as expected
- **CI gate:** marker lint job green

#### Rollback
Disable step.

---

### T-GOV-007 — Personas and module map reference docs

**Type:** docs
**Context budget:** ~18k tokens
**Est time:** 45 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/readme]`

#### Dependencies
- **Upstream:** none
- **Downstream:** [T-GOV-008, T-GOV-009]

#### Done check
- Final output path: `docs/PERSONAS.md`, `docs/MODULE-MAP.md`
- Outline: reproduces PRD §3 + §4 (writing phases, build order, 15-module table, INTEGRATIONS stages)
- Verifiable: every module referenced in code has a row

---

### T-GOV-008 — Regulatory roadmap artifact (FSMA/EUDR/Peppol/ViDA/BRCGS/FIC/KSeF)

**Type:** docs
**Context budget:** ~25k tokens
**Est time:** 90 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/regulatory]`

#### Dependencies
- **Upstream:** [T-GOV-007]
- **Downstream:** none

#### Done check
- Final output path: `docs/regulatory/*.md` (one file per regulation)
- Outline: deadlines, impacted modules, quarterly review cadence, owner
- Verifiable: each row maps to a tracked open item

---

### T-GOV-009 — Out-of-scope policy doc

**Type:** docs
**Context budget:** ~15k tokens
**Est time:** 45 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/user-guide]`

#### Dependencies
- **Upstream:** [T-GOV-007]
- **Downstream:** none

#### Done check
- Final output path: `docs/OUT-OF-SCOPE.md`
- Outline: GL/AP/AR, HR, CRM, on-prem, blockchain, autonomous LLM (7 items) + use-instead pointers per PRD §11 [R8]
- Verifiable: each item has an alternative tool or workflow named

---

### T-GOV-010 — Build posture + DR policy doc

**Type:** docs
**Context budget:** ~18k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/user-guide]`

#### Dependencies
- **Upstream:** [T-GOV-006, T-00a-006b, T-00i-002, T-00b-005]
- **Downstream:** none

#### Done check
- Final output path: `docs/BUILD-POSTURE.md`
- Outline: no-DDL-in-request-path, app-role tests, index audit, drift detection, 40k PR cap, quarterly DR runbook per PRD §11/§13
- Verifiable: every invariant has a CI/gate reference

---

### T-GOV-011 — Pre-Phase-D ADR review tracker (ADR-001..019)

**Type:** docs
**Context budget:** ~18k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-001, T-GOV-002, T-GOV-003, T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/_review/pre-phase-d-audit.md`
- Outline: table flagging ADR-002/003/006/008/013 collisions, verdict TBD with owner + phase
- Verifiable: every ADR-001..019 has a row

---

### T-GOV-012 — Open items register (Phase D carry-forward + research + new)

**Type:** docs
**Context budget:** ~18k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/user-guide]`

#### Dependencies
- **Upstream:** [T-GOV-011]
- **Downstream:** none

#### Done check
- Final output path: `docs/conventions/OPEN-ITEMS.md`
- Outline: enumerates all 16 PRD §14 items with phase owners, status, review cadence
- Verifiable: every open item cross-linked to a task or ADR

---

## §11 — T-43 ADR stubs R1-R15 (15 atomic docs tasks)

Each stub lives at `docs/adr/candidates/ADR-R<N>-<slug>.md` with: Title, Marker, Source PRD section, Open questions, Deferral note ("will be promoted to ADR-NNN when module lands").

### T-ADR-R01 — Candidate ADR stub R1 (EPCIS 2.0 / GS1 Digital Link)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R01-epcis-gs1-digital-link.md`
- Outline: Title, Marker, Source PRD §12 #R1, Open questions, Deferral note
- Verifiable: matches template

---

### T-ADR-R02 — Candidate ADR stub R2 (Main Table 69 typed columns)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R02-main-table-69-cols.md`
- Outline: Title, Marker, Source PRD §12 #R2, Open questions, Deferral note
- Verifiable: matches template

---

### T-ADR-R03 — Candidate ADR stub R3 (RLS LEAKPROOF SECURITY DEFINER)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R03-rls-leakproof-definer.md`
- Outline: Title, Marker, Source PRD §12 #R3, Open questions, Deferral note

---

### T-ADR-R04 — Candidate ADR stub R4 (Zod runtime from DeptColumns)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R04-zod-runtime-deptcolumns.md`
- Outline: Title, Marker, Source PRD §12 #R4, Open questions, Deferral note

---

### T-ADR-R05 — Candidate ADR stub R5 (PWA + IndexedDB sync queue)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R05-pwa-indexeddb-sync.md`
- Outline: Title, Marker, Source PRD §12 #R5, Open questions, Deferral note

---

### T-ADR-R06 — Candidate ADR stub R6 (PostHog self-host feature flags)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R06-posthog-flags.md`
- Outline: Title, Marker, Source PRD §12 #R6, Open questions, Deferral note

---

### T-ADR-R07 — Candidate ADR stub R7 (Data residency EU cluster)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R07-data-residency-eu.md`
- Outline: Title, Marker, Source PRD §12 #R7, Open questions, Deferral note

---

### T-ADR-R08 — Candidate ADR stub R8 (D365 adapter pull/push contracts)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R08-d365-adapter-contracts.md`
- Outline: Title, Marker, Source PRD §12 #R8, Open questions, Deferral note

---

### T-ADR-R09 — Candidate ADR stub R9 (Outbox + DLQ orchestration)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R09-outbox-dlq.md`
- Outline: Title, Marker, Source PRD §12 #R9, Open questions, Deferral note

---

### T-ADR-R10 — Candidate ADR stub R10 (Audit append-only + retention)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R10-audit-append-only.md`
- Outline: Title, Marker, Source PRD §12 #R10, Open questions, Deferral note

---

### T-ADR-R11 — Candidate ADR stub R11 (i18n ICU pl/en/uk/ro)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R11-i18n-icu.md`
- Outline: Title, Marker, Source PRD §12 #R11, Open questions, Deferral note

---

### T-ADR-R12 — Candidate ADR stub R12 (Canary rollout orchestration)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R12-canary-rollout.md`
- Outline: Title, Marker, Source PRD §12 #R12, Open questions, Deferral note

---

### T-ADR-R13 — Candidate ADR stub R13 (R13 identity columns for AI/trace)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R13-identity-cols-ai-trace.md`
- Outline: Title, Marker, Source PRD §12 #R13, Open questions, Deferral note

---

### T-ADR-R14 — Candidate ADR stub R14 (UUID v7 transaction_id)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R14-uuid-v7-transaction-id.md`
- Outline: Title, Marker, Source PRD §12 #R14, Open questions, Deferral note

---

### T-ADR-R15 — Candidate ADR stub R15 (GS1-128 parser + AI identifiers)

**Type:** docs
**Context budget:** ~10k tokens
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent routing:** any
**Track:** γ
**Status:** pending

> `[docs/adr]`

#### Dependencies
- **Upstream:** [T-GOV-004]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/adr/candidates/ADR-R15-gs1-128-parser.md`
- Outline: Title, Marker, Source PRD §12 #R15, Open questions, Deferral note

---

## §12 — Gap-fills (6 new atomic tasks from user decisions)

### T-00b-M01 — Main Table migration (69 typed Forza cols + ext/private JSONB + schema_version)

**Type:** T1-schema
**Context budget:** ~55k tokens
**Est time:** 90 min
**Parent feature:** 00-b db scaffold (gap-fill per Decision #1)
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

> `[data/migration]` — ported from existing T-21; Forza baseline per 00-FOUNDATION-PRD.md and MAIN-TABLE-SCHEMA.md. Expect churn.

#### Dependencies
- **Upstream:** [T-00b-000, T-00h-001]
- **Downstream:** [T-00d-002, T-00e-002, T-00i-011]
- **Parallel:** [T-00f-001, T-00g-001]

#### GIVEN / WHEN / THEN
**GIVEN** baseline + DeptColumns migrations applied
**WHEN** migration `015-main-table-69-cols.sql` runs
**THEN** `main_table` has 69 typed Forza columns per MAIN-TABLE-SCHEMA.md, plus `ext_jsonb JSONB`, `private_jsonb JSONB`, `schema_version INT NOT NULL DEFAULT 1`, composite index `(tenant_id, created_at)`, GIN index on `ext_jsonb` (R2)

#### Implementation
1. Translate MAIN-TABLE-SCHEMA.md columns into Drizzle schema
2. Author migration `015-main-table-69-cols.sql`
3. Composite index + GIN index
4. Integration test: `\d+ main_table` has 69 typed cols + 2 JSONB + schema_version
5. Commit

#### Files
- **Create:** `drizzle/migrations/015-main-table-69-cols.sql`, `packages/db/schema/main-table.ts`

#### Test gate
- **Integration:** `vitest main-table-69.integration.test.ts` — column count, types, indexes
- **CI gate:** `pnpm test:migrations` green

#### Rollback
`DROP TABLE main_table CASCADE` (replace with placeholder).

---

### T-00a-008 — PWA scaffold (manifest + service worker)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~40k tokens
**Est time:** 60 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #3)
**Agent routing:** frontend-specialist
**Track:** γ
**Status:** pending

> `[ui/pwa]` — ported from existing T-11 (split).

#### Dependencies
- **Upstream:** [T-00a-002, T-00a-003]
- **Downstream:** [T-00a-009, T-00i-011]
- **Parallel:** [T-00a-006]

#### GIVEN / WHEN / THEN
**GIVEN** Next.js app boots
**WHEN** a browser visits `/` over HTTPS
**THEN** `manifest.webmanifest` is served, service worker registers, Lighthouse PWA audit passes baseline install criteria

#### Implementation
1. Install `next-pwa` (or equivalent)
2. Author `apps/web/public/manifest.webmanifest`
3. Service worker stub (no caching yet — queue-flusher is T-00a-009)
4. Icons + theme color
5. Lighthouse smoke test

#### Files
- **Create:** `apps/web/public/manifest.webmanifest`, `apps/web/public/sw.js` (or Next.js equivalent), icons
- **Modify:** `apps/web/app/layout.tsx` (link manifest)

#### Test gate
- **E2E:** Playwright asserts `navigator.serviceWorker.ready`
- **CI gate:** `pnpm --filter web build` green

#### Rollback
Remove manifest + SW registration.

---

### T-00a-009 — IndexedDB sync queue + offline queue flusher

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #3)
**Agent routing:** frontend-specialist
**Track:** β
**Status:** pending

> `[infra/pwa]` — FIFO sync queue supporting UUID v7 transaction_id replay per R5/R14.

#### Dependencies
- **Upstream:** [T-00a-008, T-00f-002]
- **Downstream:** [T-00i-011]
- **Parallel:** [T-00f-003]

#### GIVEN / WHEN / THEN
**GIVEN** service worker is registered and outbox helper exists
**WHEN** the client is offline and performs N mutations, then reconnects
**THEN** IndexedDB FIFO queue replays mutations in order with their original UUID v7 `transaction_id`; server-side idempotency guarantees no duplicate effects

#### Implementation
1. Author `packages/pwa/indexeddb-queue.ts` using `idb` npm
2. Enqueue on fetch failure, flush on `online` event
3. Hook into Server Action fetch wrapper
4. Integration test with network-offline simulation (Playwright)
5. Commit

#### Files
- **Create:** `packages/pwa/indexeddb-queue.ts`, `apps/web/lib/pwa/fetch-with-queue.ts`, tests

#### Test gate
- **Unit:** queue FIFO + dedup by transaction_id
- **E2E:** Playwright offline → online replay

#### Rollback
Remove queue wrapper; fetches fail loud when offline.

---

### T-00b-A01 — Postgres app-role connection split (migrations role vs app role)

**Type:** T1-schema + T2-wiring
**Context budget:** ~40k tokens
**Est time:** 60 min
**Parent feature:** 00-b db scaffold (gap-fill per security Decision #5 derivative — ported from existing T-12)
**Agent routing:** backend-specialist
**Track:** α
**Status:** pending

> `[data/migration]` + `[infra/config]`. R3 hardening: `dbAdmin` for migrations only, `dbApp` for request path, lint guard blocking `dbAdmin` in `apps/`.

#### Dependencies
- **Upstream:** [T-00b-002, T-00d-002]
- **Downstream:** [T-00i-003, T-00d-004]
- **Parallel:** [T-00b-006]

#### GIVEN / WHEN / THEN
**GIVEN** Drizzle client exists and RLS baseline migration has run
**WHEN** `import { dbApp, dbAdmin } from '@monopilot/db'` is used in app code
**THEN** `dbApp` connects as `app_role` (RLS-enforced, no DDL); `dbAdmin` connects as migrations role and is forbidden in `apps/**` by ESLint guard + CI check

#### Implementation
1. Migration `016-app-role.sql`: `CREATE ROLE app_role` with SELECT/INSERT/UPDATE/DELETE on business tables (no DDL)
2. Update `packages/db/index.ts` to export both clients from distinct env vars
3. ESLint no-restricted-imports rule for `apps/**/*` banning `dbAdmin`
4. Integration test: `dbApp` cannot `CREATE TABLE`; RLS still enforced
5. Commit

#### Files
- **Create:** `drizzle/migrations/016-app-role.sql`
- **Modify:** `packages/db/index.ts`, `eslint.config.mjs`

#### Test gate
- **Integration:** `vitest app-role.integration.test.ts`
- **CI gate:** ESLint rule green; RLS leak suite (T-00d-004) still green

#### Rollback
`DROP ROLE app_role`; revert client split.

---

### T-00a-006b — Pre-commit token-cap gate (40000 tokens; extends T-00a-006)

**Type:** T2-api (hook extension)
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #5)
**Agent routing:** any
**Track:** δ
**Status:** pending

> `[infra/ci]` — ported from existing T-14; cap = 40000 (per user decision, NOT 18000). Hook comment MUST link to `00-FOUNDATION-PRD.md §11.3 context budget`.

#### Dependencies
- **Upstream:** [T-00a-006]
- **Downstream:** [T-GOV-010]

#### GIVEN / WHEN / THEN
**GIVEN** Husky pre-commit is installed and working
**WHEN** a developer attempts to commit a diff exceeding 40000 tokens
**THEN** the hook rejects the commit with a pointer to `00-FOUNDATION-PRD.md §11.3` and a suggestion to split the PR

#### Implementation
1. Author `scripts/token-cap.ts` using `@dqbd/tiktoken` (or equivalent) tokenizer
2. Count staged diff tokens (git diff --cached | tokenize)
3. Compare against hard-coded cap = 40000; exit 1 if exceeded
4. Add comment header in `.husky/pre-commit` pointing to §11.3 of 00-FOUNDATION-PRD.md
5. Test with fixture (small diff passes; inflated diff fails)

#### Files
- **Create:** `scripts/token-cap.ts`, `scripts/token-cap.test.ts`
- **Modify:** `.husky/pre-commit`

#### Test gate
- **Unit:** cap enforced at boundary
- **CI gate:** also runs `pnpm token-cap` on PR diff

#### Rollback
Remove hook invocation line.

---

### T-00i-011 — E-0 dogfood acceptance harness (merges old T-47 into DoD task)

**Type:** T4-wiring+test
**Context budget:** ~65k tokens
**Est time:** 90 min
**Parent feature:** 00-i testing (gap-fill per Decision #6 of comparison)
**Agent routing:** test-specialist
**Track:** δ
**Status:** pending

> `[test/harness]` — E-0 Definition of Done. Validates the integration milestone verbatim from the merged plan preamble.

#### Dependencies
- **Upstream:** [T-00c-006, T-00d-004, T-00e-004, T-00f-006, T-00g-006, T-00h-005, T-00i-002, T-00i-010, T-00a-008, T-00a-009, T-00b-M01, T-GOV-006]
- **Downstream:** none (release gate)

#### GIVEN / WHEN / THEN
**GIVEN** all E-0 sub-modules are landed
**WHEN** `pnpm test:acceptance:e0` runs
**THEN** every bullet of the E-0 integration milestone passes: fresh `pnpm dev` boots, CI green on trivial PR, RLS cross-tenant leak test green, audit→outbox→worker→consumed end-to-end, rule dry-run deterministic, Zod runtime validates DeptColumns payload, 69-col Main Table present, PWA service worker registers, IndexedDB sync queue roundtrip

#### Implementation
1. Author `tests/acceptance/phase-e0-dod.ts` orchestrator that calls existing CI gates + extra smoke assertions
2. Emit a markdown report `artifacts/phase-e0-dod-report.md` on pass
3. Add CI job `pnpm test:acceptance:e0` with `continue-on-error: false`
4. Link from `docs/BUILD-POSTURE.md`
5. Commit

#### Files
- **Create:** `tests/acceptance/phase-e0-dod.ts`, `.github/workflows/acceptance-e0.yml`

#### Test gate
- **E2E + Integration:** all 9 bullets green
- **CI gate:** release branch blocked unless `acceptance-e0` is green

#### Rollback
Disable job; gate permanent.

---

## §13 — Out-of-scope pointers (single docs task)

### T-OOS-001 — E-0 out-of-scope pointer doc (D365/Peppol/GS1/theming/OTel/i18n)

**Type:** docs
**Context budget:** ~12k tokens
**Est time:** 30 min
**Parent feature:** governance pointer
**Agent routing:** any
**Track:** γ
**Status:** pending
**Priority:** low

> `[docs/readme]` — single consolidated out-of-scope pointer per Decisions #2, #4 + alt defers.

#### Dependencies
- **Upstream:** [T-GOV-009]
- **Downstream:** [T-GOV-012]

#### Done check
- Final output path: `docs/OUT-OF-SCOPE-E0.md`
- Outline:
  - D365 adapter → defer to E-2 per module (was T-37)
  - Peppol AP adapter → defer to E-2 (was T-38)
  - GS1-128 parser → defer to E-2, lands in scanner/shipping modules (was T-39)
  - Per-tenant theming hook → defer to E-1 settings carveout (was T-9)
  - OpenTelemetry (beyond Sentry) → defer post-E-0 (was T-17 partial)
  - i18n scaffold pl/en/uk/ro → defer to E-1 per ADR-032 (was T-19)
- Verifiable: each row has phase owner + rationale + cross-link to ADR or task ID

---

## §14 — Parallel-dispatch checklist (from alt plan §11)

- [x] Enum lock files identified and scoped as HARD BLOCKERS (T-00b-E01/E02/E03)
- [x] Baseline migration HARD BLOCKER (T-00b-000)
- [x] Every atomic task has `Track` α/β/γ/δ assigned
- [x] Upstream/Downstream/Parallel sets recorded
- [x] File-disjointness verified — enum lock files live in distinct paths; `drizzle/migrations/` files are sequentially numbered; no two Parallel tasks modify the same file
- [x] Foundation vs Admin UI split: no admin UI in this backlog (lives in E-1/E-2)
- [x] Hard vs soft blockers distinguished: hard in Upstream; no soft blockers needed for E-0
- [x] Integration milestone in user language defined at preamble
- [x] Governance/doc items isolated in §10 to avoid coupling with atomic code tasks
- [x] T-43 ADR stubs split into 15 atomic docs tasks (§11) per §11.3
- [x] Gap-fills enumerated in §12 with explicit decision references
- [x] Out-of-scope pointers consolidated to one docs task (§13)

**Safe parallelization windows (post enum locks + baseline):**
- Wave 1 (after T-00b-000 + E01/E02/E03): 00-d, 00-e, 00-f, 00-g, 00-h migrations can generate in parallel (distinct migration SQL files).
- Wave 2 (after migrations): T2 API tasks per sub-module run in parallel.
- Wave 3: T4 integration tests pick up after their T1+T2 upstreams.
- Wave 4: T-00i-011 dogfood acceptance runs last as release gate.

**Total atomic + docs tasks: 95**
- §0 architect locks: 4
- §1 00-a: 7
- §2 00-b: 6
- §3 00-c: 6
- §4 00-d: 5
- §5 00-e: 5
- §6 00-f: 6
- §7 00-g: 7
- §8 00-h: 5
- §9 00-i: 10
- §10 governance: 12
- §11 T-43 splits: 15
- §12 gap-fills: 6
- §13 pointer: 1
