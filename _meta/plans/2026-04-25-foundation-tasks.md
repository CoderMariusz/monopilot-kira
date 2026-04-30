---
title: Phase E-0 Foundation — Atomic Task Decomposition (§4 format with ACP Prompts)
version: 1.0
date: 2026-04-25
status: ready-for-execution
source: 2026-04-22-foundation-merged-plan.md (95-task backlog) → converted to §4 ACP-dispatch format
scope: E-0 Foundation sub-modules 00-a through 00-i + governance + ADR stubs + gap-fills
total_tasks: 95
---

# Phase E-0 Foundation — Atomic Task Decomposition

**Integration milestone (dogfood target):** `pnpm dev` boots from fresh checkout; CI green on trivial PR; Playwright cross-tenant RLS test green; audit→outbox→worker→consumed E2E; rule dry-run deterministic; Zod schema from DeptColumns validates payload; 69-col Main Table migration applied; PWA service worker registers; IndexedDB sync queue roundtrip.

---

## §0 — Architect enum locks (HARD BLOCKERS — Wave 0)

---

## T-00b-000 — Baseline migration `001-baseline.sql`

**Type:** T1-schema
**Context budget:** ~50k tokens
**Est time:** 75 min
**Parent feature:** 00-b scaffolding
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-005 — README scaffold, T-00b-001 — Supabase local]
- **Downstream (will consume this):** [every T-00d-*, T-00e-*, T-00f-*, T-00b-M01]
- **Parallel (can run concurrently):** [] — architect-owned, serial

### GIVEN / WHEN / THEN
**GIVEN** Supabase local + Drizzle config are initialised
**WHEN** the baseline migration is applied
**THEN** tables `tenants`, `users`, `user_tenants`, `roles`, `user_roles`, `modules`, `organization_modules` exist with R13 columns on every business table: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`, `tenant_id UUID NOT NULL REFERENCES tenants(id)`, `created_at TIMESTAMPTZ DEFAULT now()`, `created_by_user UUID`, `created_by_device UUID`, `app_version TEXT`, `model_prediction_id UUID`, `epcis_event_id UUID`, `external_id TEXT`, `schema_version INT NOT NULL DEFAULT 1`

### ACP Prompt
```
# Task T-00b-000 — Baseline migration 001-baseline.sql

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §8` — multi-tenant model L1-L4, tenant schema requirements
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §10` — R13 identity columns spec

## Twoje zadanie
Stwórz baseline Drizzle migration dla 7 tabel: `tenants`, `users`, `user_tenants`, `roles`, `user_roles`, `modules`, `organization_modules`. Każda tabela biznesowa musi mieć R13 columns: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`, `tenant_id UUID NOT NULL REFERENCES tenants(id)`, `created_at TIMESTAMPTZ DEFAULT now()`, `created_by_user UUID`, `created_by_device UUID`, `app_version TEXT`, `model_prediction_id UUID`, `epcis_event_id UUID`, `external_id TEXT`, `schema_version INT NOT NULL DEFAULT 1`.

## Implementacja
1. Utwórz `packages/db/schema/baseline.ts` — 7 tabel z Drizzle ORM, typed columns per spec
2. Dodaj `schema_version INT NOT NULL DEFAULT 1` do każdej tabeli biznesowej
3. Generuj migration via `pnpm drizzle-kit generate` → `drizzle/migrations/001-baseline.sql`
4. Dry-run na ephemeral Postgres: `psql -c '\d+ tenants'` — verify DDL
5. Commit `drizzle/migrations/001-baseline.sql`

## Files
**Create:** `packages/db/schema/baseline.ts`, `drizzle/migrations/001-baseline.sql`
**Modify:** `drizzle.config.ts`

## Done when
- `vitest drizzle/migrations/001-baseline.integration.test.ts` PASS — asserts all 7 tables exist, R13 cols present, `schema_version` default 1
- `pnpm test:migrations` green

- `pnpm test:smoke` green
## Rollback
`pnpm drizzle-kit drop` — drops all tables in baseline migration
```

### Test gate (planning summary)
- **Integration:** `vitest drizzle/migrations/001-baseline.integration.test.ts` — all 7 tables, R13 cols, schema_version
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop`

---

## T-00b-E01 — `permissions.enum.ts` lock

**Type:** T1-schema
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** cross-cutting enum locks
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-005 — README scaffold]
- **Downstream (will consume this):** every task using RBAC (00-c, 00-d, 00-e, 00-f)
- **Parallel (can run concurrently):** [T-00b-E02, T-00b-E03]

### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** `permissions.enum.ts` is merged
**THEN** a single source of truth exists for permission strings: `org.admin`, `fa.create`, `fa.edit`, `brief.convert_to_fa`, `closed_flag.unset`, `ref.edit`, `audit.read`, `outbox.admin`, `impersonate.tenant`

### ACP Prompt
```
# Task T-00b-E01 — permissions.enum.ts lock

## Twoje zadanie
Stwórz plik `lib/rbac/permissions.enum.ts` jako jedyne source of truth dla permission strings. Zablokuj plik w CODEOWNERS (tylko architect może modyfikować). Exact permission strings: `org.admin`, `fa.create`, `fa.edit`, `brief.convert_to_fa`, `closed_flag.unset`, `ref.edit`, `audit.read`, `outbox.admin`, `impersonate.tenant`.

## Implementacja
1. Utwórz `lib/rbac/permissions.enum.ts` — `export const Permission = { ORG_ADMIN: 'org.admin', FA_CREATE: 'fa.create', FA_EDIT: 'fa.edit', BRIEF_CONVERT_TO_FA: 'brief.convert_to_fa', CLOSED_FLAG_UNSET: 'closed_flag.unset', REF_EDIT: 'ref.edit', AUDIT_READ: 'audit.read', OUTBOX_ADMIN: 'outbox.admin', IMPERSONATE_TENANT: 'impersonate.tenant' } as const` + `export type Permission = typeof Permission[keyof typeof Permission]`
2. Dodaj JSDoc per permission opisujący scope
3. Exportuj `ALL_PERMISSIONS: readonly Permission[]` dla codegen/tests
4. Utwórz `lib/rbac/permissions.test.ts` — brak duplikatów, format regex `^[a-z]+(\.[a-z_]+)+$`
5. Dodaj do `CODEOWNERS`: `lib/rbac/permissions.enum.ts @architect`

## Files
**Create:** `lib/rbac/permissions.enum.ts`, `lib/rbac/permissions.test.ts`
**Modify:** `CODEOWNERS`

## Done when
- `vitest lib/rbac/permissions.test.ts` PASS — no dupes, format regex valid
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm lib/rbac/permissions.enum.ts lib/rbac/permissions.test.ts`
```

### Test gate (planning summary)
- **Unit:** `vitest lib/rbac/permissions.test.ts` — no dupes, format regex
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm lib/rbac/permissions.enum.ts`

---

## T-00b-E02 — `events.enum.ts` lock

**Type:** T1-schema
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** cross-cutting enum locks
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-005]
- **Downstream (will consume this):** every task emitting outbox events
- **Parallel (can run concurrently):** [T-00b-E01, T-00b-E03]

### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** `events.enum.ts` is merged
**THEN** source of truth for outbox `event_type` strings in ISA-95 dot format: `org.created`, `user.invited`, `role.assigned`, `brief.created`, `fa.created`, `lp.received`, `wo.ready`, `audit.recorded`

### ACP Prompt
```
# Task T-00b-E02 — events.enum.ts lock

## Twoje zadanie
Stwórz `lib/outbox/events.enum.ts` jako jedyne source of truth dla event_type strings. ISA-95 dot format. Exact values: `org.created`, `user.invited`, `role.assigned`, `brief.created`, `fa.created`, `lp.received`, `wo.ready`, `audit.recorded`.

## Implementacja
1. Utwórz `lib/outbox/events.enum.ts` — `export const EventType = { ORG_CREATED: 'org.created', USER_INVITED: 'user.invited', ROLE_ASSIGNED: 'role.assigned', BRIEF_CREATED: 'brief.created', FA_CREATED: 'fa.created', LP_RECEIVED: 'lp.received', WO_READY: 'wo.ready', AUDIT_RECORDED: 'audit.recorded' } as const` + `export type EventType = typeof EventType[keyof typeof EventType]`
2. Dodaj komentarz ISA-95 prefix convention
3. Exportuj `ALL_EVENTS` array dla codegen
4. Utwórz `lib/outbox/events.test.ts` — no dupes + format regex
5. Dodaj do CODEOWNERS

## Files
**Create:** `lib/outbox/events.enum.ts`, `lib/outbox/events.test.ts`
**Modify:** `CODEOWNERS`

## Done when
- `vitest lib/outbox/events.test.ts` PASS
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm lib/outbox/events.enum.ts lib/outbox/events.test.ts`
```

### Test gate (planning summary)
- **Unit:** `vitest lib/outbox/events.test.ts` — no dupes, ISA-95 format regex
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm lib/outbox/events.enum.ts`

---

## T-00b-E03 — `ref-tables.enum.ts` lock

**Type:** T1-schema
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** cross-cutting enum locks
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-005]
- **Downstream (will consume this):** [T-00h-*, 02-SET-a seeds]
- **Parallel (can run concurrently):** [T-00b-E01, T-00b-E02]

### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** `ref-tables.enum.ts` is merged
**THEN** 7 E-0 reference table names locked: `dept_columns`, `pack_sizes`, `lines_by_pack_size`, `dieset_by_line_pack`, `templates`, `processes`, `close_confirm` + comment pointing to 10 deferred E-1/E-2 tables

### ACP Prompt
```
# Task T-00b-E03 — ref-tables.enum.ts lock

## Twoje zadanie
Stwórz `lib/reference/ref-tables.enum.ts` — source of truth dla reference table names. Exact E-0 values: `dept_columns`, `pack_sizes`, `lines_by_pack_size`, `dieset_by_line_pack`, `templates`, `processes`, `close_confirm`. Dodaj comment blok listujący deferred tabele (10 sztuk — E-1/E-2).

## Implementacja
1. Utwórz `lib/reference/ref-tables.enum.ts` — `export const RefTable = { DEPT_COLUMNS: 'dept_columns', PACK_SIZES: 'pack_sizes', LINES_BY_PACK_SIZE: 'lines_by_pack_size', DIESET_BY_LINE_PACK: 'dieset_by_line_pack', TEMPLATES: 'templates', PROCESSES: 'processes', CLOSE_CONFIRM: 'close_confirm' } as const` + type
2. Dodaj JSDoc comment: deferred E-1/E-2 tables: `alert_thresholds`, `d365_constants`, `allergens`, `allergens_by_rm`, `allergens_by_process`, `gate_checklist_templates`, `locations`, `devices`, `shift_templates`, `downtime_categories`
3. Utwórz test: no dupes + format snake_case
4. Dodaj do CODEOWNERS
5. Commit

## Files
**Create:** `lib/reference/ref-tables.enum.ts`, `lib/reference/ref-tables.test.ts`
**Modify:** `CODEOWNERS`

## Done when
- `vitest lib/reference/ref-tables.test.ts` PASS
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm lib/reference/ref-tables.enum.ts`
```

### Test gate (planning summary)
- **Unit:** `vitest lib/reference/ref-tables.test.ts` — no dupes
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm lib/reference/ref-tables.enum.ts`

---

## §1 — Sub-module 00-a — Monorepo + Next.js 14 scaffold

---

## T-00a-001 — Initialise pnpm workspace + Turborepo config

**Type:** T1-schema
**Context budget:** ~30k tokens
**Est time:** 45 min
**Parent feature:** 00-a scaffold
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** []
- **Downstream (will consume this):** [T-00a-002, T-00a-003, T-00a-004, T-00a-005]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** an empty repo
**WHEN** `pnpm install` runs from root
**THEN** `pnpm-workspace.yaml` resolves `apps/*` + `packages/*`; `turbo.json` defines `build | lint | test | dev` pipelines; `pnpm turbo run build --filter=^` exits 0

### ACP Prompt
```
# Task T-00a-001 — Initialise pnpm workspace + Turborepo config

## Twoje zadanie
Zainicjuj pnpm monorepo z Turborepo. Workspace resolves `apps/*` + `packages/*`. Turbo pipelines: build, lint, test, dev.

## Implementacja
1. `pnpm init -w` — utwórz root `package.json` z `"engines": { "node": ">=20", "pnpm": ">=9" }`
2. Utwórz `pnpm-workspace.yaml` z `packages: ['apps/*', 'packages/*']`
3. Zainstaluj turbo: `pnpm add -Dw turbo`; utwórz `turbo.json` z 4 pipelines (build/lint/test/dev)
4. Dodaj `.gitignore` (node_modules, .next, dist, .turbo, .env.local), `.nvmrc` (20)
5. Verify: `pnpm turbo run build --filter=^` exits 0

## Files
**Create:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.nvmrc`

## Done when
- `pnpm turbo run build --filter=^` exits 0
- `pnpm install` completes without errors

- `pnpm test:smoke` green
## Rollback
`git revert` commit
```

### Test gate (planning summary)
- **CI gate:** `pnpm turbo run build --filter=^` exits 0

### Rollback
`git revert` commit

---

## T-00a-002 — Bootstrap `apps/web` (Next.js 14 App Router, TS strict)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-a scaffold
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-001]
- **Downstream (will consume this):** [T-00a-003, T-00a-004, T-00c-001]
- **Parallel (can run concurrently):** [T-00a-007]

### GIVEN / WHEN / THEN
**GIVEN** workspace is initialised
**WHEN** `pnpm --filter web dev` runs
**THEN** Next.js 14 App Router boots at `localhost:3000`, TypeScript `strict: true` + `noUncheckedIndexedAccess: true` enforced

### ACP Prompt
```
# Task T-00a-002 — Bootstrap apps/web (Next.js 14 App Router, TS strict)

## Twoje zadanie
Utwórz `apps/web` Next.js 14 App Router z TypeScript strict mode. Placeholder RSC page na `/`.

## Implementacja
1. `pnpm create next-app@14 apps/web --ts --app --no-eslint` (bare scaffold)
2. Harduj `apps/web/tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`
3. Zamień `apps/web/app/page.tsx` na RSC placeholder: `export default function Home() { return <main>Monopilot</main> }`
4. Dodaj `dev` script przez Turbo w `turbo.json`
5. Smoke: `pnpm --filter web build` green

## Files
**Create:** `apps/web/` (Next.js scaffold)
**Modify:** `turbo.json`

## Prototype reference
Brak — to jest app shell, nie komponent z prototypu.

## Done when
- `pnpm --filter web build` green
- `curl localhost:3000 | grep Monopilot` returns match after `pnpm --filter web dev`

- `pnpm test:smoke` green
## Rollback
`rm -rf apps/web`
```

### Test gate (planning summary)
- **CI gate:** `pnpm --filter web build` green

### Rollback
`rm -rf apps/web`

---

## T-00a-003 — Tailwind + shadcn/ui init in `apps/web`

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-a scaffold
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-002]
- **Downstream (will consume this):** [T-00c-004, every future T3-ui]
- **Parallel (can run concurrently):** [T-00a-004]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app boots
**WHEN** shadcn `Button` imported and rendered on `/`
**THEN** Tailwind classes resolve, Radix primitives render, dark mode class strategy works

### ACP Prompt
```
# Task T-00a-003 — Tailwind + shadcn/ui init in apps/web

## Twoje zadanie
Zainstaluj Tailwind CSS + shadcn/ui w apps/web. Zweryfikuj że Button renders.

## Implementacja
1. Zainstaluj tailwindcss + init: `npx tailwindcss init -p --ts` → `apps/web/tailwind.config.ts` z content globs `['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}']`
2. `npx shadcn@latest init` — wybierz: Default theme, CSS variables yes, RSC yes
3. `npx shadcn@latest add button card dialog input label form select textarea badge alert skeleton`
4. Dodaj `<Button>Hello</Button>` na `apps/web/app/page.tsx`
5. `pnpm --filter web build` + RTL render test asserting button renders

## Files
**Create:** `apps/web/tailwind.config.ts`, `apps/web/components.json`, `apps/web/components/ui/*`
**Modify:** `apps/web/app/page.tsx`, `apps/web/app/globals.css`

## Prototype reference
Brak — to jest UI toolkit setup, nie komponent z prototypu.
Translation checklist:
- [ ] Verify shadcn Button, Card, Dialog, Form, Input, Select, Textarea, Badge, Alert, Skeleton installed
- [ ] Dark mode class strategy set to `class`

## Done when
- `pnpm --filter web build` green
- RTL test: `Button` renders without errors

- `pnpm test:smoke` green
## Rollback
`git revert` commit
```

### Test gate (planning summary)
- **CI gate:** `pnpm --filter web build` green + RTL render test

### Rollback
`git revert` commit

---

## T-00a-004 — ESLint + Prettier + TypeScript project references

**Type:** T4-wiring+test
**Context budget:** ~30k tokens
**Est time:** 40 min
**Parent feature:** 00-a scaffold
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-002]
- **Downstream (will consume this):** [T-00i-002]
- **Parallel (can run concurrently):** [T-00a-003]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app scaffold exists
**WHEN** `pnpm lint` and `pnpm typecheck` run at root
**THEN** both pass across all workspaces with unified config

### ACP Prompt
```
# Task T-00a-004 — ESLint + Prettier + TypeScript project references

## Twoje zadanie
Skonfiguruj ESLint (flat config), Prettier i TypeScript project references dla całego monorepo.

## Implementacja
1. Dodaj root `eslint.config.mjs` (flat config) z `eslint-config-next`, `eslint-plugin-tailwindcss`, `eslint-plugin-react-hooks`
2. Dodaj `prettier.config.mjs` z `prettier-plugin-tailwindcss`; `.prettierrc` extends
3. Utwórz `tsconfig.base.json` (root) z `strict: true`, `noUncheckedIndexedAccess: true`; `apps/web/tsconfig.json` extends it
4. Dodaj `lint` i `typecheck` pipelines do `turbo.json`
5. `pnpm lint && pnpm typecheck` — fix initial errors, commit

## Files
**Create:** `eslint.config.mjs`, `prettier.config.mjs`, `tsconfig.base.json`
**Modify:** `turbo.json`, `apps/web/tsconfig.json`

## Done when
- `pnpm lint` exits 0
- `pnpm typecheck` exits 0

- `pnpm test:smoke` green
## Rollback
`git revert` commit
```

### Test gate (planning summary)
- **CI gate:** `pnpm lint && pnpm typecheck` exits 0

### Rollback
`git revert` commit

---

## T-00a-005 — Root README + CONTRIBUTING skeleton

**Type:** docs
**Context budget:** ~15k tokens
**Est time:** 20 min
**Parent feature:** 00-a scaffold
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-001]
- **Downstream (will consume this):** [T-00b-E01, T-00b-E02, T-00b-E03]
- **Parallel (can run concurrently):** [T-00a-002, T-00a-003, T-00a-004]

### GIVEN / WHEN / THEN
**GIVEN** workspace scaffold exists
**WHEN** a fresh developer follows README
**THEN** reaches `pnpm dev` green at `localhost:3000` in ≤10 min

### ACP Prompt
```
# Task T-00a-005 — Root README + CONTRIBUTING skeleton

## Twoje zadanie
Stwórz `README.md` (stack + local run) i `CONTRIBUTING.md` (PR rules + 40k token cap).

## Implementacja
1. Utwórz `README.md`: Stack section (Next.js 14/Drizzle/Supabase/shadcn), Local setup (pnpm install + supabase start + pnpm dev), Monorepo layout (apps/web, packages/db, packages/rule-engine), Test commands
2. Utwórz `CONTRIBUTING.md`: PR rules, 40k token cap per PR (per PRD §11.3), Marker discipline pointer, link do phase E-0 plan
3. Commit oba pliki

## Files
**Create:** `README.md`, `CONTRIBUTING.md`

## Done when
- `README.md` ma sekcje: Stack, Local setup, Monorepo layout, Tests
- `CONTRIBUTING.md` ma sekcje: PR rules, 40k cap, Marker discipline

## Rollback
`git rm README.md CONTRIBUTING.md`
```

### Test gate (planning summary)
- **Manual:** fresh dev reaches `pnpm dev` green following README in ≤10 min

### Rollback
`git rm README.md CONTRIBUTING.md`

---

## T-00a-006 — Husky pre-commit hook (lint + typecheck on staged)

**Type:** T4-wiring+test
**Context budget:** ~25k tokens
**Est time:** 25 min
**Parent feature:** 00-a scaffold
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-004]
- **Downstream (will consume this):** [T-00a-006b]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** ESLint + Prettier are configured
**WHEN** a developer commits
**THEN** Husky pre-commit runs `lint-staged` on staged files, blocks on failure

### ACP Prompt
```
# Task T-00a-006 — Husky pre-commit hook

## Twoje zadanie
Zainstaluj Husky + lint-staged. Pre-commit hook: lint + prettier na staged files.

## Implementacja
1. `pnpm add -Dw husky lint-staged`
2. `pnpm exec husky init` → utwórz `.husky/pre-commit` wywołujący `pnpm exec lint-staged`
3. Skonfiguruj `lint-staged` w root `package.json`: `{ "*.{ts,tsx}": ["eslint --fix", "prettier --write"], "*.{js,json,md}": ["prettier --write"] }`
4. Smoke: celowo złam plik, commit → observe block
5. Fix + commit

## Files
**Create:** `.husky/pre-commit`
**Modify:** `package.json`

## Done when
- Celowo złamany plik blokuje commit z lint error
- `pnpm test:smoke` green

## Rollback
`rm -rf .husky && pnpm remove husky lint-staged`
```

### Test gate (planning summary)
- **Manual smoke:** broken file blocks commit

### Rollback
`rm -rf .husky`

---

## T-00a-007 — Env var loader (`@t3-oss/env-nextjs`) + `.env.example`

**Type:** T2-api
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** 00-a scaffold
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-002]
- **Downstream (will consume this):** [T-00b-001, T-00c-001, T-00i-006]
- **Parallel (can run concurrently):** [T-00a-003]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app scaffold exists
**WHEN** any server component reads `env.SUPABASE_URL`
**THEN** missing/invalid env caught at build time via Zod, typed, clear error; `.env.example` lists all required keys

### ACP Prompt
```
# Task T-00a-007 — Env var loader + .env.example

## Twoje zadanie
Zainstaluj `@t3-oss/env-nextjs`. Utwórz typed env file. Keys: DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_POSTHOG_KEY, SENTRY_DSN.

## Implementacja
1. `pnpm add @t3-oss/env-nextjs zod --filter web`
2. Utwórz `apps/web/lib/env.ts`:
   ```ts
   import { createEnv } from '@t3-oss/env-nextjs'
   import { z } from 'zod'
   export const env = createEnv({
     server: {
       DATABASE_URL: z.string().url(),
       SUPABASE_URL: z.string().url(),
       SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
       SENTRY_DSN: z.string().url().optional(),
     },
     client: {
       NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
       NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
       NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
     },
     runtimeEnv: { DATABASE_URL: process.env.DATABASE_URL, ... }
   })
   ```
3. Utwórz `.env.example` z all required keys (no secrets)
4. Utwórz `apps/web/lib/env.test.ts` — missing var throws at import
5. Commit

## Files
**Create:** `apps/web/lib/env.ts`, `.env.example`

## Done when
- `vitest apps/web/lib/env.test.ts` PASS — missing var throws
- `pnpm --filter web build` green

- `pnpm test:smoke` green
## Rollback
`git rm apps/web/lib/env.ts .env.example`
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/env.test.ts` — missing var throws
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/env.ts`

---

## T-00a-008 — PWA scaffold (manifest + service worker)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #3)
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-002]
- **Downstream (will consume this):** [T-00a-009, T-00i-011]
- **Parallel (can run concurrently):** [T-00a-007]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app running
**WHEN** browser loads app
**THEN** service worker registers, `manifest.webmanifest` resolves, app is installable, offline shell served for `/`

### ACP Prompt
```
# Task T-00a-008 — PWA scaffold (manifest + service worker)

## Twoje zadanie
Dodaj PWA support do apps/web: manifest.webmanifest + service worker via next-pwa lub Workbox.

## Implementacja
1. `pnpm add next-pwa --filter web`
2. Skonfiguruj `next.config.ts` z `withPWA({ dest: 'public', disable: process.env.NODE_ENV === 'development' })`
3. Utwórz `public/manifest.webmanifest` z: `name: 'Monopilot MES'`, `short_name: 'Monopilot'`, `display: 'standalone'`, `start_url: '/'`, `theme_color: '#0f172a'`, `background_color: '#ffffff'`
4. Utwórz `public/icons/` z icon 192x192 + 512x512 (placeholder PNG)
5. Dodaj `<link rel="manifest">` do root layout

## Files
**Create:** `public/manifest.webmanifest`, `public/icons/*`
**Modify:** `apps/web/next.config.ts`, `apps/web/app/layout.tsx`

## Prototype reference
Brak prototypu — infrastructure task.
Translation checklist:
- [ ] Service worker registers on first load
- [ ] App installable (manifest valid)
- [ ] Offline shell for `/` served

## Done when
- `pnpm --filter web build` green — SW generated in public/
- Browser DevTools → Application → Service Workers: registered
- `pnpm test:smoke` green

## Rollback
`git revert` commit; remove next-pwa from package.json
```

### Test gate (planning summary)
- **Manual:** Service worker registers in browser DevTools
- **CI gate:** `pnpm --filter web build` green

### Rollback
`git revert` commit

---

## T-00a-009 — IndexedDB sync queue + offline queue flusher

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 50 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #3)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-008]
- **Downstream (will consume this):** [T-00i-011]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** PWA service worker is registered
**WHEN** app is offline and user triggers a form submit
**THEN** action is queued in IndexedDB; on reconnect, flusher replays queue in order; duplicate guard via idempotency key

### ACP Prompt
```
# Task T-00a-009 — IndexedDB sync queue + offline queue flusher

## Twoje zadanie
Implementuj `packages/offline/sync-queue.ts` — IndexedDB backed queue dla offline Server Action replays.

## Implementacja
1. Utwórz `packages/offline/package.json` workspace
2. Utwórz `packages/offline/sync-queue.ts` używając `idb` npm package:
   - `enqueue({ action, payload, idempotencyKey })` → adds to IDB store `sync_queue`
   - `flush(fetchFn)` → replays in order, marks `status: 'consumed'` on success, `status: 'failed'` after 3 retries
3. Utwórz `packages/offline/use-sync-queue.ts` — React hook wywołujący flush przy `navigator.onLine` event
4. Utwórz `packages/offline/sync-queue.test.ts` — unit tests: enqueue + flush + idempotency
5. Wire hook do root layout

## Files
**Create:** `packages/offline/sync-queue.ts`, `packages/offline/use-sync-queue.ts`, `packages/offline/sync-queue.test.ts`
**Modify:** `apps/web/app/layout.tsx`

## Done when
- `vitest packages/offline/sync-queue.test.ts` PASS — enqueue+flush+idempotency
- `pnpm test:smoke` green

## Rollback
`rm -rf packages/offline`
```

### Test gate (planning summary)
- **Unit:** `vitest packages/offline/sync-queue.test.ts` — enqueue/flush/idempotency
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf packages/offline`

---

## §2 — Sub-module 00-b — Supabase + Drizzle + migrations

---

## T-00b-001 — Supabase local (Docker) bootstrap + project link

**Type:** T1-schema
**Context budget:** ~30k tokens
**Est time:** 35 min
**Parent feature:** 00-b db scaffold
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-007]
- **Downstream (will consume this):** [T-00b-000, T-00b-002, T-00i-003]
- **Parallel (can run concurrently):** [T-00b-E01, T-00b-E02, T-00b-E03]

### GIVEN / WHEN / THEN
**GIVEN** Docker is installed
**WHEN** `supabase start` runs from repo root
**THEN** local Postgres + GoTrue + Storage at known ports; `.env.local` populated with anon + service role keys

### ACP Prompt
```
# Task T-00b-001 — Supabase local Docker bootstrap

## Twoje zadanie
Zainicjuj Supabase local dev environment. Docker musi być zainstalowany.

## Implementacja
1. `pnpm dlx supabase init` — tworzy `supabase/config.toml`
2. Edytuj `supabase/config.toml`: `project_id = "monopilot-dev"`, `port = 54321`
3. `supabase start` — capture output keys (anon key + service role key)
4. Utwórz `.env.local.example` z captured keys (bez prawdziwych sekretów)
5. Dodaj npm scripts: `"db:start": "supabase start"`, `"db:stop": "supabase stop"`, `"db:reset": "supabase db reset"`

## Files
**Create:** `supabase/config.toml`
**Modify:** `package.json`

## Done when
- `supabase start` exits 0
- `psql postgresql://postgres:postgres@localhost:54322/postgres -c 'SELECT 1'` returns `(1 row)`
- `pnpm test:smoke` green

## Rollback
`supabase stop && rm -rf supabase/`
```

### Test gate (planning summary)
- **CI gate:** `supabase start` + psql connection

### Rollback
`supabase stop && rm -rf supabase/`

---

## T-00b-002 — Drizzle config + client singleton

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 00-b db scaffold
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-001]
- **Downstream (will consume this):** [T-00b-000, T-00b-003]
- **Parallel (can run concurrently):** [T-00b-E01, T-00b-E02, T-00b-E03]

### GIVEN / WHEN / THEN
**GIVEN** Supabase local is up
**WHEN** `import { db } from 'packages/db'` runs server-side
**THEN** Drizzle client connects via `DATABASE_URL`, honours transactions, exposes typed `schema` namespace

### ACP Prompt
```
# Task T-00b-002 — Drizzle config + client singleton

## Twoje zadanie
Utwórz `packages/db` workspace z Drizzle ORM + postgres driver + singleton client.

## Implementacja
1. Utwórz `packages/db/package.json` workspace: `{ "name": "@monopilot/db", "main": "./index.ts" }`
2. `pnpm add drizzle-orm postgres --filter @monopilot/db && pnpm add -D drizzle-kit --filter @monopilot/db`
3. Utwórz `packages/db/index.ts`:
   ```ts
   import { drizzle } from 'drizzle-orm/postgres-js'
   import postgres from 'postgres'
   import * as schema from './schema'
   const client = postgres(process.env.DATABASE_URL!)
   export const db = drizzle(client, { schema })
   export { schema }
   ```
4. Utwórz `drizzle.config.ts` (root): `{ schema: 'packages/db/schema/*', out: 'drizzle/migrations', dialect: 'postgresql', dbCredentials: { url: process.env.DATABASE_URL! } }`
5. Utwórz `packages/db/smoke.test.ts` — `db.execute(sql\`select 1\`)` returns `[{ '?column?': 1 }]`

## Files
**Create:** `packages/db/package.json`, `packages/db/index.ts`, `drizzle.config.ts`

## Done when
- `vitest packages/db/smoke.test.ts` PASS — select 1 returns 1
- `pnpm test:smoke` green

## Rollback
`rm -rf packages/db drizzle.config.ts`
```

### Test gate (planning summary)
- **Integration:** `vitest packages/db/smoke.test.ts` — select 1
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf packages/db drizzle.config.ts`

---

## T-00b-003 — Migration runner scripts (up/down) + `pnpm migrate`

**Type:** T2-api
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 00-b db scaffold
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000, T-00b-002]
- **Downstream (will consume this):** [T-00d-001, T-00e-001, T-00f-001, T-00i-003]
- **Parallel (can run concurrently):** [T-00b-004]

### GIVEN / WHEN / THEN
**GIVEN** Drizzle + baseline migration exist
**WHEN** `pnpm migrate` or `pnpm migrate:down` runs
**THEN** drizzle-kit applies/reverts migrations idempotently; `drizzle_migrations` tracks applied set; CI runs headless

### ACP Prompt
```
# Task T-00b-003 — Migration runner scripts

## Twoje zadanie
Utwórz skrypty do zarządzania migracjami: up/down/status. Wire do Turbo pipeline.

## Implementacja
1. Utwórz `packages/db/scripts/migrate.ts` — wywołuje `drizzle-kit migrate`
2. Utwórz `packages/db/scripts/migrate-down.ts` — `drizzle-kit drop` z guard (nie drop w production)
3. Dodaj npm scripts do root `package.json`: `"migrate": "tsx packages/db/scripts/migrate.ts"`, `"migrate:down": "tsx packages/db/scripts/migrate-down.ts"`, `"migrate:status": "drizzle-kit status"`
4. Utwórz integration test: `migrate up → down → up` idempotent
5. Document w README

## Files
**Create:** `packages/db/scripts/migrate.ts`, `packages/db/scripts/migrate-down.ts`
**Modify:** `package.json`

## Done when
- `vitest packages/db/scripts/migrate.test.ts` PASS — up/down/up idempotent
- `pnpm migrate && pnpm migrate:status` green

- `pnpm test:smoke` green
## Rollback
`pnpm migrate:down` + revert scripts
```

### Test gate (planning summary)
- **Integration:** `vitest packages/db/scripts/migrate.test.ts` — up/down/up
- **CI gate:** `pnpm migrate && pnpm migrate:status` green

### Rollback
`pnpm migrate:down`

---

## T-00b-004 — Seed runner + named snapshots registry

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 50 min
**Parent feature:** 00-b db scaffold
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000]
- **Downstream (will consume this):** [T-00i-004, T-00d-004]
- **Parallel (can run concurrently):** [T-00b-003]

### GIVEN / WHEN / THEN
**GIVEN** baseline migration applied
**WHEN** `pnpm seed apex-baseline` runs
**THEN** populates deterministic Apex seed: 1 tenant (`id: '00000000-0000-0000-0000-000000000001'`), 3 users (Jane/Tom/Admin), 3 roles (npd_manager/dept_lead/admin); re-running is a no-op

### ACP Prompt
```
# Task T-00b-004 — Seed runner + named snapshots registry

## Twoje zadanie
Utwórz seed runner z 3 named snapshots: apex-baseline, empty-tenant, multi-tenant-3.

## Implementacja
1. Utwórz `packages/db/seed/index.ts` — `applySnapshot(name: 'apex-baseline' | 'empty-tenant' | 'multi-tenant-3')` dispatcher
2. Utwórz `packages/db/seed/snapshots/apex-baseline.ts` — Drizzle typed insert: 1 tenant (UUID `00000000-0000-0000-0000-000000000001`), users: Jane (npd_manager), Tom (dept_lead), Admin (admin), deterministic UUIDs, idempotent `ON CONFLICT DO NOTHING`
3. Utwórz `packages/db/seed/snapshots/empty-tenant.ts` — 1 tenant, 0 users
4. Utwórz `packages/db/seed/snapshots/multi-tenant-3.ts` — 3 tenants z disjoint users
5. Dodaj npm script `"seed": "tsx packages/db/seed/index.ts"` + integration test

## Files
**Create:** `packages/db/seed/index.ts`, `packages/db/seed/snapshots/apex-baseline.ts`, `packages/db/seed/snapshots/empty-tenant.ts`, `packages/db/seed/snapshots/multi-tenant-3.ts`
**Modify:** `package.json`

## Done when
- `vitest packages/db/seed/seed.test.ts` PASS — idempotent re-run no-op
- `pnpm seed apex-baseline` inserts expected rows
- `pnpm test:smoke` green

## Rollback
`DELETE FROM tenants WHERE id = '00000000-0000-0000-0000-000000000001'`
```

### Test gate (planning summary)
- **Integration:** `vitest packages/db/seed/seed.test.ts` — idempotent
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DELETE FROM tenants WHERE id = '00000000-...'`

---

## T-00b-005 — Schema drift detector (daily job + CI gate)

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 50 min
**Parent feature:** 00-b db scaffold
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-003, T-00h-001]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00b-004]

### GIVEN / WHEN / THEN
**GIVEN** Drizzle schema + `Reference.DeptColumns` metadata exist
**WHEN** drift job runs
**THEN** differences between `information_schema.columns` and Drizzle schema reported in `drift_events` table + Sentry breadcrumb; exit code 1 in CI on any drift

### ACP Prompt
```
# Task T-00b-005 — Schema drift detector

## Twoje zadanie
Utwórz `packages/db/scripts/drift-check.ts` — porównaj pg_catalog vs Drizzle schema; emituj do drift_events + Sentry.

## Implementacja
1. Utwórz migration `002-drift-events.sql`: `CREATE TABLE drift_events (id BIGSERIAL PRIMARY KEY, tenant_id UUID, detected_at TIMESTAMPTZ DEFAULT now(), diff_json JSONB)`
2. Utwórz `packages/db/scripts/drift-check.ts`:
   - Query `information_schema.columns WHERE table_schema = 'public'`
   - Compare vs Drizzle schema introspection (`db._.tableNamesMap`)
   - Emit `drift_events` row per discrepancy
   - Exit code 1 on any discrepancy
3. Dodaj CI step w `.github/workflows/ci.yml`: `pnpm tsx packages/db/scripts/drift-check.ts`
4. Utwórz integration test z deliberate drift fixture
5. Commit

## Files
**Create:** `packages/db/scripts/drift-check.ts`, `drizzle/migrations/002-drift-events.sql`
**Modify:** `turbo.json`

## Done when
- `vitest packages/db/drift-check.test.ts` PASS — deliberate drift fixture detected
- CI step exits 1 on drift, 0 on no drift

- `pnpm test:smoke` green
## Rollback
Disable CI step; `DROP TABLE drift_events`
```

### Test gate (planning summary)
- **Integration:** `vitest packages/db/drift-check.test.ts` — drift fixture detected
- **CI gate:** `pnpm test:smoke` green

### Rollback
Disable CI step

---

## T-00b-006 — Supabase client singleton + `setCurrentOrgId` RLS context setter

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-b db scaffold
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-002]
- **Downstream (will consume this):** [T-00c-003, T-00d-002]
- **Parallel (can run concurrently):** [T-00b-005]

### GIVEN / WHEN / THEN
**GIVEN** Drizzle client exists
**WHEN** `await setCurrentOrgId(db, orgId)` called inside a transaction
**THEN** Postgres session has `SET LOCAL app.current_org_id = '<uuid>'`; RLS policies see it

### ACP Prompt
```
# Task T-00b-006 — Supabase client + setCurrentOrgId RLS context setter

## Twoje zadanie
Utwórz `packages/db/rls-context.ts` z funkcjami `setCurrentOrgId` i `withOrgContext`. Muszą działać WYŁĄCZNIE wewnątrz transakcji.

## Implementacja
1. Utwórz `packages/db/rls-context.ts`:
   ```ts
   export async function setCurrentOrgId(tx: typeof db, orgId: string) {
     await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`)
   }
   export async function withOrgContext<T>(orgId: string, fn: (tx: typeof db) => Promise<T>): Promise<T> {
     return db.transaction(async (tx) => {
       await setCurrentOrgId(tx, orgId)
       return fn(tx)
     })
   }
   ```
2. Dodaj error jeśli nie w transakcji (check via `pg_current_xact_id()`)
3. Utwórz `packages/db/rls-context.integration.test.ts` — verify `current_setting('app.current_org_id')` after call
4. Utwórz supabase browser client singleton `apps/web/lib/supabase/client.ts` + server client `apps/web/lib/supabase/server.ts`
5. Commit

## Files
**Create:** `packages/db/rls-context.ts`, `packages/db/rls-context.integration.test.ts`, `apps/web/lib/supabase/client.ts`, `apps/web/lib/supabase/server.ts`

## Done when
- `vitest packages/db/rls-context.integration.test.ts` PASS — SET LOCAL verifiable
- `pnpm test:smoke` green

## Rollback
`git rm packages/db/rls-context.ts`
```

### Test gate (planning summary)
- **Integration:** `vitest packages/db/rls-context.integration.test.ts` — SET LOCAL verifiable
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm packages/db/rls-context.ts`

---

## T-00b-M01 — Main Table migration (69 typed Apex cols + ext/private JSONB)

**Type:** T1-schema
**Context budget:** ~55k tokens
**Est time:** 90 min
**Parent feature:** 00-b db scaffold (gap-fill per Decision #1)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000, T-00h-001]
- **Downstream (will consume this):** [T-00d-002, T-00e-002, T-00i-011]
- **Parallel (can run concurrently):** [T-00f-001, T-00g-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline + DeptColumns migrations applied
**WHEN** migration `015-main-table-69-cols.sql` runs
**THEN** `main_table` has 69 typed Apex columns + `ext_jsonb JSONB` + `private_jsonb JSONB` + `schema_version INT NOT NULL DEFAULT 1` + composite index `(tenant_id, created_at)` + GIN index on `ext_jsonb`

### ACP Prompt
```
# Task T-00b-M01 — Main Table migration 69 typed Apex cols

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_foundation/01-NPD-PRD.md` → znajdź sekcję `## §5` — Main Table 69 columns spec z pełnymi typami
- Sprawdź aktualny stan migrations: `ls drizzle/migrations/` — użyj najwyższego numeru + 1

## Twoje zadanie
Stwórz migration dla `main_table` z 69 typed Apex columns per §5 NPD PRD + ext_jsonb + private_jsonb + schema_version. Użyj Drizzle ORM (nie raw CREATE TABLE).

## Implementacja
1. Przeczytaj §5 NPD PRD — wypisz wszystkie 69 kolumn z typami (do uzycia inline w Drizzle schema)
2. Utwórz `packages/db/schema/main-table.ts` — Drizzle table definition ze wszystkimi 69 cols + `ext_jsonb: jsonb()`, `private_jsonb: jsonb()`, `schema_version: integer().notNull().default(1)` + R13 cols
3. Generuj migration: `pnpm drizzle-kit generate` → `drizzle/migrations/015-main-table-69-cols.sql`
4. Dodaj indexes: `CREATE INDEX ON main_table(tenant_id, created_at)` + `CREATE INDEX ON main_table USING gin(ext_jsonb)`
5. Integration test: `vitest drizzle/migrations/015-main-table.integration.test.ts` — column count = 69+ext+private+schema_ver+R13, GIN index exists

## Files
**Create:** `packages/db/schema/main-table.ts`, `drizzle/migrations/015-main-table-69-cols.sql`

## Done when
- `vitest drizzle/migrations/015-main-table.integration.test.ts` PASS — column count, types, indexes
- `pnpm test:migrations` green

- `pnpm test:smoke` green
## Rollback
`DROP TABLE main_table CASCADE` + remove migration file
```

### Test gate (planning summary)
- **Integration:** `vitest drizzle/migrations/015-main-table.integration.test.ts` — column count, types, GIN index
- **CI gate:** `pnpm test:migrations` green

### Rollback
`DROP TABLE main_table CASCADE`

---

## §3 — Sub-module 00-c — Auth + session + org_id middleware

---

## T-00c-001 — Supabase Auth schema migration + `users` FK

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-c auth
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000]
- **Downstream (will consume this):** [T-00c-002, T-00c-003]
- **Parallel (can run concurrently):** [T-00d-001]

### GIVEN / WHEN / THEN
**GIVEN** Supabase local has `auth.users` table
**WHEN** migration `003-auth-users.sql` runs
**THEN** `public.users` has FK to `auth.users.id` ON DELETE CASCADE + `email` column mirrored at insert via trigger `on_auth_user_created`

### ACP Prompt
```
# Task T-00c-001 — Supabase Auth schema migration + users FK

## Twoje zadanie
Połącz public.users z auth.users via FK + trigger lustrzany email.

## Implementacja
1. Utwórz drizzle/migrations/003-auth-users.sql: ALTER TABLE public.users ADD COLUMN auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE; CREATE UNIQUE INDEX ON public.users(auth_user_id); CREATE OR REPLACE FUNCTION public.on_auth_user_created() RETURNS trigger AS $$ BEGIN INSERT INTO public.users(auth_user_id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (auth_user_id) DO NOTHING; RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER; CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_created();
2. Aktualizuj packages/db/schema/baseline.ts — dodaj authUserId + email do users table
3. Integration test: insert via supabase client → assert public.users row exists
4. pnpm migrate

## Files
**Create:** `drizzle/migrations/003-auth-users.sql`
**Modify:** `packages/db/schema/baseline.ts`

## Done when
- `vitest tests/auth-users.integration.test.ts` PASS
- `pnpm test:smoke` green

## Rollback
`DROP TRIGGER on_auth_user_created ON auth.users; DROP FUNCTION public.on_auth_user_created()`
```

### Test gate (planning summary)
- **Integration:** `vitest tests/auth-users.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TRIGGER on_auth_user_created ON auth.users`

---

## T-00c-002 — Email+password signup/login Server Actions

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-001, T-00b-E01, T-00f-002]
- **Downstream (will consume this):** [T-00c-004, T-00c-005]
- **Parallel (can run concurrently):** [T-00c-003]

### GIVEN / WHEN / THEN
**GIVEN** auth schema + outbox helper exist
**WHEN** `signupAction({ email, password })` or `loginAction` called
**THEN** GoTrue call succeeds, Supabase session cookie set, `user.invited` outbox event emitted, bad inputs return typed Zod errors

### ACP Prompt
```
# Task T-00c-002 — Email+password signup/login Server Actions

## Context
- `lib/outbox/events.enum.ts` — EventType.USER_INVITED = 'user.invited'

## Twoje zadanie
Utwórz apps/web/actions/auth/signup.ts + login.ts. Emit outbox events. Typed Zod errors na bad input.

## Implementacja
1. Utwórz apps/web/actions/auth/schema.ts — shared Zod: z.object({ email: z.string().email(), password: z.string().min(8) })
2. Utwórz apps/web/actions/auth/signup.ts z 'use server' — GoTrue signUp + insertOutboxEvent(EventType.USER_INVITED) + redirect('/dashboard') + return { error } on fail
3. Utwórz apps/web/actions/auth/login.ts — signInWithPassword + cookie via cookies() + EventType USER_LOGGED_IN (dodaj do enum jeśli nie istnieje)
4. Unit test: mock GoTrue, assert cookie + outbox event
5. Integration test: real Supabase local, assert session

## Files
**Create:** `apps/web/actions/auth/signup.ts`, `apps/web/actions/auth/login.ts`, `apps/web/actions/auth/schema.ts`, tests

## Done when
- `vitest apps/web/actions/auth/signup.test.ts` PASS
- `vitest apps/web/actions/auth/login.integration.test.ts` PASS
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/actions/auth/`
```

### Test gate (planning summary)
- **Unit + Integration:** signup/login Server Actions
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm -r apps/web/actions/auth/`

---

## T-00c-003 — Next.js middleware: extract session + `app.current_org_id`

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-001, T-00b-006]
- **Downstream (will consume this):** [T-00d-002, T-00d-003, every business route]
- **Parallel (can run concurrently):** [T-00c-002]

### GIVEN / WHEN / THEN
**GIVEN** request with Supabase session cookie
**WHEN** middleware.ts resolves
**THEN** user + active `org_id` attached via `x-org-id` header; unauthenticated → redirect `/login`

### ACP Prompt
```
# Task T-00c-003 — Next.js middleware: session + org_id

## Twoje zadanie
Utwórz apps/web/middleware.ts — extract session, resolve org_id, set x-org-id header.

## Implementacja
1. Utwórz apps/web/middleware.ts: import { createServerClient } from '@supabase/ssr'; resolve session → if no session redirect('/login'); resolve active_org_id from cookie or first user_tenant row; set response.headers('x-org-id', orgId)
2. config.matcher: ['/((?!_next|login|api/health).*)']
3. Utwórz apps/web/lib/get-first-org-id.ts — query user_tenants WHERE user_id = $1 LIMIT 1
4. Unit test: unauthenticated → redirect /login
5. Integration test: authenticated request has x-org-id header

## Files
**Create:** `apps/web/middleware.ts`, `apps/web/lib/get-first-org-id.ts`, tests

## Done when
- `vitest apps/web/middleware.test.ts` PASS — redirect on unauthenticated
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/middleware.ts`
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/middleware.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/middleware.ts`

---

## T-00c-004 — Login page UI (shadcn Form + RHF + Zod)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 00-c auth
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-002, T-00a-003]
- **Downstream (will consume this):** [T-00c-006]
- **Parallel (can run concurrently):** [T-00c-005]

### GIVEN / WHEN / THEN
**GIVEN** shadcn installed + login action exists
**WHEN** user navigates `/login`
**THEN** form renders; Zod validates; error/loading states show; submit invokes loginAction

### ACP Prompt
```
# Task T-00c-004 — Login page UI

## Twoje zadanie
Utwórz /login route z shadcn Form + useForm(zodResolver) + loginAction wire.

## Implementacja
1. Utwórz apps/web/app/(auth)/login/page.tsx — RSC import LoginForm
2. Utwórz apps/web/components/auth/login-form.tsx 'use client': useForm({ resolver: zodResolver(z.object({ email: z.string().email(), password: z.string().min(8) })) }); Form, FormField, FormLabel, FormControl, FormMessage, Input, Button shadcn components; wire loginAction via useActionState; loading: Button disabled + Skeleton; error: Alert variant="destructive"
3. RTL test: renders form, shows error on bad email, button disabled during pending

## Files
**Create:** `apps/web/app/(auth)/login/page.tsx`, `apps/web/components/auth/login-form.tsx`, RTL test

## Prototype reference
Brak prototypu.
Translation checklist:
- [ ] useForm + zodResolver (NOT useState)
- [ ] Wire loginAction via useActionState
- [ ] Loading: Button disabled + Skeleton
- [ ] Error: Alert variant="destructive"

## Done when
- RTL test PASS — renders form + error state + loading
- `pnpm --filter web build` green

- `pnpm test:smoke` green
## Rollback
`git rm -r apps/web/app/(auth)/login apps/web/components/auth/login-form.tsx`
```

### Test gate (planning summary)
- **Unit:** RTL form + error + loading
- **CI gate:** `pnpm --filter web build` green

### Rollback
`git rm -r apps/web/app/(auth)/login`

---

## T-00c-005 — Logout Server Action + session invalidation

**Type:** T2-api
**Context budget:** ~30k tokens
**Est time:** 25 min
**Parent feature:** 00-c auth
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-002]
- **Downstream (will consume this):** [T-00c-006]
- **Parallel (can run concurrently):** [T-00c-004]

### GIVEN / WHEN / THEN
**GIVEN** authenticated session
**WHEN** `logoutAction()` runs
**THEN** cookie cleared, GoTrue session revoked, `user.logged_out` outbox event emitted

### ACP Prompt
```
# Task T-00c-005 — Logout Server Action

## Twoje zadanie
Utwórz apps/web/actions/auth/logout.ts — signOut + clear cookie + emit outbox event.

## Implementacja
1. Utwórz apps/web/actions/auth/logout.ts 'use server': supabase.auth.signOut(); clear active_org_id cookie; insertOutboxEvent(EventType.USER_LOGGED_OUT); redirect('/login')
2. Jeśli EventType.USER_LOGGED_OUT nie istnieje — dodaj do lib/outbox/events.enum.ts
3. Unit test: signOut called + cookie cleared + outbox event emitted

## Files
**Create:** `apps/web/actions/auth/logout.ts`, test

## Done when
- `vitest apps/web/actions/auth/logout.test.ts` PASS
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/actions/auth/logout.ts`
```

### Test gate (planning summary)
- **Unit:** signOut + cookie clear + outbox
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/actions/auth/logout.ts`

---

## T-00c-006 — E2E: login → middleware sets org_id → logout

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-c auth
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-003, T-00c-004, T-00c-005, T-00i-005]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** seeded apex-baseline DB (jane@apex.com / test1234)
**WHEN** Playwright: navigate `/login` → submit creds → call `/api/whoami` → logout
**THEN** whoami returns userId + orgId; post-logout redirects `/login`

### ACP Prompt
```
# Task T-00c-006 — E2E login → whoami → logout

## Twoje zadanie
E2E spec e2e/auth.spec.ts + /api/whoami route. 3-krokowy flow.

## Implementacja
1. Utwórz apps/web/app/api/whoami/route.ts — GET: reads session + x-org-id header → return { userId, orgId, email }
2. Utwórz e2e/auth.spec.ts: navigate /login; fill email='jane@apex.com', password='test1234'; click submit; expect URL /dashboard; GET /api/whoami → orgId truthy; click [data-testid=logout]; expect URL /login
3. apex-baseline seed musi zawierać jane@apex.com z password test1234 (Supabase auth user + public.users row)
4. pnpm test:e2e

## Files
**Create:** `e2e/auth.spec.ts`, `apps/web/app/api/whoami/route.ts`

## Done when
- `playwright e2e/auth.spec.ts` PASS — 3 assertions
- `pnpm test:smoke` green

## Rollback
`git rm e2e/auth.spec.ts apps/web/app/api/whoami/route.ts`
```

### Test gate (planning summary)
- **E2E:** `playwright e2e/auth.spec.ts` — 3 steps
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm e2e/auth.spec.ts`

---

## §4 — Sub-module 00-d — RLS baseline

---

## T-00d-001 — RLS policy generator helper (`policyFor(table)`)

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000]
- **Downstream (will consume this):** [T-00d-002]
- **Parallel (can run concurrently):** [T-00c-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline tables exist with `tenant_id UUID NOT NULL`
**WHEN** `policyFor('fa')` called
**THEN** emits `ENABLE RLS` + 4 policy SQL fragments using `fn_current_org()::uuid`

### ACP Prompt
```
# Task T-00d-001 — RLS policy generator helper policyFor(table)

## Twoje zadanie
Utwórz packages/db/rls/policy-for.ts generujący 4 policy statements. Policies używają fn_current_org() (LEAKPROOF wrapper).

## Implementacja
1. Utwórz packages/db/rls/policy-for.ts: export function policyFor(table: string): string — returns 5 SQL statements: ENABLE RLS + SELECT USING (tenant_id = fn_current_org()) + INSERT WITH CHECK + UPDATE USING + DELETE USING
2. Unit test dla 2 tabel asserting SQL shape (ENABLE RLS + 4 policies)
3. Wire do migration helper script

## Files
**Create:** `packages/db/rls/policy-for.ts`, `packages/db/rls/policy-for.test.ts`

## Done when
- `vitest packages/db/rls/policy-for.test.ts` PASS — SQL shape correct, 4 policies per table
- `pnpm test:smoke` green

## Rollback
`git rm packages/db/rls/policy-for.ts`
```

### Test gate (planning summary)
- **Unit:** `vitest policy-for.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm packages/db/rls/policy-for.ts`

---

## T-00d-002 — Migration `004-rls-baseline.sql` (enable RLS on 7 baseline tables)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00d-001, T-00c-003]
- **Downstream (will consume this):** [T-00d-004]
- **Parallel (can run concurrently):** [T-00d-003]

### GIVEN / WHEN / THEN
**GIVEN** baseline tables + org_id setter exist
**WHEN** migration runs
**THEN** every baseline table has `ENABLE RLS` + 4 policies; `app_role` cannot bypass RLS

### ACP Prompt
```
# Task T-00d-002 — Migration 004-rls-baseline.sql

## Twoje zadanie
Wygeneruj drizzle/migrations/004-rls-baseline.sql — policyFor() dla 7 tabel + app_role Postgres role.

## Implementacja
1. Użyj policyFor() z T-00d-001 dla: tenants, users, user_tenants, roles, user_roles, modules, organization_modules
2. Dodaj: CREATE ROLE app_role NOINHERIT; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
3. Integration test: withOrgContext(orgA.id) → select on each table returns only orgA rows
4. Dodaj DATABASE_URL_APP_ROLE do .env.example

## Files
**Create:** `drizzle/migrations/004-rls-baseline.sql`
**Modify:** `supabase/config.toml`

## Done when
- `vitest tests/rls/rls-baseline.integration.test.ts` PASS — 7 tables isolated
- `pnpm test:smoke` green

## Rollback
`DROP POLICY` per table; `DROP ROLE app_role`
```

### Test gate (planning summary)
- **Integration:** 7 tables isolated per tenant
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP POLICY` per table

---

## T-00d-003 — LEAKPROOF SECURITY DEFINER wrappers

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-d RLS
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00d-001]
- **Downstream (will consume this):** [T-00d-004]
- **Parallel (can run concurrently):** [T-00d-002]

### GIVEN / WHEN / THEN
**GIVEN** policies exist
**WHEN** migration adds `fn_current_org() RETURNS uuid SECURITY DEFINER LEAKPROOF`
**THEN** policies rerouted to use wrapper; planner safely pushes down across views (R3)

### ACP Prompt
```
# Task T-00d-003 — LEAKPROOF SECURITY DEFINER fn_current_org()

## Twoje zadanie
Utwórz drizzle/migrations/005-rls-wrappers.sql z fn_current_org() LEAKPROOF. Przepnij policies na wrapper.

## Implementacja
1. Utwórz drizzle/migrations/005-rls-wrappers.sql: CREATE OR REPLACE FUNCTION fn_current_org() RETURNS uuid LANGUAGE sql STABLE LEAKPROOF SECURITY DEFINER AS $$ SELECT current_setting('app.current_org_id', true)::uuid $$;
2. Przerób 004-rls-baseline.sql policies żeby używały fn_current_org() zamiast current_setting(...) bezpośrednio
3. Integration test: verify planner uses wrapper

## Files
**Create:** `drizzle/migrations/005-rls-wrappers.sql`

## Done when
- `vitest tests/rls/rls-wrappers.integration.test.ts` PASS
- `pnpm test:smoke` green

## Rollback
`DROP FUNCTION fn_current_org()`
```

### Test gate (planning summary)
- **Integration:** `vitest tests/rls/rls-wrappers.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP FUNCTION fn_current_org()`

---

## T-00d-004 — Cross-tenant leak regression suite

**Type:** T4-wiring+test
**Context budget:** ~65k tokens
**Est time:** 60 min
**Parent feature:** 00-d RLS
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00d-002, T-00d-003, T-00b-004]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00e-004]

### GIVEN / WHEN / THEN
**GIVEN** 2 seeded tenants (`multi-tenant-3` snapshot)
**WHEN** suite runs SELECT/INSERT/UPDATE/DELETE on every baseline table under org A context
**THEN** zero rows belonging to org B ever returned or mutated

### ACP Prompt
```
# Task T-00d-004 — Cross-tenant leak regression suite

## Twoje zadanie
Utwórz tests/rls/cross-tenant-leak.integration.test.ts — dla każdej z 7 baseline tabel, 4 operacje pod org A, assert B untouched.

## Implementacja
1. applySnapshot('multi-tenant-3') — 3 tenants z distinct rows per table
2. For each table ['tenants','users','user_tenants','roles','user_roles','modules','organization_modules']: withOrgContext(orgA.id) → select → assert all tenantId === orgA.id; attempt INSERT with tenantId=orgB.id → must throw RLS violation
3. Include "would-leak" scenario (superuser connection, proves RLS was preventing)
4. Add CI gate: pnpm test:rls

## Files
**Create:** `tests/rls/cross-tenant-leak.integration.test.ts`

## Done when
- `vitest tests/rls/cross-tenant-leak.integration.test.ts` PASS — 7 tables × 4 ops
- `pnpm test:rls` green

- `pnpm test:smoke` green
## Rollback
Remove test — but this is a permanent gate, do not remove
```

### Test gate (planning summary)
- **Integration:** 7 tables × 4 ops clean
- **CI gate:** `pnpm test:rls` green

### Rollback
Remove test (permanent gate)

---

## T-00d-005 — `impersonating_as` flag plumbing (session + audit)

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-d RLS
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-003, T-00e-002]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00d-004]

### GIVEN / WHEN / THEN
**GIVEN** superadmin session
**WHEN** POST `/api/impersonate` with `target_org_id`
**THEN** `impersonating_as` in session; audit logs `actor` + `impersonating_as`; RLS not bypassed

### ACP Prompt
```
# Task T-00d-005 — impersonating_as flag plumbing

## Context
- lib/rbac/permissions.enum.ts — Permission.IMPERSONATE_TENANT = 'impersonate.tenant'

## Twoje zadanie
Utwórz apps/web/actions/impersonate.ts + extend withOrgContext z impersonatingAs.

## Implementacja
1. Utwórz apps/web/actions/impersonate.ts 'use server': RBAC guard Permission.IMPERSONATE_TENANT; signed cookie impersonating_as=targetOrgId; insertAuditLog z impersonating_as
2. Extend packages/db/rls-context.ts withOrgContext: 3rd arg impersonatingAs?; SET LOCAL app.impersonating_as
3. Extend fn_audit_trigger(): log current_setting('app.impersonating_as', true)
4. Integration test: audit row has actor + impersonating_as fields populated

## Files
**Create:** `apps/web/actions/impersonate.ts`, test
**Modify:** `packages/db/rls-context.ts`

## Done when
- `vitest apps/web/actions/impersonate.integration.test.ts` PASS — audit row has both fields
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/actions/impersonate.ts`; revert rls-context.ts
```

### Test gate (planning summary)
- **Integration:** audit row has actor + impersonating_as
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/actions/impersonate.ts`

---

## §5 — Sub-module 00-e — Audit log infrastructure

---

## T-00e-001 — Migration `006-audit-log.sql` (partitioned append-only)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000]
- **Downstream (will consume this):** [T-00e-002, T-00e-003]
- **Parallel (can run concurrently):** [T-00c-001, T-00d-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline applied
**WHEN** `006-audit-log.sql` runs
**THEN** `audit_log` partitioned by month on `created_at`, append-only (REVOKE UPDATE/DELETE from app_role), columns: `tenant_id`, `actor`, `impersonating_as`, `entity_type`, `entity_id`, `before_jsonb`, `after_jsonb`, `app_version`

### ACP Prompt
```
# Task T-00e-001 — Migration 006-audit-log.sql partitioned

## Twoje zadanie
Utwórz audit_log partitioned by RANGE(created_at). REVOKE UPDATE/DELETE od app_role.

## Implementacja
1. Utwórz drizzle/migrations/006-audit-log.sql: CREATE TABLE audit_log (id BIGSERIAL, tenant_id UUID NOT NULL, actor UUID, impersonating_as UUID, entity_type TEXT NOT NULL, entity_id UUID, before_jsonb JSONB, after_jsonb JSONB, app_version TEXT, created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL) PARTITION BY RANGE (created_at); CREATE 3 initial monthly partitions (current month + 2 future); REVOKE UPDATE, DELETE ON audit_log FROM app_role; CREATE INDEX ON audit_log(tenant_id, entity_type, created_at)
2. Aktualizuj packages/db/schema/audit.ts — Drizzle types
3. Integration test: INSERT ok, UPDATE throws permission denied

## Files
**Create:** `drizzle/migrations/006-audit-log.sql`
**Modify:** `packages/db/schema/audit.ts`

## Done when
- `vitest tests/audit/audit-log.integration.test.ts` PASS — insert OK, update denied
- `pnpm test:smoke` green

## Rollback
`DROP TABLE audit_log CASCADE`
```

### Test gate (planning summary)
- **Integration:** insert OK, update denied
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TABLE audit_log CASCADE`

---

## T-00e-002 — Generic audit trigger factory (`install_audit_trigger(table)`)

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00e-001]
- **Downstream (will consume this):** [T-00e-003]
- **Parallel (can run concurrently):** [T-00e-004]

### GIVEN / WHEN / THEN
**GIVEN** audit table exists
**WHEN** `install_audit_trigger('fa')` runs
**THEN** INSERT/UPDATE/DELETE on `fa` emits audit_log row with diff JSONB, actor from `current_setting('app.current_actor_id', true)`

### ACP Prompt
```
# Task T-00e-002 — Generic audit trigger factory

## Twoje zadanie
Utwórz PL/pgSQL fn_audit_trigger() + install_audit_trigger(regclass) helper. Install na baseline tables.

## Implementacja
1. Utwórz drizzle/migrations/007-audit-triggers.sql: fn_audit_trigger() — inserts audit_log row with before/after JSONB (to_jsonb(OLD)/to_jsonb(NEW)), entity_type=TG_TABLE_NAME, actor=current_setting('app.current_actor_id',true)::uuid; install_audit_trigger(regclass) — executes format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger()', tbl, tbl)
2. Call install_audit_trigger() pro každé z 7 baseline tabulek
3. Integration test: INSERT on users → audit_log row exists with correct entity_type

## Files
**Create:** `drizzle/migrations/007-audit-triggers.sql`

## Done when
- `vitest tests/audit/audit-trigger.integration.test.ts` PASS — trigger fires on insert
- `pnpm test:smoke` green

## Rollback
`DROP TRIGGER audit_* ON <table>; DROP FUNCTION fn_audit_trigger()`
```

### Test gate (planning summary)
- **Integration:** trigger fires → audit row
- **CI gate:** `pnpm test:smoke` green

### Rollback
Drop triggers + function

---

## T-00e-003 — `audit.recorded` outbox emission hook

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00e-002, T-00f-002, T-00b-E02]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00e-004]

### GIVEN / WHEN / THEN
**GIVEN** audit triggers + outbox helper exist
**WHEN** audit row inserted
**THEN** trigger also calls outbox INSERT for `audit.recorded` in same txn — atomically

### ACP Prompt
```
# Task T-00e-003 — audit.recorded outbox emission hook

## Context
- lib/outbox/events.enum.ts — EventType.AUDIT_RECORDED = 'audit.recorded'

## Twoje zadanie
Rozszerz fn_audit_trigger() o INSERT do outbox_events w tej samej transakcji.

## Implementacja
1. Utwórz drizzle/migrations/008-audit-outbox.sql — ALTER FUNCTION fn_audit_trigger(): dodaj po audit_log INSERT: INSERT INTO outbox_events(tenant_id, event_type, aggregate_type, aggregate_id, payload, transaction_id) VALUES (COALESCE(NEW.tenant_id,OLD.tenant_id), 'audit.recorded', TG_TABLE_NAME, COALESCE(NEW.id,OLD.id), jsonb_build_object('op',TG_OP), gen_random_uuid())
2. ROLLBACK test: verify both audit + outbox rolled back together
3. Integration test: INSERT on fa → audit row + outbox row same txn

## Files
**Modify:** `drizzle/migrations/008-audit-outbox.sql`

## Done when
- `vitest tests/audit/audit-outbox.integration.test.ts` PASS — both rows present, both rolled back on ROLLBACK
- `pnpm test:smoke` green

## Rollback
Revert fn_audit_trigger — remove outbox INSERT
```

### Test gate (planning summary)
- **Integration:** audit + outbox atomic
- **CI gate:** `pnpm test:smoke` green

### Rollback
Revert fn_audit_trigger

---

## T-00e-004 — Audit query API (`GET /api/audit?entity=…`)

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 45 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00e-002, T-00b-E01]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00e-003, T-00d-004]

### GIVEN / WHEN / THEN
**GIVEN** audit_log populated
**WHEN** user with `audit.read` calls `GET /api/audit?entity_type=fa&entity_id=<uuid>`
**THEN** returns diff timeline JSON scoped by RLS, max 500 rows

### ACP Prompt
```
# Task T-00e-004 — Audit query API GET /api/audit

## Context
- lib/rbac/permissions.enum.ts — Permission.AUDIT_READ = 'audit.read'

## Twoje zadanie
Utwórz apps/web/app/api/audit/route.ts — GET z Zod params + RBAC guard audit.read + pagination 500.

## Implementacja
1. Utwórz route.ts: Zod parse { entity_type: z.string(), entity_id: z.string().uuid().optional(), limit: z.coerce.number().max(500).default(50), offset: z.coerce.number().default(0) }
2. RBAC guard: throw 403 jeśli brak audit.read
3. withOrgContext: query audit_log WHERE entity_type = $1 AND (entity_id = $2 OR $2 IS NULL) ORDER BY created_at DESC LIMIT $3 OFFSET $4
4. Integration test: tenant isolation (org B rows not returned) + RBAC (403 without permission)

## Files
**Create:** `apps/web/app/api/audit/route.ts`, tests

## Done when
- `vitest apps/web/app/api/audit/audit.integration.test.ts` PASS — tenant isolation + RBAC
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/app/api/audit/route.ts`
```

### Test gate (planning summary)
- **Integration:** tenant isolation + RBAC
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/app/api/audit/route.ts`

---

## T-00e-005 — Retention policy config + partition maintenance cron

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-e audit
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00e-001, T-00f-003]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00e-004]

### GIVEN / WHEN / THEN
**GIVEN** audit table partitioned by month
**WHEN** monthly cron runs
**THEN** future partition pre-created; partitions older than config (default 7y = 84 months) DETACHED (not dropped)

### ACP Prompt
```
# Task T-00e-005 — Retention policy + partition maintenance cron

## Twoje zadanie
Utwórz audit_retention_config table + partition-maintenance.ts script + pg-boss monthly schedule.

## Implementacja
1. Utwórz drizzle/migrations/009-audit-retention.sql: CREATE TABLE audit_retention_config (entity_type TEXT PRIMARY KEY, retain_months INT NOT NULL DEFAULT 84); INSERT INTO audit_retention_config VALUES ('default', 84)
2. Utwórz packages/db/scripts/partition-maintenance.ts: pre-create next 3 monthly partitions; DETACH (NOT DROP) partitions older than retain_months; emit outbox event 'maintenance.partitions_rotated'
3. Schedule via pg-boss: boss.schedule('partition-maintenance', '0 2 1 * *', {})
4. Integration test z mocked dates

## Files
**Create:** `packages/db/scripts/partition-maintenance.ts`, `drizzle/migrations/009-audit-retention.sql`

## Done when
- `vitest packages/db/scripts/partition-maintenance.test.ts` PASS
- `pnpm test:smoke` green

## Rollback
Disable cron; manually ATTACH detached partitions
```

### Test gate (planning summary)
- **Integration:** partition maintenance test
- **CI gate:** `pnpm test:smoke` green

### Rollback
Disable cron

---

## §6 — Sub-module 00-f — Outbox pattern runtime

---

## T-00f-001 — Migration `010-outbox-events.sql` + DLQ table

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000]
- **Downstream (will consume this):** [T-00f-002]
- **Parallel (can run concurrently):** [T-00e-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline migration applied
**WHEN** `010-outbox-events.sql` runs
**THEN** `outbox_events` (id BIGSERIAL, tenant_id, event_type, aggregate_type, aggregate_id, payload JSONB, transaction_id UUID UNIQUE, created_at, consumed_at, attempt_count) + `outbox_dlq` + partial index on unconsumed

### ACP Prompt
```
# Task T-00f-001 — Migration 010-outbox-events.sql + DLQ

## Twoje zadanie
Utwórz outbox_events + outbox_dlq tables. Partial index na consumed_at IS NULL.

## Implementacja
1. Utwórz drizzle/migrations/010-outbox-events.sql: CREATE TABLE outbox_events (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL, event_type TEXT NOT NULL, aggregate_type TEXT NOT NULL, aggregate_id UUID, payload JSONB, transaction_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(), created_at TIMESTAMPTZ DEFAULT NOW(), consumed_at TIMESTAMPTZ, attempt_count INT NOT NULL DEFAULT 0); CREATE INDEX ON outbox_events(tenant_id, created_at) WHERE consumed_at IS NULL; CREATE TABLE outbox_dlq (LIKE outbox_events INCLUDING ALL, failed_at TIMESTAMPTZ DEFAULT NOW(), error_message TEXT)
2. Drizzle types w packages/db/schema/outbox.ts
3. Integration test: insert + verify partial index used in EXPLAIN

## Files
**Create:** `drizzle/migrations/010-outbox-events.sql`, `packages/db/schema/outbox.ts`

## Done when
- `vitest tests/outbox/outbox-events.integration.test.ts` PASS — schema + index
- `pnpm test:smoke` green

## Rollback
`DROP TABLE outbox_events, outbox_dlq`
```

### Test gate (planning summary)
- **Integration:** schema + partial index
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TABLE outbox_events, outbox_dlq`

---

## T-00f-002 — `insertOutboxEvent` helper with UUID v7 transaction_id

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-001, T-00b-E02]
- **Downstream (will consume this):** [T-00f-003, T-00e-003]
- **Parallel (can run concurrently):** [T-00f-004]

### GIVEN / WHEN / THEN
**GIVEN** outbox migration applied
**WHEN** `insertOutboxEvent(tx, input)` called
**THEN** row inserted in same txn; UUID v7 generated if absent; duplicate `transaction_id` is a no-op

### ACP Prompt
```
# Task T-00f-002 — insertOutboxEvent helper UUID v7

## Context
- lib/outbox/events.enum.ts — EventType union

## Twoje zadanie
Utwórz packages/outbox/insert-event.ts z idempotent ON CONFLICT DO NOTHING via transaction_id UUID v7.

## Implementacja
1. pnpm add uuidv7 --filter @monopilot/outbox
2. Utwórz packages/outbox/insert-event.ts: interface InsertOutboxEventInput { tenantId, eventType: EventType, aggregateType, aggregateId?, payload, transactionId? }; export async function insertOutboxEvent(tx, input): uuid v7 if no transactionId; db.insert(outboxEvents).values({...}).onConflictDoNothing({ target: outboxEvents.transactionId })
3. Unit test: duplicate transactionId → no-op (count stays 1)
4. Integration test: idempotent replay

## Files
**Create:** `packages/outbox/insert-event.ts`, `packages/outbox/insert-event.test.ts`

## Done when
- `vitest packages/outbox/insert-event.test.ts` PASS — idempotent
- `pnpm test:smoke` green

## Rollback
`git rm packages/outbox/insert-event.ts`
```

### Test gate (planning summary)
- **Unit + Integration:** idempotent on duplicate transactionId
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm packages/outbox/insert-event.ts`

---

## T-00f-003 — pg-boss worker config + queue registration

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-001]
- **Downstream (will consume this):** [T-00f-005, T-00e-005]
- **Parallel (can run concurrently):** [T-00f-004]

### GIVEN / WHEN / THEN
**GIVEN** outbox table exists
**WHEN** `pnpm worker` starts
**THEN** pg-boss polls outbox_events WHERE consumed_at IS NULL; dispatches by event_type; marks consumed; retry 5/30/120/720/1440 min; after 5 failures → outbox_dlq

### ACP Prompt
```
# Task T-00f-003 — pg-boss worker config + queue registration

## Twoje zadanie
Utwórz packages/outbox/worker.ts + apps/worker/index.ts. Retry policy exponential.

## Implementacja
1. pnpm add pg-boss --filter @monopilot/outbox
2. Utwórz packages/outbox/worker.ts: new PgBoss({ connectionString }); boss.work(eventType, { batchSize: 10, pollingIntervalSeconds: 5 }, handler); retry: { retryLimit: 5, retryDelay: 300, retryBackoff: true }
3. DLQ: on fail beyond retryLimit → INSERT INTO outbox_dlq SELECT *, NOW() FROM outbox_events WHERE id = job.id
4. Utwórz apps/worker/index.ts — entry point importujący handlers per EventType
5. Integration test: 8 success + 2 poison → 8 consumed, 2 in DLQ

## Files
**Create:** `packages/outbox/worker.ts`, `apps/worker/index.ts`, integration test

## Done when
- `vitest tests/outbox/outbox-worker.integration.test.ts` PASS
- `pnpm test:smoke` green

## Rollback
Stop worker
```

### Test gate (planning summary)
- **Integration:** consumed + DLQ path
- **CI gate:** `pnpm test:smoke` green

### Rollback
Stop worker

---

## T-00f-004 — Outbox retry policy config table + backoff formula

**Type:** T1-schema
**Context budget:** ~30k tokens
**Est time:** 35 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-001]
- **Downstream (will consume this):** [T-00f-003]
- **Parallel (can run concurrently):** [T-00f-002]

### GIVEN / WHEN / THEN
**GIVEN** outbox + DLQ tables exist
**WHEN** migration adds `outbox_retry_policy(event_type, max_attempts, backoff_schedule TEXT[])`
**THEN** default policy seeded for every EventType from events.enum.ts

### ACP Prompt
```
# Task T-00f-004 — Outbox retry policy config table

## Context
- lib/outbox/events.enum.ts — ALL_EVENTS array

## Twoje zadanie
Utwórz 011-outbox-retry.sql z outbox_retry_policy table + default policy per ALL_EVENTS.

## Implementacja
1. Utwórz drizzle/migrations/011-outbox-retry.sql: CREATE TABLE outbox_retry_policy (event_type TEXT PRIMARY KEY, max_attempts INT NOT NULL DEFAULT 5, backoff_schedule TEXT[] NOT NULL DEFAULT ARRAY['5m','30m','2h','12h','24h']); INSERT default rows per ALL_EVENTS (8 entries) ON CONFLICT DO NOTHING
2. Drizzle types
3. Integration test: 8 default rows present; FK respected

## Files
**Create:** `drizzle/migrations/011-outbox-retry.sql`

## Done when
- `vitest tests/outbox/outbox-retry.integration.test.ts` PASS — 8 default rows
- `pnpm test:smoke` green

## Rollback
`DROP TABLE outbox_retry_policy`
```

### Test gate (planning summary)
- **Integration:** 8 default rows, FK respected
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TABLE outbox_retry_policy`

---

## T-00f-005 — Outbox healthcheck endpoint

**Type:** T2-api
**Context budget:** ~30k tokens
**Est time:** 30 min
**Parent feature:** 00-f outbox
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-003]
- **Downstream (will consume this):** [T-00i-008]
- **Parallel (can run concurrently):** [T-00f-006]

### GIVEN / WHEN / THEN
**GIVEN** pg-boss worker running
**WHEN** `GET /api/health/outbox`
**THEN** 200 iff backlog < OUTBOX_BACKLOG_THRESHOLD (default 100) AND last consumed < 60s ago; 503 otherwise

### ACP Prompt
```
# Task T-00f-005 — Outbox healthcheck endpoint GET /api/health/outbox

## Twoje zadanie
Utwórz apps/web/app/api/health/outbox/route.ts — backlog count + last_consumed check.

## Implementacja
1. Utwórz route.ts: query COUNT(*) FROM outbox_events WHERE consumed_at IS NULL → backlog; query MAX(consumed_at) → lastConsumed; backlogOk = count < (env.OUTBOX_BACKLOG_THRESHOLD ?? 100); consumedOk = lastConsumed && (Date.now() - lastConsumed) < 60_000; return 503 with { status: 'degraded' } if either fails; 200 { status: 'ok', backlog: count } if both ok
2. Unit test: 503 when backlog > threshold; 200 when healthy

## Files
**Create:** `apps/web/app/api/health/outbox/route.ts`, test

## Done when
- `vitest apps/web/app/api/health/outbox/outbox.test.ts` PASS — 503/200 logic
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/app/api/health/outbox/route.ts`
```

### Test gate (planning summary)
- **Unit:** 503 degraded / 200 healthy
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/app/api/health/outbox/route.ts`

---

## T-00f-006 — Integration test: emit → worker → consumed + DLQ path

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-f outbox
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-002, T-00f-003, T-00f-004]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00d-004]

### GIVEN / WHEN / THEN
**GIVEN** seeded DB + worker in-test
**WHEN** 10 events emitted (8 handled, 2 poisoned)
**THEN** 8 consumed; 2 in outbox_dlq after 5 retries; idempotent replay is no-op

### ACP Prompt
```
# Task T-00f-006 — E2E outbox pipeline: emit → consumed + DLQ

## Twoje zadanie
Utwórz tests/outbox/pipeline.integration.test.ts — 8 success + 2 poison flow.

## Implementacja
1. Start pg-boss in-test (monitorStateIntervalSeconds: 1)
2. Register handler fa.created (always resolves) + poison.test (always throws)
3. Emit 8 × fa.created + 2 × poison.test via insertOutboxEvent
4. Wait for settlement (max 15s polling)
5. Assert: consumed_at IS NOT NULL count = 8; outbox_dlq count = 2; re-emit same transactionIds → no duplicates

## Files
**Create:** `tests/outbox/pipeline.integration.test.ts`

## Done when
- `vitest tests/outbox/pipeline.integration.test.ts` PASS — 8+2+idempotent
- `pnpm test:smoke` green

## Rollback
`git rm tests/outbox/pipeline.integration.test.ts`
```

### Test gate (planning summary)
- **Integration:** 8 consumed + 2 DLQ + idempotent
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm tests/outbox/pipeline.integration.test.ts`

---


## §7 — Sub-module 00-g — Rule engine DSL runtime

---

## T-00g-001 — Migration `012-reference-rules.sql` (rules catalog)

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-g rule engine
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000]
- **Downstream (will consume this):** [T-00g-002]
- **Parallel (can run concurrently):** [T-00h-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline applied
**WHEN** migration runs
**THEN** `reference_rules` table exists: `(tenant_id UUID NOT NULL, rule_id TEXT NOT NULL, rule_type TEXT CHECK rule_type IN ('cascading','conditional_required','gate','workflow'), definition_json JSONB, version INT NOT NULL, active_from TIMESTAMPTZ, active_to TIMESTAMPTZ)` + unique index `(tenant_id, rule_id, version)` + GIN index on `definition_json`

### ACP Prompt
```
# Task T-00g-001 — Migration 012-reference-rules.sql

## Twoje zadanie
Utwórz reference_rules table z CHECK constraint na rule_type + GIN index na definition_json.

## Implementacja
1. Utwórz drizzle/migrations/012-reference-rules.sql: CREATE TABLE reference_rules (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), rule_id TEXT NOT NULL, rule_type TEXT NOT NULL CHECK (rule_type IN ('cascading','conditional_required','gate','workflow')), definition_json JSONB NOT NULL, version INT NOT NULL DEFAULT 1, active_from TIMESTAMPTZ, active_to TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), schema_version INT NOT NULL DEFAULT 1); CREATE UNIQUE INDEX ON reference_rules(tenant_id, rule_id, version); CREATE INDEX ON reference_rules USING gin(definition_json)
2. Drizzle types w packages/db/schema/rules.ts
3. Integration test: insert valid + invalid rule_type (must reject)

## Files
**Create:** `drizzle/migrations/012-reference-rules.sql`, `packages/db/schema/rules.ts`

## Done when
- `vitest tests/rules/rules-schema.integration.test.ts` PASS — CHECK constraint rejects invalid type
- `pnpm test:smoke` green

## Rollback
`DROP TABLE reference_rules`
```

### Test gate (planning summary)
- **Integration:** CHECK constraint rejects invalid rule_type
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TABLE reference_rules`

---

## T-00g-002 — DSL interpreter: cascading rule type

**Type:** T2-api
**Context budget:** ~60k tokens
**Est time:** 75 min
**Parent feature:** 00-g rule engine
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001]
- **Downstream (will consume this):** [T-00g-005, T-00g-006]
- **Parallel (can run concurrently):** [T-00g-003, T-00g-004]

### GIVEN / WHEN / THEN
**GIVEN** a `reference_rules` row of type `cascading`
**WHEN** `evaluate(rule, input)` runs
**THEN** returns downstream field values deterministically — pure function, no DB writes

### ACP Prompt
```
# Task T-00g-002 — DSL interpreter: cascading rule type

## Context — przeczytaj przed implementacją
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → znajdź sekcję ## §7 — Rule Engine DSL spec i przykłady

## Twoje zadanie
Utwórz packages/rule-engine/interpreters/cascading.ts — pure function evaluate(rule, input) → { downstream fields }.

## Implementacja
1. Utwórz packages/rule-engine/types.ts: export interface RuleDefinition { conditions: Condition[]; then: Record<string, unknown> }; export interface RuleInterpreter { evaluate(rule: RuleDefinition, input: Record<string, unknown>): Record<string, unknown> }
2. Utwórz packages/rule-engine/interpreters/cascading.ts: implements RuleInterpreter; evaluate: if conditions match input → return then fields; pure function, no DB, no side effects
3. Condition predicates: EQUALS, CONTAINS_ANY, GT, LT, IN, IS_NULL
4. Export via packages/rule-engine/index.ts
5. Unit tests: ≥5 canonical cascade cases (e.g., Pack_Size=1kg → Line=Line1, Dieset=Die01)

## Files
**Create:** `packages/rule-engine/types.ts`, `packages/rule-engine/interpreters/cascading.ts`, `packages/rule-engine/index.ts`, tests

## Done when
- `vitest packages/rule-engine/interpreters/cascading.test.ts` PASS — 5 canonical cases
- `pnpm test:smoke` green

## Rollback
`rm -rf packages/rule-engine`
```

### Test gate (planning summary)
- **Unit:** 5 canonical cascade cases
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf packages/rule-engine`

---

## T-00g-003 — DSL interpreter: conditional-required rule type

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-g rule engine
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001]
- **Downstream (will consume this):** [T-00g-005]
- **Parallel (can run concurrently):** [T-00g-002, T-00g-004]

### GIVEN / WHEN / THEN
**GIVEN** a `conditional_required` rule (e.g., catch-weight → require tare+gross)
**WHEN** `evaluate(rule, input)`
**THEN** returns `{ required: string[] }` — list of required field names based on predicate match

### ACP Prompt
```
# Task T-00g-003 — DSL interpreter: conditional-required rule type

## Twoje zadanie
Utwórz packages/rule-engine/interpreters/conditional-required.ts — returns required field names.

## Implementacja
1. Utwórz interpreters/conditional-required.ts: implements RuleInterpreter; evaluate(rule, input): for each condition in rule.conditions — if predicate matches input → collect rule.required_fields into result; return { required: string[] }
2. Predicate primitives reuse from cascading: EQUALS, CONTAINS_ANY, GT, LT, IN, IS_NULL
3. Unit tests: ≥5 cases — catch_weight=true → required=['tare_weight','gross_weight']; fresh_meat=true AND allergen_peanut=true → extra field required

## Files
**Create:** `packages/rule-engine/interpreters/conditional-required.ts`, tests

## Done when
- `vitest packages/rule-engine/interpreters/conditional-required.test.ts` PASS — 5 cases
- `pnpm test:smoke` green

## Rollback
`git rm packages/rule-engine/interpreters/conditional-required.ts`
```

### Test gate (planning summary)
- **Unit:** 5 conditional cases
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm interpreters/conditional-required.ts`

---

## T-00g-004 — DSL interpreter: gate rule type

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 70 min
**Parent feature:** 00-g rule engine
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001]
- **Downstream (will consume this):** [T-00g-005]
- **Parallel (can run concurrently):** [T-00g-002, T-00g-003]

### GIVEN / WHEN / THEN
**GIVEN** a `gate` rule (e.g., allergen changeover gate)
**WHEN** `evaluate(rule, context)`
**THEN** returns `{ ok: boolean, missing_actions: string[], notify: string[] }` — pure function

### ACP Prompt
```
# Task T-00g-004 — DSL interpreter: gate rule type

## Context — przeczytaj przed implementacją
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → znajdź sekcję ## §7 — allergen changeover gate example

## Twoje zadanie
Utwórz packages/rule-engine/interpreters/gate.ts — returns { ok, missing_actions, notify }.

## Implementacja
1. Utwórz interpreters/gate.ts: evaluate(rule, context): evaluate rule.triggers[] (conditions that activate gate); if triggered → check rule.conditions[] (required actions); return { ok: all conditions met, missing_actions: unmet conditions, notify: rule.notify ?? [] }
2. GateRuleDefinition: { triggers: Condition[], conditions: ActionCheck[], on_fail: 'block'|'warn', notify: string[] }
3. Unit test using allergen changeover example: trigger=allergen_present; required_actions=['clean_line','test_sample']; test case where clean_line done but test_sample missing → ok: false, missing_actions: ['test_sample']

## Files
**Create:** `packages/rule-engine/interpreters/gate.ts`, tests

## Done when
- `vitest packages/rule-engine/interpreters/gate.test.ts` PASS — allergen changeover example
- `pnpm test:smoke` green

## Rollback
`git rm packages/rule-engine/interpreters/gate.ts`
```

### Test gate (planning summary)
- **Unit:** allergen changeover gate example
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm interpreters/gate.ts`

---

## T-00g-005 — Rule registry loader + LRU cache per schema_version

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 50 min
**Parent feature:** 00-g rule engine
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-002, T-00g-003, T-00g-004]
- **Downstream (will consume this):** [T-00g-006]
- **Parallel (can run concurrently):** [T-00h-002]

### GIVEN / WHEN / THEN
**GIVEN** `reference_rules` populated
**WHEN** `loadRules(tenantId)` called
**THEN** returns interpreter-ready rule set, LRU-cached by `(tenant_id, schema_version)`

### ACP Prompt
```
# Task T-00g-005 — Rule registry loader + LRU cache

## Twoje zadanie
Utwórz packages/rule-engine/loader.ts — loadRules(tenantId) z LRU cache per (tenant_id, schema_version).

## Implementacja
1. pnpm add lru-cache --filter @monopilot/rule-engine
2. Utwórz packages/rule-engine/loader.ts: LRUCache<string, RuleSet>({ max: 100 }); loadRules(tenantId): check cache key=`${tenantId}:${schemaVersion}`; if miss → SELECT * FROM reference_rules WHERE tenant_id = tenantId AND active_to IS NULL; build RuleSet { cascading, conditional_required, gate, workflow }; cache.set(key, ruleSet); return ruleSet
3. invalidateCache(tenantId): delete all keys starting with tenantId (on schema_version bump)
4. Unit + integration test: cache hit/miss behaviour

## Files
**Create:** `packages/rule-engine/loader.ts`, `packages/rule-engine/loader.test.ts`

## Done when
- `vitest packages/rule-engine/loader.test.ts` PASS — cache hit returns same object ref
- `pnpm test:smoke` green

## Rollback
`git rm packages/rule-engine/loader.ts`
```

### Test gate (planning summary)
- **Unit + Integration:** cache hit/miss
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm packages/rule-engine/loader.ts`

---

## T-00g-006 — Dry-run harness (`POST /api/rules/dry-run`)

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 50 min
**Parent feature:** 00-g rule engine
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-005, T-00b-E01]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00g-007]

### GIVEN / WHEN / THEN
**GIVEN** loader + interpreters live
**WHEN** POST `/api/rules/dry-run` with `{ rule_id, sample_input }`, RBAC `ref.edit`
**THEN** returns evaluation result JSON with trace — no DB writes

### ACP Prompt
```
# Task T-00g-006 — Dry-run harness POST /api/rules/dry-run

## Context
- lib/rbac/permissions.enum.ts — Permission.REF_EDIT = 'ref.edit'

## Twoje zadanie
Utwórz apps/web/app/api/rules/dry-run/route.ts — eval rule, return trace, no DB writes.

## Implementacja
1. Utwórz route.ts POST: Zod parse { rule_id: z.string(), sample_input: z.record(z.unknown()) }; RBAC guard Permission.REF_EDIT; load rule via loadRules + find by rule_id; evaluate(rule, sample_input); return { result, trace: [{ step, input_snapshot, output, duration_ms }] }
2. Unit test: trace shape stable
3. Integration test: real rule from DB, trace non-empty

## Files
**Create:** `apps/web/app/api/rules/dry-run/route.ts`, tests

## Done when
- `vitest apps/web/app/api/rules/dry-run/dry-run.test.ts` PASS — trace shape stable
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/app/api/rules/dry-run/route.ts`
```

### Test gate (planning summary)
- **Unit + Integration:** trace shape stable
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/app/api/rules/dry-run/route.ts`

---

## T-00g-007 — `reference_rules` seed helper + snapshot updater

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-g rule engine
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001, T-00b-004]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00g-006]

### GIVEN / WHEN / THEN
**GIVEN** rule table exists
**WHEN** seed `apex-baseline` applies rule snapshot
**THEN** 3 canonical rules present: `fefo_pick_v1` (cascading), `catch_weight_required_v1` (conditional_required), `allergen_changeover_gate_v1` (gate)

### ACP Prompt
```
# Task T-00g-007 — reference_rules seed helper + apex-baseline snapshot

## Twoje zadanie
Utwórz packages/db/seed/rules.ts z 3 canonical Apex rules. Wire do apex-baseline snapshot.

## Implementacja
1. Utwórz packages/db/seed/rules.ts z createRule factory + 3 rules:
   - rule_id='fefo_pick_v1', rule_type='cascading', definition_json: { conditions: [{field:'pick_method',op:'EQUALS',value:'FEFO'}], then: {sort_by:'expiry_date',order:'ASC'} }
   - rule_id='catch_weight_required_v1', rule_type='conditional_required', definition_json: { conditions: [{field:'catch_weight',op:'EQUALS',value:true}], required_fields:['tare_weight','gross_weight'] }
   - rule_id='allergen_changeover_gate_v1', rule_type='gate', definition_json: { triggers:[{field:'allergen_present',op:'EQUALS',value:true}], conditions:['clean_line','test_sample'], on_fail:'block', notify:['production_manager'] }
2. Wire do packages/db/seed/snapshots/apex-baseline.ts
3. Integration test: seed → loadRules → 3 rules loaded

## Files
**Create:** `packages/db/seed/rules.ts`
**Modify:** `packages/db/seed/snapshots/apex-baseline.ts`

## Done when
- `vitest packages/db/seed/rules.test.ts` PASS — 3 rules load + evaluate correctly
- `pnpm test:smoke` green

## Rollback
`DELETE FROM reference_rules WHERE rule_id IN ('fefo_pick_v1','catch_weight_required_v1','allergen_changeover_gate_v1')`
```

### Test gate (planning summary)
- **Integration:** 3 rules load + evaluate
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DELETE FROM reference_rules WHERE rule_id IN (...)`

---

## T-00g-008 — DSL interpreter: workflow-as-data rule type

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-g rule engine
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00g-001]
- **Downstream (will consume this):** [T-02SETa tasks using rule engine]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** rule registry live with `workflow` type entries
**WHEN** `evaluateRule(ruleId, { current_state, event, context })`
**THEN** returns `{ allowed: boolean, next_state: string|null, trace: TraceEntry[] }`; dry-run skips side effects; unknown state returns structured error, not throw

### ACP Prompt
```
# Task T-00g-008 — DSL interpreter: workflow-as-data rule type

## Twoje zadanie
Utwórz packages/rule-engine/interpreters/workflow.ts — state machine transition guard.

## Implementacja
1. Utwórz interpreters/workflow.ts: class WorkflowRuleInterpreter implements RuleInterpreter; evaluate(rule, { current_state, event, context }): WorkflowRuleDefinition = { states: string[], transitions: [{from,event,to,guard?}], on_unknown_state: 'error' }; find matching transition; if guard → eval guard expression; return { allowed: boolean, next_state, trace }
2. Dry-run mode: if options?.dryRun === true → skip side-effect emits, append trace { step, result, timestamp }
3. Unknown state: return { allowed: false, next_state: null, error: 'Unknown state: <state>' } (NO throw)
4. Register in packages/rule-engine/registry.ts under key 'workflow'
5. Unit tests: valid transition, blocked transition, unknown state, dry-run trace output
6. Integration test: seed 1 workflow rule → call evaluateRule → assert correct next_state

## Files
**Create:** `packages/rule-engine/interpreters/workflow.ts`, `packages/rule-engine/interpreters/workflow.test.ts`
**Modify:** `packages/rule-engine/registry.ts`, `packages/rule-engine/types.ts`

## Done when
- `vitest packages/rule-engine/interpreters/workflow.test.ts` PASS — 4 cases
- `vitest packages/rule-engine/interpreters/workflow.integration.test.ts` PASS
- `pnpm test:smoke` green

## Rollback
`git revert` — removes workflow.ts + registry entry; 3 existing interpreters unaffected
```

### Test gate (planning summary)
- **Unit:** 4 cases (valid/blocked/unknown/dry-run)
- **Integration:** seeded rule evaluated against real DB
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert` adding workflow.ts + registry entry

---

## §8 — Sub-module 00-h — Schema-driven engine runtime

---

## T-00h-001 — Migration `013-reference-dept-columns.sql` + schema_migrations

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 55 min
**Parent feature:** 00-h schema-driven
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000, T-00b-E03]
- **Downstream (will consume this):** [T-00h-002, T-00h-003, T-00h-004]
- **Parallel (can run concurrently):** [T-00g-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline applied
**WHEN** migration runs
**THEN** `reference_dept_columns` table exists + `schema_migrations` audit table + `main_table` placeholder with `ext_jsonb JSONB` + `private_jsonb JSONB` + GIN index

### ACP Prompt
```
# Task T-00h-001 — Migration 013-reference-dept-columns.sql

## Context
- lib/reference/ref-tables.enum.ts — RefTable.DEPT_COLUMNS = 'dept_columns'

## Twoje zadanie
Utwórz reference_dept_columns table + schema_migrations audit + main_table placeholder z ext/private JSONB.

## Implementacja
1. Utwórz drizzle/migrations/013-reference-dept-columns.sql:
   - CREATE TABLE reference_dept_columns (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), dept_code TEXT NOT NULL, field_name TEXT NOT NULL, field_type TEXT NOT NULL CHECK (field_type IN ('text','number','boolean','date','enum','jsonb')), label TEXT, required BOOLEAN DEFAULT false, metadata JSONB, schema_version INT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW()); CREATE UNIQUE INDEX ON reference_dept_columns(tenant_id, dept_code, field_name)
   - CREATE TABLE schema_migrations (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL, action TEXT, field_name TEXT, before_json JSONB, after_json JSONB, applied_at TIMESTAMPTZ DEFAULT NOW())
   - Jeśli main_table nie istnieje (pre T-00b-M01): CREATE TABLE main_table (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES tenants(id), ext_jsonb JSONB, private_jsonb JSONB, schema_version INT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW()); CREATE INDEX ON main_table USING gin(ext_jsonb)
2. Drizzle types w packages/db/schema/schema-driven.ts
3. Integration test: INSERT + GIN index used

## Files
**Create:** `drizzle/migrations/013-reference-dept-columns.sql`, `packages/db/schema/schema-driven.ts`

## Done when
- `vitest tests/schema-driven/dept-columns.integration.test.ts` PASS — schema shape + GIN index
- `pnpm test:smoke` green

## Rollback
`DROP TABLE reference_dept_columns, schema_migrations`
```

### Test gate (planning summary)
- **Integration:** schema shape + GIN index
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TABLE reference_dept_columns, schema_migrations`

---

## T-00h-002 — JSON-Schema → Zod runtime compiler

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 60 min
**Parent feature:** 00-h schema-driven
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00h-001]
- **Downstream (will consume this):** [T-00h-003, T-00h-004]
- **Parallel (can run concurrently):** [T-00g-005]

### GIVEN / WHEN / THEN
**GIVEN** `reference_dept_columns` rows exist
**WHEN** `compileZod(tenantId, deptCode)` called
**THEN** returns Zod schema derived from metadata, LRU-cached per `schema_version`, ready for RHF zodResolver

### ACP Prompt
```
# Task T-00h-002 — JSON-Schema → Zod runtime compiler

## Twoje zadanie
Utwórz packages/schema-driven/compile-zod.ts — compileZod(tenantId, deptCode) → ZodObject, LRU cached.

## Implementacja
1. pnpm add lru-cache --filter @monopilot/schema-driven
2. Utwórz packages/schema-driven/compile-zod.ts: query reference_dept_columns WHERE tenant_id=? AND dept_code=?; map each row to Zod type: text→z.string(), number→z.number(), boolean→z.boolean(), date→z.coerce.date(), enum→z.enum([...values]), jsonb→z.record(z.unknown()); apply required: if required → no .optional(); combine into z.object({...}); LRU cache key = `${tenantId}:${deptCode}:${schemaVersion}`
3. Unit tests: all 6 field_types produce correct Zod
4. Integration test: hits DB, cache hit on second call

## Files
**Create:** `packages/schema-driven/compile-zod.ts`, `packages/schema-driven/compile-zod.test.ts`

## Done when
- `vitest packages/schema-driven/compile-zod.test.ts` PASS — all 6 field types
- Integration test: cache hit same object ref
- `pnpm test:smoke` green

## Rollback
`rm -rf packages/schema-driven`
```

### Test gate (planning summary)
- **Unit + Integration:** 6 field types + cache hit
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf packages/schema-driven`

---

## T-00h-003 — `ext_jsonb` read/write helpers + expression indexes

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-h schema-driven
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00h-001]
- **Downstream (will consume this):** [T-00h-005]
- **Parallel (can run concurrently):** [T-00h-002]

### GIVEN / WHEN / THEN
**GIVEN** main_table has `ext_jsonb`
**WHEN** `readExt(row, key)` / `writeExt(row, key, value)` run
**THEN** typed access enforced via compiled Zod; expression index created for frequently-queried L3 cols

### ACP Prompt
```
# Task T-00h-003 — ext_jsonb read/write helpers + expression indexes

## Twoje zadanie
Utwórz packages/schema-driven/ext-jsonb.ts + migration 014-ext-jsonb-indexes.sql.

## Implementacja
1. Utwórz packages/schema-driven/ext-jsonb.ts: readExt<T>(row: { ext_jsonb: unknown }, key: string, schema: z.ZodType<T>): T — parses ext_jsonb[key] via schema; writeExt(row, key, value, schema) — validates + returns merged ext_jsonb; both throw ZodError on invalid value
2. Utwórz drizzle/migrations/014-ext-jsonb-indexes.sql: CREATE INDEX ON main_table ((ext_jsonb->>'pack_size')); CREATE INDEX ON main_table ((ext_jsonb->>'dept_code')) WHERE ext_jsonb ? 'dept_code'
3. Unit tests: readExt valid, writeExt valid, invalid throws ZodError
4. Integration test: query using index (EXPLAIN shows Index Scan)

## Files
**Create:** `packages/schema-driven/ext-jsonb.ts`, `drizzle/migrations/014-ext-jsonb-indexes.sql`

## Done when
- `vitest packages/schema-driven/ext-jsonb.test.ts` PASS — valid + ZodError on invalid
- `pnpm test:smoke` green

## Rollback
`DROP INDEX` + `git rm packages/schema-driven/ext-jsonb.ts`
```

### Test gate (planning summary)
- **Unit + Integration:** type-safe access + index
- **CI gate:** `pnpm test:smoke` green

### Rollback
Drop indexes + `git rm ext-jsonb.ts`

---

## T-00h-004 — `schema_version` bump + idempotent add-column helper

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 45 min
**Parent feature:** 00-h schema-driven
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00h-001]
- **Downstream (will consume this):** [T-00h-005]
- **Parallel (can run concurrently):** [T-00h-003]

### GIVEN / WHEN / THEN
**GIVEN** a new DeptColumns row to add
**WHEN** `addColumn(defn)` runs
**THEN** migration record appended to schema_migrations, `schema_version` bumped tenant-scoped, cache invalidated, idempotent

### ACP Prompt
```
# Task T-00h-004 — schema_version bump + idempotent add-column helper

## Twoje zadanie
Utwórz packages/schema-driven/add-column.ts — transactional addColumn + schema_version bump + cache invalidation.

## Implementacja
1. Utwórz packages/schema-driven/add-column.ts: addColumn(tenantId, defn: DeptColumnDef): db.transaction(async tx => { INSERT INTO reference_dept_columns ... ON CONFLICT DO NOTHING; if inserted → INSERT INTO schema_migrations { tenantId, action:'add', field_name: defn.fieldName, after_json: defn }; SELECT max(schema_version)+1 AS next_ver FROM reference_dept_columns WHERE tenant_id=tenantId; UPDATE reference_dept_columns SET schema_version=next_ver WHERE tenant_id=tenantId; invalidateCache(tenantId) })
2. Idempotent: running twice → second call is no-op (ON CONFLICT DO NOTHING)
3. Integration test: addColumn → compileZod → new field in schema; run twice → version same

## Files
**Create:** `packages/schema-driven/add-column.ts`, `packages/schema-driven/add-column.test.ts`

## Done when
- `vitest packages/schema-driven/add-column.test.ts` PASS — idempotent + version bump
- `pnpm test:smoke` green

## Rollback
Revert migration row manually; `DELETE FROM reference_dept_columns WHERE field_name = <new>`
```

### Test gate (planning summary)
- **Integration:** addColumn → compileZod → field present; idempotent
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DELETE FROM reference_dept_columns WHERE field_name = <new>`

---

## T-00h-005 — Integration test: metadata change → Zod runtime picks up

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 60 min
**Parent feature:** 00-h schema-driven
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00h-003, T-00h-004]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00f-006]

### GIVEN / WHEN / THEN
**GIVEN** main_table + DeptColumns seeded with dept_code='core'
**WHEN** test adds new L3 column "custom_flag" (boolean), validates payloads before/after
**THEN** pre-add payload rejects unknown field, post-add payload accepts; `schema_version` distinct before/after

### ACP Prompt
```
# Task T-00h-005 — Integration test: metadata change → Zod runtime picks up

## Twoje zadanie
Utwórz tests/schema-driven/metadata-live.integration.test.ts — end-to-end live schema change test.

## Implementacja
1. Setup: seed apex-baseline; addColumn for dept_code='core', field_name='custom_flag', field_type='boolean'
2. Test step 1: compileZod('core') → schema_v1 WITHOUT custom_flag; try to parse { custom_flag: true } → FAIL (unknown key in strict mode)
3. addColumn({ dept_code:'core', field_name:'custom_flag', field_type:'boolean' })
4. Test step 2: compileZod('core') → schema_v2 WITH custom_flag; parse { custom_flag: true } → PASS
5. Assert schema_version(v2) > schema_version(v1)

## Files
**Create:** `tests/schema-driven/metadata-live.integration.test.ts`

## Done when
- `vitest tests/schema-driven/metadata-live.integration.test.ts` PASS — pre/post behaviour + version distinct
- `pnpm test:smoke` green

## Rollback
`git rm tests/schema-driven/metadata-live.integration.test.ts`
```

### Test gate (planning summary)
- **Integration:** pre/post validation behaviour + distinct schema_version
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm tests/schema-driven/metadata-live.integration.test.ts`

---

## §9 — Sub-module 00-i — Testing + CI + Observability

---

## T-00i-001 — Vitest workspace harness + coverage config

**Type:** T4-wiring+test
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-i testing
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-004]
- **Downstream (will consume this):** [every test-gated task]
- **Parallel (can run concurrently):** [T-00i-005]

### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** `pnpm test:unit` runs
**THEN** Vitest resolves workspace globs, coverage-v8 emits `coverage/` at ≥85% target, RTL works

### ACP Prompt
```
# Task T-00i-001 — Vitest workspace harness + coverage config

## Twoje zadanie
Skonfiguruj Vitest workspace z coverage-v8 + @testing-library/react.

## Implementacja
1. pnpm add -Dw vitest @vitest/coverage-v8 @testing-library/react @testing-library/user-event jsdom
2. Utwórz vitest.workspace.ts (root): defineWorkspace(['apps/web', 'packages/*'])
3. Per workspace vitest.config.ts: environment jsdom (dla web); node (dla packages); coverage.thresholds.lines=85
4. Dodaj test:unit + test:coverage do turbo.json pipelines
5. Tiny sample test packages/db/smoke.test.ts sprawdź że jest green

## Files
**Create:** `vitest.workspace.ts`, per-workspace `vitest.config.ts`

## Done when
- `pnpm test:unit` green — sample test PASS
- `pnpm test:coverage` emits coverage/ dir
- `pnpm test:smoke` green

## Rollback
`git rm vitest.workspace.ts`
```

### Test gate (planning summary)
- **CI gate:** `pnpm test:unit` green + coverage report

### Rollback
`git rm vitest.workspace.ts`

---

## T-00i-002 — GitHub Actions workflow (matrix: lint, typecheck, unit, integration, e2e)

**Type:** T4-wiring+test
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 00-i testing
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00i-001, T-00i-003, T-00i-005]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00i-004]

### GIVEN / WHEN / THEN
**GIVEN** all test harnesses exist
**WHEN** PR pushed
**THEN** `.github/workflows/ci.yml` runs 5 jobs in matrix; failure blocks merge; E2E traces uploaded as artifacts

### ACP Prompt
```
# Task T-00i-002 — GitHub Actions CI workflow matrix

## Twoje zadanie
Utwórz .github/workflows/ci.yml z 5 jobs: lint, typecheck, unit, integration, e2e.

## Implementacja
1. Utwórz .github/workflows/ci.yml: trigger on pull_request + push to main; jobs: lint (pnpm lint), typecheck (pnpm typecheck), unit (pnpm test:unit), integration (pnpm test:integration z Supabase local via Docker service container postgres:15), e2e (pnpm test:e2e z Playwright + upload-artifact on-failure)
2. Matrix: Node 20, pnpm 9
3. Supabase local: service container OR `supabase start` in job
4. Branch protection: require all 5 jobs green

## Files
**Create:** `.github/workflows/ci.yml`

## Done when
- All 5 jobs green on dummy PR
- `pnpm test:smoke` green

## Rollback
Disable workflow
```

### Test gate (planning summary)
- **CI gate:** 5 jobs green on dummy PR

### Rollback
Disable workflow

---

## T-00i-003 — Integration test harness (Supabase local + `db:reset` per test)

**Type:** T4-wiring+test
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 00-i testing
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-001, T-00b-003, T-00i-001]
- **Downstream (will consume this):** [every integration test]
- **Parallel (can run concurrently):** [T-00i-005]

### GIVEN / WHEN / THEN
**GIVEN** Supabase local + migrations exist
**WHEN** an integration test file runs
**THEN** global setup resets DB via `supabase db reset`, applies seed snapshot, exposes `app_role` connection

### ACP Prompt
```
# Task T-00i-003 — Integration test harness (Supabase local + db:reset)

## Twoje zadanie
Utwórz tests/setup/integration-setup.ts — global setup: db:reset + seed + app_role connection.

## Implementacja
1. Utwórz tests/setup/integration-setup.ts: globalSetup = async () => { await exec('supabase db reset'); await exec('pnpm seed apex-baseline') }; export withTenant(orgId, fn): wraps fn in withOrgContext(orgId, ...)
2. Utwórz tests/utils/db.ts: supabaseLocalDb fixture — createClient z app_role DATABASE_URL_APP_ROLE
3. Wire into vitest.config.ts (integration): globalSetup: ['tests/setup/integration-setup.ts']
4. Smoke test: withTenant(apex-baseline-orgId, async tx => { const [row] = await tx.select().from(tenants); expect(row).toBeDefined() })

## Files
**Create:** `tests/setup/integration-setup.ts`, `tests/utils/db.ts`

## Done when
- Smoke integration test PASS
- `pnpm test:smoke` green

## Rollback
`git rm tests/setup/integration-setup.ts`
```

### Test gate (planning summary)
- **Integration:** smoke test passes under app_role
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm tests/setup/integration-setup.ts`

---

## T-00i-004 — Seed fixture library (Apex baseline + synthetic multi-tenant)

**Type:** T5-seed
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-i testing
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-004]
- **Downstream (will consume this):** [T-00d-004, T-00f-006, T-00h-005]
- **Parallel (can run concurrently):** [T-00i-002]

### GIVEN / WHEN / THEN
**GIVEN** seed runner + named snapshots
**WHEN** `applySnapshot('multi-tenant-3')`
**THEN** 3 tenants with disjoint users/roles, 2 shared role kinds, deterministic UUIDs; re-run is idempotent

### ACP Prompt
```
# Task T-00i-004 — Seed fixture library: multi-tenant-3 deterministic

## Twoje zadanie
Rozszerz multi-tenant-3.ts z deterministic UUIDs + factory functions. Utwórz test utils seedAndConnect.

## Implementacja
1. Edytuj packages/db/seed/snapshots/multi-tenant-3.ts: 3 tenants UUIDs hardcoded (0000...0001, 0000...0002, 0000...0003); per tenant 2 users + 2 roles; ON CONFLICT DO NOTHING everywhere
2. Utwórz tests/utils/seed.ts: export function seedAndConnect(snapshotName: string, orgId: string): Promise<{ tx, orgId }> — applySnapshot + return withOrgContext handle
3. Unit test: run twice → same row count (idempotent)

## Files
**Modify:** `packages/db/seed/snapshots/multi-tenant-3.ts`
**Create:** `tests/utils/seed.ts`

## Done when
- `vitest packages/db/seed/multi-tenant-3.test.ts` PASS — deterministic + idempotent
- `pnpm test:smoke` green

## Rollback
`git revert` multi-tenant-3.ts changes
```

### Test gate (planning summary)
- **Unit:** deterministic + idempotent
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert` multi-tenant-3.ts

---

## T-00i-005 — Playwright harness + auth fixture

**Type:** T4-wiring+test
**Context budget:** ~50k tokens
**Est time:** 55 min
**Parent feature:** 00-i testing
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-002, T-00i-001]
- **Downstream (will consume this):** [T-00c-006, every E2E]
- **Parallel (can run concurrently):** [T-00i-003]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app boots
**WHEN** `pnpm test:e2e` runs
**THEN** Playwright resolves projects, shared auth fixture (storageState), HTML report produced

### ACP Prompt
```
# Task T-00i-005 — Playwright harness + auth fixture

## Twoje zadanie
Konfiguruj Playwright z shared auth fixture dla reuse across tests.

## Implementacja
1. pnpm create playwright@latest -- --dir e2e --no-browser
2. Utwórz playwright.config.ts: baseURL=http://localhost:3000, webServer: { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: true }, projects: [{ name: 'chromium', use: { storageState: 'e2e/.auth/user.json' } }], reporter: 'html'
3. Utwórz e2e/fixtures/auth.ts: global setup — navigate /login, fill jane@apex.com/test1234, save storageState to e2e/.auth/user.json
4. Utwórz e2e/smoke.spec.ts: test('homepage loads') → page.goto('/') → expect page title contains 'Monopilot'
5. pnpm test:e2e → smoke passes

## Files
**Create:** `playwright.config.ts`, `e2e/fixtures/auth.ts`, `e2e/smoke.spec.ts`

## Done when
- `playwright e2e/smoke.spec.ts` PASS
- `pnpm test:smoke` green

## Rollback
`git rm playwright.config.ts e2e/`
```

### Test gate (planning summary)
- **E2E:** smoke spec passes
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm playwright.config.ts e2e/`

---

## T-00i-006 — Sentry init (web + worker) + source maps upload

**Type:** T4-wiring+test
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 00-i observability
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-007]
- **Downstream (will consume this):** [T-00i-008]
- **Parallel (can run concurrently):** [T-00i-007]

### GIVEN / WHEN / THEN
**GIVEN** SENTRY_DSN in env
**WHEN** app starts
**THEN** `@sentry/nextjs` captures errors with release tag + source maps; worker uses `@sentry/node`

### ACP Prompt
```
# Task T-00i-006 — Sentry init web + worker + source maps

## Twoje zadanie
Zainstaluj @sentry/nextjs + @sentry/node. Init instrumentation. Source map upload w CI.

## Implementacja
1. pnpm add @sentry/nextjs --filter web; pnpm add @sentry/node --filter worker
2. Utwórz apps/web/instrumentation.ts: import * as Sentry from '@sentry/nextjs'; Sentry.init({ dsn: env.SENTRY_DSN, tracesSampleRate: 0.1, release: process.env.VERCEL_GIT_COMMIT_SHA })
3. Utwórz apps/web/sentry.client.config.ts + sentry.edge.config.ts
4. Utwórz apps/worker/sentry.ts: Sentry.init({ dsn, integrations: [new Sentry.Integrations.Postgres()] })
5. CI: add sentry-cli source-map upload step z SENTRY_AUTH_TOKEN

## Files
**Create:** `apps/web/instrumentation.ts`, `apps/web/sentry.client.config.ts`, `apps/worker/sentry.ts`

## Done when
- `pnpm --filter web build` green — no Sentry init errors
- Manual smoke: deliberate throw → error visible in Sentry dashboard
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/instrumentation.ts apps/web/sentry.*.ts apps/worker/sentry.ts`
```

### Test gate (planning summary)
- **Manual:** error visible in Sentry
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/instrumentation.ts`

---

## T-00i-007 — PostHog self-host skeleton + feature-flag client singleton

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 40 min
**Parent feature:** 00-i observability
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-007]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00i-006]

### GIVEN / WHEN / THEN
**GIVEN** PostHog self-host URL + key in env
**WHEN** `flag('npd.brief_v2')` called
**THEN** returns boolean scoped to `tenant_id` + `user_id`; fallback to `false` on outage

### ACP Prompt
```
# Task T-00i-007 — PostHog feature flag client singleton

## Twoje zadanie
Utwórz packages/flags/ z server singleton + use-flag.ts hook. Fallback false na outage.

## Implementacja
1. pnpm add posthog-node posthog-js --filter @monopilot/flags
2. Utwórz packages/flags/server.ts: new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST }); export async function flag(key: string, tenantId: string, userId: string): Promise<boolean> { try { return await client.isFeatureEnabled(key, userId, { groups: { tenant: tenantId } }) ?? false } catch { return false } }
3. Utwórz packages/flags/use-flag.ts: 'use client'; useFlag(key) hook using posthog-js — fallback false
4. Unit test: mock network failure → returns false

## Files
**Create:** `packages/flags/server.ts`, `packages/flags/use-flag.ts`

## Done when
- `vitest packages/flags/server.test.ts` PASS — network failure → false
- `pnpm test:smoke` green

## Rollback
`rm -rf packages/flags`
```

### Test gate (planning summary)
- **Unit:** network failure → fallback false
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf packages/flags`

---

## T-00i-008 — Vercel preview deploys + deploy gates

**Type:** T4-wiring+test
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 00-i observability
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00i-002, T-00f-005, T-00i-006]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00i-009]

### GIVEN / WHEN / THEN
**GIVEN** Vercel project linked
**WHEN** PR opens
**THEN** Vercel preview deploy built; post-deploy job hits `/api/health/outbox`; fail → PR status red

### ACP Prompt
```
# Task T-00i-008 — Vercel preview deploys + deploy gates

## Twoje zadanie
Połącz projekt z Vercel. Deploy gate: hit /api/health/outbox po preview deploy.

## Implementacja
1. vercel link (via CLI) — connect to Vercel project
2. Utwórz vercel.json: { "buildCommand": "pnpm turbo run build", "outputDirectory": "apps/web/.next", "framework": "nextjs" }
3. Dodaj do .github/workflows/ci.yml job 'deploy-gate': wait for Vercel preview URL; curl preview-url/api/health/outbox; fail if non-200
4. Utwórz .github/workflows/preview-cleanup.yml: weekly schedule → delete old preview deployments
5. Document w README

## Files
**Create:** `vercel.json`, `.github/workflows/preview-cleanup.yml`

## Done when
- Vercel preview builds on dummy PR
- /api/health/outbox gate passes (or fails PR on 503)
- `pnpm test:smoke` green

## Rollback
Disable Vercel integration
```

### Test gate (planning summary)
- **Manual:** preview deploys + health gate
- **CI gate:** `pnpm test:smoke` green

### Rollback
Disable Vercel integration

---

## T-00i-009 — Accessibility baseline via `@axe-core/playwright`

**Type:** T4-wiring+test
**Context budget:** ~35k tokens
**Est time:** 35 min
**Parent feature:** 00-i testing
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00i-005]
- **Downstream (will consume this):** [every future UI sub-module]
- **Parallel (can run concurrently):** [T-00i-008]

### GIVEN / WHEN / THEN
**GIVEN** Playwright + login page
**WHEN** `pnpm test:a11y` runs
**THEN** axe-core sweeps `/login`, 0 critical violations; CI gate fails on critical

### ACP Prompt
```
# Task T-00i-009 — Accessibility baseline axe-core/playwright

## Twoje zadanie
Dodaj axe-core/playwright. Sweep /login → 0 critical violations.

## Implementacja
1. pnpm add -D @axe-core/playwright --filter e2e
2. Utwórz e2e/a11y/login.spec.ts: import { checkA11y } from 'axe-playwright'; await page.goto('/login'); await checkA11y(page, undefined, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa'] } })
3. Dodaj test:a11y script
4. Add a11y job do .github/workflows/ci.yml

## Files
**Create:** `e2e/a11y/login.spec.ts`

## Done when
- `playwright e2e/a11y/login.spec.ts` PASS — 0 critical violations
- `pnpm test:smoke` green

## Rollback
`git rm e2e/a11y/login.spec.ts`
```

### Test gate (planning summary)
- **E2E:** 0 critical a11y violations
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm e2e/a11y/login.spec.ts`

---

## T-00i-010 — `/api/health` composite healthcheck + readiness probe

**Type:** T2-api
**Context budget:** ~30k tokens
**Est time:** 30 min
**Parent feature:** 00-i observability
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00f-005, T-00b-002]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00i-009]

### GIVEN / WHEN / THEN
**GIVEN** DB + outbox + Sentry wired
**WHEN** `GET /api/health`
**THEN** returns `{ db: 'ok', outbox: 'ok'|'degraded', sentry: 'ok', app_version, git_sha }` in <200ms

### ACP Prompt
```
# Task T-00i-010 — /api/health composite healthcheck

## Twoje zadanie
Utwórz apps/web/app/api/health/route.ts — parallel 3 sub-probes, return worst-of tri-state.

## Implementacja
1. Utwórz apps/web/app/api/health/route.ts: GET; parallel: db probe (db.execute('select 1')), outbox probe (fetch /api/health/outbox), sentry probe (Sentry.captureCheckIn?); combine results; return { db, outbox, sentry, app_version: process.env.npm_package_version, git_sha: process.env.VERCEL_GIT_COMMIT_SHA }; status 200 if all ok, 503 if any degraded
2. Unit test: all ok → 200; one degraded → 503

## Files
**Create:** `apps/web/app/api/health/route.ts`, test

## Done when
- `vitest apps/web/app/api/health/health.test.ts` PASS — 200/503 logic
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/app/api/health/route.ts`
```

### Test gate (planning summary)
- **Unit:** 200 ok / 503 degraded
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/app/api/health/route.ts`

---

## T-00i-011 — E-0 dogfood acceptance harness (Definition of Done)

**Type:** T4-wiring+test
**Context budget:** ~80k tokens
**Est time:** 90 min
**Parent feature:** 00-i testing (gap-fill per Decision #6)
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00c-006, T-00d-004, T-00e-004, T-00f-006, T-00g-006, T-00h-005, T-00i-002, T-00i-010, T-00a-008, T-00a-009, T-00b-M01]
- **Downstream (will consume this):** [] — release gate
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** all E-0 sub-modules landed
**WHEN** `pnpm test:acceptance:e0` runs
**THEN** every E-0 integration milestone bullet passes: fresh pnpm dev boots; CI green; RLS cross-tenant clean; audit→outbox→consumed; rule dry-run deterministic; Zod validates DeptColumns; 69-col Main Table present; PWA SW registers; IndexedDB roundtrip

### ACP Prompt
```
# Task T-00i-011 — E-0 dogfood acceptance harness (Definition of Done)

## Twoje zadanie
Utwórz tests/acceptance/phase-e0-dod.ts orchestrator. Weryfikuje wszystkie 9 E-0 milestone bullets.

## Implementacja
1. Utwórz tests/acceptance/phase-e0-dod.ts: 9 assertions (each wrapped in describe block):
   - 'pnpm dev boots': spawn dev server, check localhost:3000 responds 200
   - 'CI green on trivial PR': run pnpm lint + pnpm typecheck + pnpm test:unit
   - 'RLS cross-tenant clean': run cross-tenant-leak suite (call from acceptance test)
   - 'audit→outbox→consumed': trigger entity insert, assert audit_log row + outbox_events consumed_at set
   - 'rule dry-run deterministic': POST /api/rules/dry-run 3× same input, assert identical trace
   - 'Zod validates DeptColumns': compileZod('core') → parse valid payload → PASS, invalid → FAIL
   - '69-col main_table present': SELECT column_name FROM information_schema.columns WHERE table_name='main_table' → count 69+
   - 'PWA SW registers': Playwright headless → navigator.serviceWorker.ready → truthy
   - 'IndexedDB roundtrip': page.evaluate enqueue+flush → assert consumed status
2. Emit artifacts/phase-e0-dod-report.md on pass
3. Add CI job pnpm test:acceptance:e0

## Files
**Create:** `tests/acceptance/phase-e0-dod.ts`, `.github/workflows/acceptance-e0.yml`

## Done when
- `pnpm test:acceptance:e0` green — all 9 bullets
- Report emitted to artifacts/phase-e0-dod-report.md

- `pnpm test:smoke` green
## Rollback
Disable CI job; gate is permanent
```

### Test gate (planning summary)
- **E2E + Integration:** all 9 E-0 milestone bullets
- **CI gate:** release branch blocked unless acceptance-e0 green

### Rollback
Disable CI job

---

## T-00a-006b — Pre-commit token-cap gate (40000 tokens; extends T-00a-006)

**Type:** T4-wiring+test
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #5)
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-006]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** Husky pre-commit exists
**WHEN** a commit attempts to add >40000 tokens of new code
**THEN** pre-commit blocks with message "Token cap exceeded: <N> tokens (max 40000). Split your PR."

### ACP Prompt
```
# Task T-00a-006b — Pre-commit token-cap gate 40000 tokens

## Twoje zadanie
Dodaj token-cap check do .husky/pre-commit. Blokuj jeśli diff > 40000 tokens.

## Implementacja
1. Utwórz scripts/check-token-cap.ts: git diff --cached | count characters; rough token estimate = chars / 4; if tokens > 40000 → console.error + process.exit(1)
2. Dodaj do .husky/pre-commit: pnpm exec tsx scripts/check-token-cap.ts
3. Unit test: mock git diff z >160000 chars → exit 1; <160000 → exit 0
4. Commit (small diff, won't trigger itself)

## Files
**Create:** `scripts/check-token-cap.ts`
**Modify:** `.husky/pre-commit`

## Done when
- Large mock diff (>160k chars) → pre-commit blocks with clear message
- `pnpm test:smoke` green

## Rollback
Remove from .husky/pre-commit; git rm scripts/check-token-cap.ts
```

### Test gate (planning summary)
- **Unit:** large diff blocks, small diff passes
- **Manual:** pre-commit blocks on large staged diff

### Rollback
Remove from .husky/pre-commit

---

## T-00b-A01 — Postgres app-role connection split (migrations role vs app role)

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 00-b db scaffold (gap-fill)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00d-002]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** app_role exists
**WHEN** app server connects
**THEN** uses `app_role` (no DDL privileges); migration scripts use `postgres` (superuser); two DATABASE_URL env vars enforced

### ACP Prompt
```
# Task T-00b-A01 — Postgres app-role connection split

## Twoje zadanie
Rozdziel connection strings: DATABASE_URL (app_role, no DDL) vs DATABASE_URL_MIGRATIONS (superuser). Enforce w app code.

## Implementacja
1. Utwórz packages/db/connections.ts: export const appDb = drizzle(postgres(env.DATABASE_URL), { schema }); export const migrationsDb = drizzle(postgres(env.DATABASE_URL_MIGRATIONS), { schema })
2. Edytuj packages/db/index.ts — exportuj appDb jako 'db' default; migrationsDb tylko w scripts/
3. Dodaj DATABASE_URL_MIGRATIONS do .env.example z wartością superuser connection string
4. Guard: if (env.DATABASE_URL includes 'postgres:postgres') throw in production — app must not run as superuser
5. Integration test: appDb cannot run DDL (CREATE TABLE should throw)

## Files
**Create:** `packages/db/connections.ts`
**Modify:** `packages/db/index.ts`, `.env.example`

## Done when
- `vitest packages/db/connections.test.ts` PASS — appDb throws on DDL
- `pnpm test:smoke` green

## Rollback
`git rm packages/db/connections.ts`; revert index.ts
```

### Test gate (planning summary)
- **Integration:** appDb cannot run DDL
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm packages/db/connections.ts`

---

## §10 — Governance + docs

> All governance tasks are docs tasks. ACP Prompts are simple: read PRD section + write document to specified path.

---

## T-GOV-001 — Publish ADR-028 Schema-driven column definition

**Type:** docs
**Context budget:** ~20k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** []
- **Downstream (will consume this):** [T-GOV-005]
- **Parallel (can run concurrently):** [T-GOV-002, T-GOV-003, T-GOV-004]

### GIVEN / WHEN / THEN
**GIVEN** PRD §3 + ADR-028 reference docs exist
**WHEN** T-GOV-001 runs
**THEN** `docs/adr/ADR-028-schema-driven-column-definition.md` exists with: Context, Decision, DeptColumns/FieldTypes/Formulas metadata schema, forms/validators/views generation, open item hard-lock flag

### ACP Prompt
```
# Task T-GOV-001 — ADR-028 Schema-driven column definition

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §6 Schema-driven Foundation [ADR-028]

## Twoje zadanie
Utwórz docs/adr/ADR-028-schema-driven-column-definition.md per §6 PRD.

## Implementacja
1. Przeczytaj §6 Foundation PRD
2. Napisz ADR: Status (Active), Context (why schema-driven), Decision (DeptColumns table, FieldTypes enum, Formulas JSONB, runtime Zod compilation), Consequences (forms/validators/views generated from metadata), Open Items (hard-lock flag for superadmin-only cols)
3. Verifiable: another engineer can implement runtime engine from this ADR alone

## Files
**Create:** `docs/adr/ADR-028-schema-driven-column-definition.md`

## Done when
- File exists at docs/adr/ADR-028-schema-driven-column-definition.md
- Sections: Status, Context, Decision, Consequences, Open Items

## Rollback
`git rm docs/adr/ADR-028-schema-driven-column-definition.md`
```

### Test gate (planning summary)
- **Manual:** another engineer can implement runtime from ADR alone

### Rollback
`git rm docs/adr/ADR-028-schema-driven-column-definition.md`

---

## T-GOV-002 — Publish ADR-029 Rule engine DSL + workflow-as-data

**Type:** docs
**Context budget:** ~20k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** []
- **Downstream (will consume this):** [T-GOV-005]
- **Parallel (can run concurrently):** [T-GOV-001, T-GOV-003, T-GOV-004]

### GIVEN / WHEN / THEN
**GIVEN** PRD §7 Rule Engine spec
**WHEN** T-GOV-002 runs
**THEN** `docs/adr/ADR-029-rule-engine-dsl-workflow-as-data.md` with: 4 rule types, JSON runtime, Mermaid diagrams, wizard plans

### ACP Prompt
```
# Task T-GOV-002 — ADR-029 Rule engine DSL

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §7 Rule Engine DSL

## Twoje zadanie
Utwórz docs/adr/ADR-029-rule-engine-dsl-workflow-as-data.md per §7 PRD.

## Files
**Create:** `docs/adr/ADR-029-rule-engine-dsl-workflow-as-data.md`

## Done when
- File exists; sections: 4 rule types (cascading/conditional_required/gate/workflow), JSON runtime, Mermaid decision tree for each, wizard plans (deferred E-2)

## Rollback
`git rm docs/adr/ADR-029-rule-engine-dsl-workflow-as-data.md`
```

### Test gate (planning summary)
- **Manual:** engineer can implement all 4 interpreters from ADR

### Rollback
`git rm docs/adr/ADR-029*.md`

---

## T-GOV-003 — Publish ADR-030 Configurable department taxonomy

**Type:** docs
**Context budget:** ~20k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** []
- **Downstream (will consume this):** [T-GOV-005]
- **Parallel (can run concurrently):** [T-GOV-001, T-GOV-002, T-GOV-004]

### GIVEN / WHEN / THEN
**GIVEN** PRD §9 Configurable Dept Taxonomy
**WHEN** T-GOV-003 runs
**THEN** `docs/adr/ADR-030-configurable-department-taxonomy.md` with: Apex 7-dept baseline, split/merge/custom via tenant.dept_overrides JSONB, runtime resolution

### ACP Prompt
```
# Task T-GOV-003 — ADR-030 Configurable department taxonomy

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §9 Configurable Department Taxonomy

## Files
**Create:** `docs/adr/ADR-030-configurable-department-taxonomy.md`

## Done when
- File exists; sections: Apex 7-dept baseline [APEX-CONFIG], split/merge/custom via dept_overrides JSONB, runtime resolution algorithm, seed + override roundtrip described

## Rollback
`git rm docs/adr/ADR-030*.md`
```

### Test gate (planning summary)
- **Manual:** seed + override roundtrip unambiguous

### Rollback
`git rm docs/adr/ADR-030*.md`

---

## T-GOV-004 — Publish ADR-031 Schema variation per org L1-L4

**Type:** docs
**Context budget:** ~20k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** []
- **Downstream (will consume this):** [T-GOV-005]
- **Parallel (can run concurrently):** [T-GOV-001, T-GOV-002, T-GOV-003]

### GIVEN / WHEN / THEN
**GIVEN** PRD §8 Multi-tenant Model L1-L4
**WHEN** T-GOV-004 runs
**THEN** `docs/adr/ADR-031-schema-variation-per-org-L1-L4.md` with: L1/L2/L3/L4 classification, canary upgrade orchestration

### ACP Prompt
```
# Task T-GOV-004 — ADR-031 Schema variation per org L1-L4

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §8 Multi-tenant Model L1-L4

## Files
**Create:** `docs/adr/ADR-031-schema-variation-per-org-L1-L4.md`

## Done when
- File exists; sections: L1 core universal, L2 org config, L3 ext_jsonb, L4 private_jsonb, how to classify any new column, canary upgrade orchestration

## Rollback
`git rm docs/adr/ADR-031*.md`
```

### Test gate (planning summary)
- **Manual:** engineer can classify any new column into L1-L4

### Rollback
`git rm docs/adr/ADR-031*.md`

---

## T-GOV-005 — Marker discipline reference doc

**Type:** docs
**Context budget:** ~15k tokens
**Est time:** 45 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-001, T-GOV-002, T-GOV-003, T-GOV-004]
- **Downstream (will consume this):** [T-GOV-006]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** 4 ADRs published
**WHEN** T-GOV-005 runs
**THEN** `docs/MARKER-DISCIPLINE.md` with: [UNIVERSAL]/[APEX-CONFIG]/[EVOLVING]/[LEGACY-D365] definitions + canonical examples from PRD §2

### ACP Prompt
```
# Task T-GOV-005 — Marker discipline reference doc

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §2 Marker Discipline

## Files
**Create:** `docs/MARKER-DISCIPLINE.md`

## Done when
- File exists; 4 markers with definition, when to use, canonical examples (3+ per marker)
- A reader can classify any PRD section in <60s

## Rollback
`git rm docs/MARKER-DISCIPLINE.md`
```

### Test gate (planning summary)
- **Manual:** reader can classify any PRD section in <60s

### Rollback
`git rm docs/MARKER-DISCIPLINE.md`

---

## T-GOV-006 — Marker discipline lint check

**Type:** T4-wiring+test
**Context budget:** ~25k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-005, T-00a-006]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** marker discipline doc exists
**WHEN** CI runs on modified PRD/ADR/skill files
**THEN** sections describing business behaviour without a marker are rejected

### ACP Prompt
```
# Task T-GOV-006 — Marker discipline lint check

## Twoje zadanie
Utwórz scripts/lint-markers.ts — regex scan PRD/ADR/skill files dla unmarked business behaviour sections.

## Implementacja
1. Utwórz scripts/lint-markers.ts: scan *.md files in _foundation/ + docs/adr/; for each section header (##) not followed by marker tag [UNIVERSAL|APEX-CONFIG|EVOLVING|LEGACY-D365] within 3 lines → report error
2. Wire do .husky/pre-commit + CI job
3. Unit test: fixture valid (marked) → exit 0; fixture invalid (unmarked) → exit 1

## Files
**Create:** `scripts/lint-markers.ts`, `scripts/lint-markers.test.ts`
**Modify:** `.husky/pre-commit`, `.github/workflows/ci.yml`

## Done when
- `vitest scripts/lint-markers.test.ts` PASS — valid/invalid fixtures
- Pre-commit blocks unmarked section

- `pnpm test:smoke` green
## Rollback
Remove from .husky/pre-commit; disable CI job
```

### Test gate (planning summary)
- **Unit:** valid/invalid fixtures
- **CI gate:** marker lint job green

### Rollback
Remove from .husky/pre-commit

---

## T-GOV-007 — Personas and module map reference docs

**Type:** docs
**Context budget:** ~18k tokens
**Est time:** 45 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** []
- **Downstream (will consume this):** [T-GOV-008, T-GOV-009]
- **Parallel (can run concurrently):** [T-GOV-001, T-GOV-002, T-GOV-003, T-GOV-004]

### GIVEN / WHEN / THEN
**GIVEN** Foundation PRD §3 + §4 exist
**WHEN** T-GOV-007 runs
**THEN** `docs/PERSONAS.md` + `docs/MODULE-MAP.md` with: PRD §3 personas, §4 15-module table, build sequence

### ACP Prompt
```
# Task T-GOV-007 — Personas and module map reference docs

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §3 Personas, §4 Module Map

## Files
**Create:** `docs/PERSONAS.md`, `docs/MODULE-MAP.md`

## Done when
- PERSONAS.md: all personas from §3 with roles + permissions
- MODULE-MAP.md: 15-module table from §4 with build order + phase

## Rollback
`git rm docs/PERSONAS.md docs/MODULE-MAP.md`
```

### Test gate (planning summary)
- **Manual:** all 15 modules have a row

### Rollback
`git rm docs/PERSONAS.md docs/MODULE-MAP.md`

---

## T-GOV-008 — Regulatory roadmap artifact

**Type:** docs
**Context budget:** ~25k tokens
**Est time:** 90 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-007]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** PRD regulatory references (FSMA/EUDR/Peppol/ViDA/BRCGS/FIC/KSeF)
**WHEN** T-GOV-008 runs
**THEN** `docs/regulatory/*.md` (one per regulation) with: deadlines, impacted modules, quarterly review cadence, owner

### ACP Prompt
```
# Task T-GOV-008 — Regulatory roadmap artifact

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §11 Cross-cutting Requirements (regulatory refs)

## Files
**Create:** `docs/regulatory/FSMA.md`, `docs/regulatory/EUDR.md`, `docs/regulatory/PEPPOL.md`, `docs/regulatory/VIDA.md`, `docs/regulatory/BRCGS.md`, `docs/regulatory/FIC-1169.md`, `docs/regulatory/KSEF.md`

## Done when
- 7 files exist; each has: deadline, impacted modules (list), quarterly review date, owner (role name)

## Rollback
`git rm -r docs/regulatory/`
```

### Test gate (planning summary)
- **Manual:** 7 regulatory files, each with deadline + modules

### Rollback
`git rm -r docs/regulatory/`

---

## T-GOV-009 — Out-of-scope policy doc

**Type:** docs
**Context budget:** ~15k tokens
**Est time:** 45 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-007]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-GOV-008]

### GIVEN / WHEN / THEN
**GIVEN** PRD §11 out-of-scope list
**WHEN** T-GOV-009 runs
**THEN** `docs/OUT-OF-SCOPE.md` with: GL/AP/AR, HR, CRM, on-prem, blockchain, autonomous LLM (7 items) + use-instead pointers

### ACP Prompt
```
# Task T-GOV-009 — Out-of-scope policy doc

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §11 [R8] out-of-scope items

## Files
**Create:** `docs/OUT-OF-SCOPE.md`

## Done when
- File exists; 7 items each with alternative tool/workflow named; cross-links to PRD §11

## Rollback
`git rm docs/OUT-OF-SCOPE.md`
```

### Test gate (planning summary)
- **Manual:** 7 items, each with alternative

### Rollback
`git rm docs/OUT-OF-SCOPE.md`

---

## T-GOV-010 — Build posture + DR policy doc

**Type:** docs
**Context budget:** ~18k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-006, T-00a-006b, T-00i-002, T-00b-005]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** CI + pre-commit + drift detector exist
**WHEN** T-GOV-010 runs
**THEN** `docs/BUILD-POSTURE.md` with: no-DDL-in-request-path, app-role tests, index audit, drift detection, 40k PR cap, quarterly DR runbook

### ACP Prompt
```
# Task T-GOV-010 — Build posture + DR policy doc

## Files
**Create:** `docs/BUILD-POSTURE.md`

## Done when
- File exists; invariants: no-DDL-in-request, app-role connection, index audit, drift detection, 40k token cap; each has CI/gate reference; DR runbook section with quarterly cadence

## Rollback
`git rm docs/BUILD-POSTURE.md`
```

### Test gate (planning summary)
- **Manual:** each invariant has CI gate reference

### Rollback
`git rm docs/BUILD-POSTURE.md`

---

## T-GOV-011 — Pre-Phase-D ADR review tracker (ADR-001..019)

**Type:** docs
**Context budget:** ~18k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-001, T-GOV-002, T-GOV-003, T-GOV-004]
- **Downstream (will consume this):** [T-GOV-012]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** 4 active ADRs published
**WHEN** T-GOV-011 runs
**THEN** `docs/adr/_review/pre-phase-d-audit.md` with: table ADR-001..019 flagging collisions, verdict TBD with owner + phase

### ACP Prompt
```
# Task T-GOV-011 — Pre-Phase-D ADR review tracker

## Files
**Create:** `docs/adr/_review/pre-phase-d-audit.md`

## Done when
- Table: ADR-001 through ADR-019 each with: status (Active/Superseded/Collides), verdict (OK/TBD/Needs update), owner, phase for resolution
- ADR-002/003/006/008/013 flagged as potential collisions

## Rollback
`git rm docs/adr/_review/pre-phase-d-audit.md`
```

### Test gate (planning summary)
- **Manual:** all 19 ADRs have a row

### Rollback
`git rm docs/adr/_review/pre-phase-d-audit.md`

---

## T-GOV-012 — Open items register (Phase D carry-forward)

**Type:** docs
**Context budget:** ~18k tokens
**Est time:** 60 min
**Parent feature:** governance
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-011]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** ADR review + PRD open items known
**WHEN** T-GOV-012 runs
**THEN** `docs/conventions/OPEN-ITEMS.md` with: all 16 PRD §14 items, phase owners, status, review cadence

### ACP Prompt
```
# Task T-GOV-012 — Open items register

## Context
- /Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md → §14 Open Items (carry-forward)

## Files
**Create:** `docs/conventions/OPEN-ITEMS.md`

## Done when
- All open items from §14 present; each has: phase owner, status (open/resolved), review cadence (monthly/quarterly), cross-link to task or ADR

## Rollback
`git rm docs/conventions/OPEN-ITEMS.md`
```

### Test gate (planning summary)
- **Manual:** all §14 items present

### Rollback
`git rm docs/conventions/OPEN-ITEMS.md`

---

## §11 — ADR Candidate stubs R1-R15

> All 15 stubs follow identical template: Title, [MARKER], Source PRD §12 #RN, Open questions, Deferral note. Output to `docs/adr/candidates/ADR-RNN-<slug>.md`.

---

## T-ADR-R01 — Stub R1 EPCIS 2.0 / GS1 Digital Link

**Type:** docs
**Context budget:** ~10k
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-004]
- **Downstream (will consume this):** [T-GOV-012]
- **Parallel (can run concurrently):** [T-ADR-R02, T-ADR-R03, T-ADR-R04, T-ADR-R05]

### GIVEN / WHEN / THEN
**WHEN** T-ADR-R01 runs **THEN** `docs/adr/candidates/ADR-R01-epcis-gs1-digital-link.md` exists with template filled

### ACP Prompt
```
# Task T-ADR-R01 — ADR Stub R1: EPCIS 2.0 / GS1 Digital Link
**Files to create:** docs/adr/candidates/ADR-R01-epcis-gs1-digital-link.md
**Template:** Title: "EPCIS 2.0 + GS1 Digital Link for lot traceability"; Marker: [UNIVERSAL]; Source: Foundation PRD §12 #R1; Open questions: 3+ (e.g., GS1 registry partner? EPCIS 2.0 vs 1.2?); Deferral: "Will be promoted to ADR-NNN when scanner/shipping modules land (E-1/E-2)"
**Done when:** File exists matching template
**Rollback:** git rm docs/adr/candidates/ADR-R01-epcis-gs1-digital-link.md
```

### Rollback
`git rm docs/adr/candidates/ADR-R01-*.md`

---

## T-ADR-R02 — Stub R2 Main Table 69 typed columns

**Type:** docs
**Context budget:** ~10k
**Est time:** 25 min
**Parent feature:** T-43 split
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-004]
- **Downstream (will consume this):** [T-GOV-012]
- **Parallel (can run concurrently):** [T-ADR-R01, T-ADR-R03, T-ADR-R04, T-ADR-R05]

### GIVEN / WHEN / THEN
**WHEN** T-ADR-R02 runs **THEN** `docs/adr/candidates/ADR-R02-main-table-69-cols.md` exists

### ACP Prompt
```
# Task T-ADR-R02 — ADR Stub R2: Main Table 69 typed columns
**Files:** docs/adr/candidates/ADR-R02-main-table-69-cols.md
**Template:** Title: "Main Table 69 typed columns (Apex baseline)"; Marker: [APEX-CONFIG]; Source: PRD §12 #R2; Open questions: column addition process, L3 migration strategy; Deferral: will formalize when Admin UI wizard lands
**Done when:** File exists **Rollback:** git rm file
```

### Rollback
`git rm docs/adr/candidates/ADR-R02-*.md`

---

## T-ADR-R03 through T-ADR-R15 — Stubs R3-R15 (compact batch)

**Type:** docs
**Context budget:** ~10k each
**Est time:** 25 min each
**Parent feature:** T-43 split
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-004]
- **Downstream (will consume this):** [T-GOV-012]
- **Parallel (can run concurrently):** [T-ADR-R01, T-ADR-R02]

### GIVEN / WHEN / THEN
**WHEN** agent runs **THEN** all 13 remaining ADR stubs R3-R15 created at `docs/adr/candidates/`

### ACP Prompt
```
# Task T-ADR-R03..R15 — ADR Candidate stubs R3 through R15 (batch)

## Twoje zadanie
Utwórz 13 ADR candidate stub files. Each file uses identical template: Title, [MARKER], Source PRD §12 #RN, 3+ Open questions, Deferral note.

## Files to create
- docs/adr/candidates/ADR-R03-rls-leakproof-definer.md — [UNIVERSAL] — R3: RLS LEAKPROOF SECURITY DEFINER pattern
- docs/adr/candidates/ADR-R04-zod-runtime-deptcolumns.md — [UNIVERSAL] — R4: Zod schema compiled from DeptColumns metadata
- docs/adr/candidates/ADR-R05-pwa-indexeddb-sync.md — [UNIVERSAL] — R5: PWA + IndexedDB offline sync queue
- docs/adr/candidates/ADR-R06-posthog-flags.md — [UNIVERSAL] — R6: PostHog self-host feature flags
- docs/adr/candidates/ADR-R07-data-residency-eu.md — [UNIVERSAL] — R7: EU data residency cluster default
- docs/adr/candidates/ADR-R08-d365-adapter-contracts.md — [LEGACY-D365] — R8: D365 pull/push adapter contracts
- docs/adr/candidates/ADR-R09-outbox-dlq.md — [UNIVERSAL] — R9: Outbox + DLQ orchestration with pg-boss
- docs/adr/candidates/ADR-R10-audit-append-only.md — [UNIVERSAL] — R10: Audit append-only partitioned table + retention
- docs/adr/candidates/ADR-R11-i18n-icu.md — [UNIVERSAL] — R11: i18n ICU pl/en/uk/ro (deferred to E-1)
- docs/adr/candidates/ADR-R12-canary-rollout.md — [UNIVERSAL] — R12: Canary rollout orchestration per tenant
- docs/adr/candidates/ADR-R13-identity-cols-ai-trace.md — [UNIVERSAL] — R13: R13 identity columns for AI/trace
- docs/adr/candidates/ADR-R14-uuid-v7-transaction-id.md — [UNIVERSAL] — R14: UUID v7 transaction_id idempotency
- docs/adr/candidates/ADR-R15-gs1-128-parser.md — [UNIVERSAL] — R15: GS1-128 barcode parser + AI identifiers

## Done when
- 13 files created
- Each file has: Title, Marker, Source (PRD §12 #RN), 3+ Open questions, Deferral note

## Rollback
`git rm docs/adr/candidates/ADR-R03-*.md ... ADR-R15-*.md`
```

### Test gate (planning summary)
- **Manual:** 13 files created with template

### Rollback
`git rm docs/adr/candidates/ADR-R0[3-9]*.md docs/adr/candidates/ADR-R1*.md`

---

## T-OOS-001 — E-0 out-of-scope pointer doc

**Type:** docs
**Context budget:** ~12k tokens
**Est time:** 30 min
**Parent feature:** governance pointer
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 120
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-GOV-009]
- **Downstream (will consume this):** [T-GOV-012]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**WHEN** T-OOS-001 runs **THEN** `docs/OUT-OF-SCOPE-E0.md` with consolidated pointers to D365/Peppol/GS1/theming/OTel/i18n deferred work

### ACP Prompt
```
# Task T-OOS-001 — E-0 out-of-scope pointer doc

## Twoje zadanie
Utwórz docs/OUT-OF-SCOPE-E0.md — consolidated list of E-0 deferred items per decisions #2 and #4.

## Files
**Create:** docs/OUT-OF-SCOPE-E0.md

## Content to include
- D365 adapter → defer to E-2 per module (was T-37)
- Peppol AP adapter → defer to E-2 (was T-38)
- GS1-128 parser → defer to E-2, lands in scanner/shipping (was T-39)
- Per-tenant theming hook → defer to E-1 settings carveout (was T-9)
- OpenTelemetry (beyond Sentry) → defer post-E-0 (was T-17 partial)
- i18n scaffold pl/en/uk/ro → defer to E-1 per ADR-032 (was T-19)

Each row: item name, phase owner, rationale, cross-link to ADR or task ID

## Done when
- File exists; 6 items; each has phase owner + rationale + cross-link

## Rollback
`git rm docs/OUT-OF-SCOPE-E0.md`
```

### Test gate (planning summary)
- **Manual:** 6 deferred items, each with phase + rationale + cross-link

### Rollback
`git rm docs/OUT-OF-SCOPE-E0.md`

---

## Dependency Table

| ID | Type | Upstream | Parallel |
|---|---|---|---|
| T-00b-000 | T1 | [T-00a-005, T-00b-001] | [] |
| T-00b-E01 | T1 | [T-00a-005] | [T-00b-E02, T-00b-E03] |
| T-00b-E02 | T1 | [T-00a-005] | [T-00b-E01, T-00b-E03] |
| T-00b-E03 | T1 | [T-00a-005] | [T-00b-E01, T-00b-E02] |
| T-00a-001 | T1 | [] | [] |
| T-00a-002 | T3 | [T-00a-001] | [T-00a-007] |
| T-00a-003 | T3 | [T-00a-002] | [T-00a-004] |
| T-00a-004 | T4 | [T-00a-002] | [T-00a-003] |
| T-00a-005 | docs | [T-00a-001] | [T-00a-002, T-00a-003, T-00a-004] |
| T-00a-006 | T4 | [T-00a-004] | [] |
| T-00a-007 | T2 | [T-00a-002] | [T-00a-003] |
| T-00a-008 | T3 | [T-00a-002] | [T-00a-007] |
| T-00a-009 | T2 | [T-00a-008] | [] |
| T-00b-001 | T1 | [T-00a-007] | [T-00b-E01, T-00b-E02, T-00b-E03] |
| T-00b-002 | T1 | [T-00b-001] | [T-00b-E01, T-00b-E02, T-00b-E03] |
| T-00b-003 | T2 | [T-00b-000, T-00b-002] | [T-00b-004] |
| T-00b-004 | T5 | [T-00b-000] | [T-00b-003] |
| T-00b-005 | T2 | [T-00b-003, T-00h-001] | [T-00b-004] |
| T-00b-006 | T2 | [T-00b-002] | [T-00b-005] |
| T-00b-M01 | T1 | [T-00b-000, T-00h-001] | [T-00f-001, T-00g-001] |
| T-00b-A01 | T1 | [T-00d-002] | [] |
| T-00c-001 | T1 | [T-00b-000] | [T-00d-001] |
| T-00c-002 | T2 | [T-00c-001, T-00b-E01, T-00f-002] | [T-00c-003] |
| T-00c-003 | T2 | [T-00c-001, T-00b-006] | [T-00c-002] |
| T-00c-004 | T3 | [T-00c-002, T-00a-003] | [T-00c-005] |
| T-00c-005 | T2 | [T-00c-002] | [T-00c-004] |
| T-00c-006 | T4 | [T-00c-003, T-00c-004, T-00c-005, T-00i-005] | [] |
| T-00d-001 | T2 | [T-00b-000] | [T-00c-001] |
| T-00d-002 | T1 | [T-00d-001, T-00c-003] | [T-00d-003] |
| T-00d-003 | T1 | [T-00d-001] | [T-00d-002] |
| T-00d-004 | T4 | [T-00d-002, T-00d-003, T-00b-004] | [T-00e-004] |
| T-00d-005 | T2 | [T-00c-003, T-00e-002] | [T-00d-004] |
| T-00e-001 | T1 | [T-00b-000] | [T-00c-001, T-00d-001] |
| T-00e-002 | T1 | [T-00e-001] | [T-00e-004] |
| T-00e-003 | T2 | [T-00e-002, T-00f-002, T-00b-E02] | [T-00e-004] |
| T-00e-004 | T2 | [T-00e-002, T-00b-E01] | [T-00e-003, T-00d-004] |
| T-00e-005 | T2 | [T-00e-001, T-00f-003] | [T-00e-004] |
| T-00f-001 | T1 | [T-00b-000] | [T-00e-001] |
| T-00f-002 | T2 | [T-00f-001, T-00b-E02] | [T-00f-004] |
| T-00f-003 | T2 | [T-00f-001] | [T-00f-004] |
| T-00f-004 | T1 | [T-00f-001] | [T-00f-002] |
| T-00f-005 | T2 | [T-00f-003] | [T-00f-006] |
| T-00f-006 | T4 | [T-00f-002, T-00f-003, T-00f-004] | [T-00d-004] |
| T-00g-001 | T1 | [T-00b-000] | [T-00h-001] |
| T-00g-002 | T2 | [T-00g-001] | [T-00g-003, T-00g-004] |
| T-00g-003 | T2 | [T-00g-001] | [T-00g-002, T-00g-004] |
| T-00g-004 | T2 | [T-00g-001] | [T-00g-002, T-00g-003] |
| T-00g-005 | T2 | [T-00g-002, T-00g-003, T-00g-004] | [T-00h-002] |
| T-00g-006 | T2 | [T-00g-005, T-00b-E01] | [T-00g-007] |
| T-00g-007 | T5 | [T-00g-001, T-00b-004] | [T-00g-006] |
| T-00g-008 | T2 | [T-00g-001] | [] |
| T-00h-001 | T1 | [T-00b-000, T-00b-E03] | [T-00g-001] |
| T-00h-002 | T2 | [T-00h-001] | [T-00g-005] |
| T-00h-003 | T2 | [T-00h-001] | [T-00h-002] |
| T-00h-004 | T2 | [T-00h-001] | [T-00h-003] |
| T-00h-005 | T4 | [T-00h-003, T-00h-004] | [T-00f-006] |
| T-00i-001 | T4 | [T-00a-004] | [T-00i-005] |
| T-00i-002 | T4 | [T-00i-001, T-00i-003, T-00i-005] | [T-00i-004] |
| T-00i-003 | T4 | [T-00b-001, T-00b-003, T-00i-001] | [T-00i-005] |
| T-00i-004 | T5 | [T-00b-004] | [T-00i-002] |
| T-00i-005 | T4 | [T-00a-002, T-00i-001] | [T-00i-003] |
| T-00i-006 | T4 | [T-00a-007] | [T-00i-007] |
| T-00i-007 | T2 | [T-00a-007] | [T-00i-006] |
| T-00i-008 | T4 | [T-00i-002, T-00f-005, T-00i-006] | [T-00i-009] |
| T-00i-009 | T4 | [T-00i-005] | [T-00i-008] |
| T-00i-010 | T2 | [T-00f-005, T-00b-002] | [T-00i-009] |
| T-00i-011 | T4 | [T-00c-006, T-00d-004, T-00e-004, T-00f-006, T-00g-006, T-00h-005, T-00i-002, T-00i-010, T-00a-008, T-00a-009, T-00b-M01] | [] |
| T-00a-006b | T4 | [T-00a-006] | [] |
| T-00b-A01 | T1 | [T-00d-002] | [] |
| T-GOV-001..004 | docs | [] | [each other] |
| T-GOV-005 | docs | [T-GOV-001, T-GOV-002, T-GOV-003, T-GOV-004] | [] |
| T-GOV-006 | T4 | [T-GOV-005, T-00a-006] | [] |
| T-GOV-007 | docs | [] | [T-GOV-001..004] |
| T-ADR-R01..R15 | docs | [T-GOV-004] | [each other] |

---

## Parallel Dispatch Plan

### Wave 0 — HARD BLOCKERS (dispatch simultaneously, wait for all 4)
`T-00b-E01`, `T-00b-E02`, `T-00b-E03` ← can run in parallel immediately after `T-00a-005`

### Wave 0.5 — Root scaffold (no upstream)
`T-00a-001` → then `T-00a-002`

### Wave 1 — After T-00a-001+002 and enum locks
`T-00a-003`, `T-00a-004`, `T-00a-005`, `T-00a-007`, `T-00a-008`

### Wave 2 — After Wave 1 (DB init)
`T-00b-001` → then `T-00b-002`, `T-00b-E01`, `T-00b-E02`, `T-00b-E03`

### Wave 3 — After T-00b-000 applied (baseline migration)
`T-00c-001`, `T-00d-001`, `T-00e-001`, `T-00f-001`, `T-00g-001`, `T-00h-001` ← 6 parallel schema migrations

### Wave 4 — After Wave 3 schemas
`T-00b-003`, `T-00b-004`, `T-00b-006`, `T-00c-002`, `T-00c-003`, `T-00d-002`, `T-00d-003`, `T-00e-002`, `T-00f-002`, `T-00f-003`, `T-00f-004`, `T-00g-002`, `T-00g-003`, `T-00g-004`, `T-00h-002`, `T-00h-003`, `T-00h-004`, `T-00i-001`, `T-00i-003`, `T-00i-005`, `T-00i-006`, `T-00i-007`

### Wave 5 — After Wave 4
`T-00b-005`, `T-00b-M01`, `T-00c-004`, `T-00c-005`, `T-00d-004`, `T-00e-003`, `T-00e-004`, `T-00e-005`, `T-00f-005`, `T-00f-006`, `T-00g-005`, `T-00g-006`, `T-00g-007`, `T-00g-008`, `T-00h-005`, `T-00i-002`, `T-00i-004`, `T-00i-008`, `T-00i-009`, `T-00i-010`, `T-00i-011` (after all others)

### Wave 6 — Sequential close
`T-00c-006` (needs c003+c004+c005+i005) → `T-00b-A01` (needs d002) → `T-00a-006b` (needs a006)

### Wave 7 — Docs (can run in parallel from Wave 0)
`T-GOV-001`, `T-GOV-002`, `T-GOV-003`, `T-GOV-004`, `T-GOV-007`, `T-ADR-R01`..`T-ADR-R15` (all parallel)

### Wave 8 — Final docs (need Wave 7)
`T-GOV-005` → `T-GOV-006`; `T-GOV-008`, `T-GOV-009`, `T-GOV-010`, `T-GOV-011` → `T-GOV-012`, `T-OOS-001`

---

## PRD Coverage

| Section | Covered by | Status |
|---|---|---|
| §1 Six Architectural Principles | T-GOV-001..004 (ADRs) | ✅ |
| §2 Marker Discipline | T-GOV-005, T-GOV-006 | ✅ |
| §3 Personas | T-GOV-007 | ✅ |
| §4 Module Map + Build Sequence | T-GOV-007 | ✅ |
| §5 Tech Stack (pnpm/Next.js/Drizzle/Supabase/shadcn/pg-boss/Sentry/PostHog) | T-00a-001..009 + T-00b-001..006 + T-00i-006..007 | ✅ |
| §6 Schema-driven Foundation (ADR-028) | T-00h-001..005, T-GOV-001 | ✅ |
| §7 Rule Engine DSL (ADR-029) | T-00g-001..008, T-GOV-002 | ✅ |
| §8 Multi-tenant Model L1-L4 (ADR-031) | T-00d-001..005, T-00b-000, T-GOV-004 | ✅ |
| §9 Configurable Dept Taxonomy (ADR-030) | T-00h-001, T-GOV-003 | ✅ |
| §10 Event-first + AI/Trace-ready Schema (R13) | T-00f-001..006, T-00e-001..005 + R13 cols in T-00b-000 | ✅ |
| §11 Cross-cutting Requirements (R1-R15) | T-ADR-R01..R15 (stubs); code impl per module | ✅ stubs |
| §12 ADR candidates (R1-R15) | T-ADR-R01..R15 | ✅ |
| §13 Success Criteria | T-00i-011 (DoD acceptance harness) | ✅ |
| §14 Open Items | T-GOV-012 | ✅ |
| PWA + IndexedDB (Phase D decision #3) | T-00a-008, T-00a-009 | ✅ |
| Token cap gate (Phase D decision #5) | T-00a-006b | ✅ |
| Admin UI wizard (ADR-028 runtime) | — | ❌ DEFERRED to E-2 |
| Per-tenant theming | — | ❌ DEFERRED to E-1 |
| i18n pl/en/uk/ro | — | ❌ DEFERRED to E-1 |
| OpenTelemetry beyond Sentry | — | ❌ DEFERRED post-E-0 |

---

## Task Count Summary

| Type | 00a | 00b | 00c | 00d | 00e | 00f | 00g | 00h | 00i | GOV | ADR/OOS | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T1-schema | 2 | 4 | 1 | 2 | 2 | 2 | 1 | 1 | 0 | 0 | 0 | **15** |
| T2-api | 2 | 2 | 3 | 1 | 3 | 3 | 5 | 4 | 2 | 0 | 0 | **25** |
| T3-ui | 3 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **4** |
| T4-wiring+test | 2 | 0 | 1 | 2 | 0 | 1 | 0 | 1 | 9 | 1 | 0 | **17** |
| T5-seed | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 1 | 0 | 0 | **3** |
| docs | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 12 | 16 | **28** |
| gap-fills | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | **4** |
| **Sub-total** | **11** | **8** | **6** | **5** | **5** | **6** | **7** | **6** | **13** | **13** | **16** | **96** |

> Note: T-ADR-R03..R15 counted as 1 batch task (13 files) for simplicity.

**Total tasks:** 96 (incl. gap-fills; matches 95-task merged plan + 1 additional T-ADR batch consolidation)
**Estimated total time:** ~3,120 min (~52 hours raw)
**Parallelization potential:**
- Wave 3: 6 schema migrations in parallel → saves ~4 hours
- Wave 4: 22 tasks in parallel → saves ~15 hours
- Effective wall-clock: ~18-22 hours with full parallelization

