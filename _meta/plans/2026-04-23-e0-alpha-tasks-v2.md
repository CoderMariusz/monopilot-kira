---
title: Phase E-0 Track α — enum locks + 00-a + 00-b (v2 ACP format)
date: 2026-04-23
sub-modules: 00-a, 00-b, enum-locks
total_tasks: 17
---

# Phase E-0 Track α — enum locks + 00-a + 00-b

**Scope:** §0 Architect enum locks (Wave 0 hard blockers) + Sub-module 00-a Monorepo/Next.js scaffold + Sub-module 00-b Supabase/Drizzle scaffolding.

---

## §0 — Architect enum locks (Wave 0 — HARD BLOCKERS)

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
- **Upstream (must be done first):** [T-00a-005 — Root README + CONTRIBUTING skeleton, T-00b-001 — Supabase local bootstrap]
- **Downstream (will consume this):** [T-00b-003 — Migration runner scripts, T-00b-004 — Seed runner, T-00b-M01 — Main Table migration]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** Supabase local and Drizzle config are initialised (T-00b-001 and T-00b-002 done)
**WHEN** the baseline migration is applied via `pnpm migrate`
**THEN** tables `tenants`, `users`, `user_tenants`, `roles`, `user_roles`, `modules`, `organization_modules` exist with `tenant_id UUID NOT NULL` and all R13 columns on every business table: `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`, `tenant_id UUID NOT NULL REFERENCES tenants(id)`, `created_at TIMESTAMPTZ DEFAULT now()`, `created_by_user UUID`, `created_by_device UUID`, `app_version TEXT`, `model_prediction_id UUID`, `epcis_event_id UUID`, `external_id TEXT`, `schema_version INT NOT NULL DEFAULT 1`

### ACP Prompt
````
# Task T-00b-000 — Baseline migration `001-baseline.sql`

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §10 — Event-first + AI/Trace-ready Schema` — R13 columns spec dla każdej business table
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — R13 column requirements i Drizzle ORM constraints

## Twoje zadanie
Monorepo ma Supabase local running i Drizzle config gotowy. Utwórz baseline Drizzle schema + wygeneruj migration SQL który zakłada 7 core tables: `tenants`, `users`, `user_tenants`, `roles`, `user_roles`, `modules`, `organization_modules`. Każda business table musi mieć dokładnie te kolumny R13:

````
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
tenant_id UUID NOT NULL REFERENCES tenants(id),
created_at TIMESTAMPTZ DEFAULT now(),
created_by_user UUID,
created_by_device UUID,
app_version TEXT,
model_prediction_id UUID,
epcis_event_id UUID,
external_id TEXT,
schema_version INT NOT NULL DEFAULT 1
```

Tabela `tenants` jest root — nie ma FK do siebie, ale nadal ma `id`, `created_at`, `external_id`, `schema_version`. Tabela `users` ma dodatkowo `email TEXT NOT NULL UNIQUE`.

## Implementacja
1. Utwórz `drizzle/schema/baseline.ts` z 7 tabelami używając Drizzle ORM syntax: `pgTable`, `uuid`, `text`, `timestamp`, `integer` — każda tabela z pełnym zestawem R13 kolumn
2. Dopilnuj w `drizzle/schema/baseline.ts`, żeby każda tabela miała `schema_version INT NOT NULL DEFAULT 1` (already included w R13 powyżej)
3. Uruchom `pnpm drizzle-kit generate` — wygeneruje `drizzle/migrations/001-baseline.sql`
4. Dry-run na ephemeral Postgres: `psql $DATABASE_URL -f drizzle/migrations/001-baseline.sql` — zweryfikuj via `\d+ tenants` że kolumny są prawidłowe
5. Zaktualizuj `drizzle.config.ts` żeby wskazywał na `drizzle/schema/baseline.ts` jeśli jeszcze nie wskazuje

## Files
**Create:** `drizzle/schema/baseline.ts`, `drizzle/migrations/001-baseline.sql`
**Modify:** `drizzle.config.ts` — dodaj: schema path pointing to `drizzle/schema/baseline.ts`

## Done when
- `vitest drizzle/migrations/001-baseline.integration.test.ts` PASS — sprawdza: wszystkie 7 tabel istnieje, R13 cols obecne na każdej, `schema_version` default = 1
- `pnpm test:smoke` green

## Rollback
`pnpm drizzle-kit drop` — drops all tables in baseline migration.
```

### Test gate (planning summary)
- **Integration:** `vitest drizzle/migrations/001-baseline.integration.test.ts` — covers: 7 tables present, R13 columns, schema_version default
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop` (drops all in baseline migration).
## T-00b-E01 — `permissions.enum.ts` lock (architect)

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
- **Upstream (must be done first):** [T-00a-005 — Root README + CONTRIBUTING skeleton]
- **Downstream (will consume this):** [every task that checks RBAC — T-00c-002, T-00d-002, T-00e-002, T-00f-002]
- **Parallel (can run concurrently):** [T-00b-E02 — events.enum.ts lock, T-00b-E03 — ref-tables.enum.ts lock]

### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists (T-00a-001 done)
**WHEN** the RBAC enum file is merged to main
**THEN** `lib/rbac/permissions.enum.ts` is a single source of truth for 9 permission strings: `org.admin`, `fa.create`, `fa.edit`, `brief.convert_to_fa`, `closed_flag.unset`, `ref.edit`, `audit.read`, `outbox.admin`, `impersonate.tenant` — each with JSDoc docstring, exported as `Permission` union type and `ALL_PERMISSIONS` const array, marked readonly in CODEOWNERS

### ACP Prompt
````
# Task T-00b-E01 — `permissions.enum.ts` lock

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — RBAC guard pattern i permission strings
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T2-api constraints dla RBAC guard usage

## Twoje zadanie
Utwórz plik `lib/rbac/permissions.enum.ts` będący jedynym source of truth dla permission strings. Plik musi zawierać dokładnie te 9 permission strings jako const object z wartościami:

```typescript
export const Permission = {
  ORG_ADMIN: 'org.admin',
  FA_CREATE: 'fa.create',
  FA_EDIT: 'fa.edit',
  BRIEF_CONVERT_TO_FA: 'brief.convert_to_fa',
  CLOSED_FLAG_UNSET: 'closed_flag.unset',
  REF_EDIT: 'ref.edit',
  AUDIT_READ: 'audit.read',
  OUTBOX_ADMIN: 'outbox.admin',
  IMPERSONATE_TENANT: 'impersonate.tenant',
} as const;

export type PermissionType = typeof Permission[keyof typeof Permission];
export const ALL_PERMISSIONS: PermissionType[] = Object.values(Permission);
```

Każda wartość MUSI być w formacie `lowercase-dot-separated` (regex: `^[a-z]+(\.[a-z_]+)+$`). Dodaj JSDoc comment per entry opisując scope i kiedy używać.

## Implementacja
1. Utwórz `lib/rbac/permissions.enum.ts` z const object jak wyżej + `PermissionType` union + `ALL_PERMISSIONS` array
2. Dodaj JSDoc per permission w `lib/rbac/permissions.enum.ts` (1 linia: co daje, komu przypisywana)
3. Utwórz `lib/rbac/permissions.test.ts` z unit testem: brak duplikatów w `ALL_PERMISSIONS`, każda wartość pasuje do regex `^[a-z]+(\\.[a-z_]+)+$`
4. Dodaj wpis do `CODEOWNERS`: `lib/rbac/permissions.enum.ts @architect` (architect-only file)
5. Zacommituj zmiany obejmujące `lib/rbac/permissions.enum.ts`, `lib/rbac/permissions.test.ts` i `CODEOWNERS`

## Files
**Create:** `lib/rbac/permissions.enum.ts`, `lib/rbac/permissions.test.ts`
**Modify:** `CODEOWNERS` — dodaj: `lib/rbac/permissions.enum.ts @architect`

## Done when
- `vitest lib/rbac/permissions.test.ts` PASS — sprawdza: no dupes, regex `^[a-z]+(\.[a-z_]+)+$` na każdej wartości
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm lib/rbac/permissions.enum.ts lib/rbac/permissions.test.ts` — no downstream consumers yet, gate before parallel dispatch.
````
### Test gate (planning summary)
- **Unit:** `vitest lib/rbac/permissions.test.ts` — covers: no dupes, lowercase-dot format regex
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm lib/rbac/permissions.enum.ts lib/rbac/permissions.test.ts`
## T-00b-E02 — `events.enum.ts` lock (architect)

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
- **Upstream (must be done first):** [T-00a-005 — Root README + CONTRIBUTING skeleton]
- **Downstream (will consume this):** [every task emitting outbox events — T-00c-002, T-00d-002, T-00f-002]
- **Parallel (can run concurrently):** [T-00b-E01 — permissions.enum.ts lock, T-00b-E03 — ref-tables.enum.ts lock]

### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** the events enum file is merged
**THEN** `lib/outbox/events.enum.ts` is a single source of truth for outbox `event_type` strings in ISA-95 dot format: `org.created`, `user.invited`, `role.assigned`, `brief.created`, `fa.created`, `lp.received`, `wo.ready`, `audit.recorded` — exported as `EventType` union and `ALL_EVENTS` array, readonly in CODEOWNERS

### ACP Prompt
````
# Task T-00b-E02 — `events.enum.ts` lock

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §10 — Event-first + AI/Trace-ready Schema` — outbox event_type strings i ISA-95 dot-format convention
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T2-api constraints dla outbox insertOutboxEvent helper

## Twoje zadanie
Utwórz plik `lib/outbox/events.enum.ts` będący jedynym source of truth dla outbox `event_type` strings. Format ISA-95: `<aggregate>.<verb>`. Plik musi zawierać dokładnie te 8 event strings:

```typescript
export const EventType = {
  ORG_CREATED: 'org.created',
  USER_INVITED: 'user.invited',
  ROLE_ASSIGNED: 'role.assigned',
  BRIEF_CREATED: 'brief.created',
  FA_CREATED: 'fa.created',
  LP_RECEIVED: 'lp.received',
  WO_READY: 'wo.ready',
  AUDIT_RECORDED: 'audit.recorded',
} as const;

export type EventTypeValue = typeof EventType[keyof typeof EventType];
export const ALL_EVENTS: EventTypeValue[] = Object.values(EventType);
```

Format wszystkich wartości: `^[a-z]+\.[a-z_]+$` (ISA-95 prefix convention). Dodaj komentarz blokowy na górze pliku wyjaśniający ISA-95 naming convention i link do `00-FOUNDATION-PRD.md §10`.

## Implementacja
1. Utwórz `lib/outbox/events.enum.ts` z const object + `EventTypeValue` union + `ALL_EVENTS` array
2. Dodaj block comment na górze `lib/outbox/events.enum.ts`: ISA-95 naming convention + `<aggregate>.<verb>` pattern
3. Utwórz `lib/outbox/events.test.ts` z unit testem: brak duplikatów, format regex `^[a-z]+\\.[a-z_]+$`
4. Dodaj do `CODEOWNERS`: `lib/outbox/events.enum.ts @architect`
5. Zacommituj zmiany obejmujące `lib/outbox/events.enum.ts`, `lib/outbox/events.test.ts` i `CODEOWNERS`

## Files
**Create:** `lib/outbox/events.enum.ts`, `lib/outbox/events.test.ts`
**Modify:** `CODEOWNERS` — dodaj: `lib/outbox/events.enum.ts @architect`

## Done when
- `vitest lib/outbox/events.test.ts` PASS — sprawdza: no dupes, regex `^[a-z]+\.[a-z_]+$`
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm lib/outbox/events.enum.ts lib/outbox/events.test.ts` — gate before downstream dispatch.
````
### Test gate (planning summary)
- **Unit:** `vitest lib/outbox/events.test.ts` — covers: no dupes, ISA-95 dot format
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm lib/outbox/events.enum.ts lib/outbox/events.test.ts`
## T-00b-E03 — `ref-tables.enum.ts` lock (architect)

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
- **Upstream (must be done first):** [T-00a-005 — Root README + CONTRIBUTING skeleton]
- **Downstream (will consume this):** [T-00h-001 — schema-driven runtime, T-02SETa seeds]
- **Parallel (can run concurrently):** [T-00b-E01 — permissions.enum.ts lock, T-00b-E02 — events.enum.ts lock]

### GIVEN / WHEN / THEN
**GIVEN** monorepo scaffold exists
**WHEN** the ref-tables enum file is merged
**THEN** `lib/reference/ref-tables.enum.ts` contains 7 E-0-relevant reference table names locked: `dept_columns`, `pack_sizes`, `lines_by_pack_size`, `dieset_by_line_pack`, `templates`, `processes`, `close_confirm` — plus a comment block listing 10 deferred E-1/E-2 tables with pointer to ADR-032 §1.3

### ACP Prompt
````
# Task T-00b-E03 — `ref-tables.enum.ts` lock

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §6 — Schema-driven Foundation` — Reference tables i DeptColumns concept
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T1-schema constraints i Drizzle patterns

## Twoje zadanie
Utwórz plik `lib/reference/ref-tables.enum.ts` definiujący locked set 7 reference table names które są w scope E-0. Plik musi zawierać dokładnie:

```typescript
export const RefTable = {
  DEPT_COLUMNS: 'dept_columns',
  PACK_SIZES: 'pack_sizes',
  LINES_BY_PACK_SIZE: 'lines_by_pack_size',
  DIESET_BY_LINE_PACK: 'dieset_by_line_pack',
  TEMPLATES: 'templates',
  PROCESSES: 'processes',
  CLOSE_CONFIRM: 'close_confirm',
} as const;

export type RefTableName = typeof RefTable[keyof typeof RefTable];
export const ALL_REF_TABLES: RefTableName[] = Object.values(RefTable);
```

Dodaj comment blok PRZED const listujący 10 deferred tables (E-1/E-2 scope):
```
// Deferred to E-1/E-2 (see ADR-032 §1.3):
// allergens, certifications, customers, suppliers, units_of_measure,
// locations, equipment, bom_templates, quality_specs, line_configurations
```

## Implementacja
1. Utwórz `lib/reference/ref-tables.enum.ts` z const object (7 entries) + `RefTableName` union + `ALL_REF_TABLES` array
2. Dodaj comment block z deferred tables listą i linkiem do ADR-032 §1.3 w `lib/reference/ref-tables.enum.ts`
3. Cross-link comment do `02-SETTINGS-PRD.md §8.1` w `lib/reference/ref-tables.enum.ts` (reference tables spec)
4. Utwórz `lib/reference/ref-tables.test.ts` — unit test: brak duplikatów, 7 entries in E-0
5. Dodaj do `CODEOWNERS`: `lib/reference/ref-tables.enum.ts @architect`

## Files
**Create:** `lib/reference/ref-tables.enum.ts`, `lib/reference/ref-tables.test.ts`
**Modify:** `CODEOWNERS` — dodaj: `lib/reference/ref-tables.enum.ts @architect`

## Done when
- `vitest lib/reference/ref-tables.test.ts` PASS — sprawdza: no dupes, exactly 7 E-0 entries
- `pnpm test:unit` green
- `pnpm test:smoke` green

## Rollback
`git rm lib/reference/ref-tables.enum.ts lib/reference/ref-tables.test.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest lib/reference/ref-tables.test.ts` — covers: no dupes, 7 E-0 entries
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm lib/reference/ref-tables.enum.ts lib/reference/ref-tables.test.ts`
## §1 — Sub-module 00-a — Monorepo + Next.js scaffold

---

## T-00a-001 — Initialise pnpm workspace + Turborepo config

**Type:** T1-schema
**Context budget:** ~30k tokens
**Est time:** 45 min
**Parent feature:** 00-a scaffold
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["any", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** []
- **Downstream (will consume this):** [T-00a-002 — Bootstrap apps/web, T-00a-003 — Tailwind + shadcn, T-00a-004 — ESLint + Prettier, T-00a-005 — README]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** an empty git repository at `/Users/mariuszkrawczyk/Projects/monopilot-kira`
**WHEN** `pnpm install` runs from root
**THEN** `pnpm-workspace.yaml` resolves `apps/*` + `packages/*`, `turbo.json` defines `build | lint | test | dev` pipelines, and `pnpm turbo run build --filter=^` exits 0 (no-op green)

### ACP Prompt
````
# Task T-00a-001 — Initialise pnpm workspace + Turborepo config

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — monorepo stack decisions (pnpm workspace, Turborepo, TypeScript strict)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — stack constraints

## Twoje zadanie
Inicjalizuj monorepo strukturę w `/Users/mariuszkrawczyk/Projects/monopilot-kira`. Cel: `pnpm install` + `pnpm turbo run build --filter=^` (no-op green). Stack: pnpm workspaces + Turborepo. Workspace ma `apps/*` i `packages/*` dirs.

## Implementacja
1. `pnpm init -w` w root + utwórz `./pnpm-workspace.yaml` z packages: `["apps/*", "packages/*"]`
2. Dodaj `turbo` do root `./package.json` — uruchom `pnpm add turbo --save-dev -w` w repo root — i utwórz `./turbo.json` z pipeline: `{"pipeline": {"build": {"outputs": [".next/**", "dist/**"]}, "lint": {}, "test": {}, "dev": {"cache": false, "persistent": true}}}`
3. Uzupełnij root `./package.json` z `engines: {"node": ">=20", "pnpm": ">=9"}` + `./.nvmrc` z `20`
4. Utwórz `./.gitignore` z: `node_modules`, `.next`, `.turbo`, `dist`, `.env.local`, `.env`
5. Zweryfikuj na podstawie `./package.json` i `./turbo.json`, że `pnpm turbo run build --filter=^` exits 0

## Files
**Create:** `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.nvmrc`
**Modify:** `package.json` — dodaj: engines, scripts (build/lint/test/dev via turbo)

## Done when
- `pnpm turbo run build --filter=^` exits 0
- `pnpm test:smoke` green

## Rollback
`git revert HEAD` — reverts workspace init commit.
````

### Test gate (planning summary)
- **CI gate:** `pnpm turbo run build --filter=^` exits 0

### Rollback
`git revert HEAD`
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
- **Upstream (must be done first):** [T-00a-001 — Initialise pnpm workspace + Turborepo config]
- **Downstream (will consume this):** [T-00a-003 — Tailwind + shadcn, T-00a-004 — ESLint + Prettier, T-00a-007 — Env var loader, T-00c-001 — Auth schema]
- **Parallel (can run concurrently):** [T-00a-007 — Env var loader]

### GIVEN / WHEN / THEN
**GIVEN** pnpm workspace is initialised
**WHEN** `pnpm --filter web dev` runs
**THEN** Next.js 14 App Router boots at `localhost:3000`, serves a placeholder RSC `/` page returning `<main>Monopilot</main>`, TypeScript `strict: true` and `noUncheckedIndexedAccess: true` enforced in `tsconfig.json`

### ACP Prompt
````
# Task T-00a-002 — Bootstrap `apps/web` (Next.js 14 App Router, TS strict)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — Next.js App Router + RSC + TypeScript strict requirements
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T3-ui constraints (shadcn, RHF, Zod)

## Twoje zadanie
Utwórz aplikację Next.js 14 w `apps/web`. Wymogi: App Router (nie Pages Router), TypeScript strict mode z `noUncheckedIndexedAccess: true`, placeholder RSC `/` page. Multi-tenant routing structure: `app/[tenant]/...` dla przyszłych tenant-scoped pages (ale `/` może być prosta placeholder).

## Implementacja
1. `pnpm create next-app@14 apps/web --ts --app --no-eslint --no-tailwind` (bare scaffold)
2. Edytuj `apps/web/tsconfig.json`: ustaw `"strict": true, "noUncheckedIndexedAccess": true, "noImplicitAny": true`
3. Zastąp `apps/web/app/page.tsx` prostym RSC: `export default function HomePage() { return <main>Monopilot</main> }`
4. Dodaj `./turbo.json` dev pipeline: upewnij się że `pnpm --filter web dev` uruchamia przez Turborepo i że `apps/web/app/layout.tsx` pozostaje poprawnym App Router entrypointem
5. Zweryfikuj przez `apps/web/app/page.tsx` i `apps/web/tsconfig.json`, że `pnpm --filter web build` jest green

## Files
**Create:** `apps/web/` (full Next.js scaffold)
**Modify:** `turbo.json` — dodaj: web app do dev/build pipeline; `apps/web/tsconfig.json` — strict + noUncheckedIndexedAccess

## Prototype reference
Brak prototypu — komponent jest nowy. Implementuj bezpośrednio w shadcn/Radix patterns.
Translation checklist:
- [ ] Użyj shadcn primitives (nie custom CSS)
- [ ] Każdy form state przez useForm + zodResolver (nie useState)
- [ ] Loading: `<Skeleton className="h-4 w-full" />` z shadcn
- [ ] Error: `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`

## Done when
- `pnpm --filter web build` PASS (no TS errors)
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web` — remove entire app directory.
````

### Test gate (planning summary)
- **CI gate:** `pnpm --filter web build` green (no TypeScript errors)

### Rollback
`rm -rf apps/web`
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
- **Upstream (must be done first):** [T-00a-002 — Bootstrap apps/web]
- **Downstream (will consume this):** [every future T3 UI task, T-00c-004 — Auth UI]
- **Parallel (can run concurrently):** [T-00a-004 — ESLint + Prettier]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app boots at localhost:3000
**WHEN** shadcn `Button` component is imported in `apps/web/app/page.tsx` and rendered
**THEN** Tailwind classes resolve correctly, Radix primitives render, dark mode class strategy (`class`) works, `pnpm --filter web build` is green

### ACP Prompt
````
# Task T-00a-003 — Tailwind + shadcn/ui init in `apps/web`

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — Tailwind + design system requirements
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T3-ui shadcn imports (Dialog, Form, Input, Button etc.)

## Twoje zadanie
Skonfiguruj Tailwind CSS + shadcn/ui w `apps/web`. Stack: Tailwind v3 + shadcn/ui latest + Radix primitives. Potrzebne komponenty dla E-0: Button, Card, Dialog, Input, Label, Form (używane przez pierwsze auth UI). Dark mode strategy: `class` (nie `media`).

## Implementacja
1. Dodaj `tailwindcss`, `postcss` i `autoprefixer` do `apps/web/package.json` — uruchom `pnpm --filter web add tailwindcss postcss autoprefixer` w `apps/web` — potem `npx tailwindcss init -p` w `apps/web/` i skonfiguruj `apps/web/tailwind.config.ts` z content globs: `["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"]`
2. Dodaj Tailwind directives do `apps/web/app/globals.css`: `@tailwind base; @tailwind components; @tailwind utilities;`
3. Inicjalizuj shadcn: `npx shadcn@latest init` w `apps/web/` z opcjami: default style, default base color, CSS variables: yes, dark mode: class; wygenerowana konfiguracja ma trafić do `apps/web/components.json` oraz używać `apps/web/tailwind.config.ts` lub `apps/web/postcss.config.js`
4. Dodaj komponenty do `apps/web/components/ui/button.tsx`, `apps/web/components/ui/card.tsx`, `apps/web/components/ui/dialog.tsx`, `apps/web/components/ui/input.tsx`, `apps/web/components/ui/label.tsx` i `apps/web/components/ui/form.tsx` przez `npx shadcn@latest add button card dialog input label form`
5. Zweryfikuj w `apps/web/app/page.tsx`: dodaj `import { Button } from "@/components/ui/button"` + `<Button>Test</Button>` — build must pass

## Files
**Create:** `apps/web/tailwind.config.ts`, `apps/web/components.json`, `apps/web/components/ui/button.tsx`, `apps/web/components/ui/card.tsx`, `apps/web/components/ui/dialog.tsx`, `apps/web/components/ui/input.tsx`, `apps/web/components/ui/label.tsx`, `apps/web/components/ui/form.tsx`
**Modify:** `apps/web/app/globals.css` — dodaj: Tailwind directives; `apps/web/app/page.tsx` — dodaj: Button import + render

## Prototype reference
Brak prototypu — komponent jest nowy. Implementuj bezpośrednio w shadcn/Radix patterns.
Translation checklist:
- [ ] Użyj shadcn primitives (nie custom CSS)
- [ ] Każdy form state przez useForm + zodResolver (nie useState)
- [ ] Loading: `<Skeleton className="h-4 w-full" />` z shadcn
- [ ] Error: `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`

## Done when
- `pnpm --filter web build` PASS (Tailwind resolves, no TS errors)
- `pnpm test:smoke` green

## Rollback
`git revert HEAD` — removes Tailwind + shadcn config.
````

### Test gate (planning summary)
- **CI gate:** `pnpm --filter web build` green + Tailwind classes resolve

### Rollback
`git revert HEAD`
## T-00a-004 — ESLint + Prettier + TypeScript project references

**Type:** T4-wiring+test
**Context budget:** ~30k tokens
**Est time:** 40 min
**Parent feature:** 00-a scaffold
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["any", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-002 — Bootstrap apps/web]
- **Downstream (will consume this):** [T-00i-002 — CI quality gates]
- **Parallel (can run concurrently):** [T-00a-003 — Tailwind + shadcn]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app scaffold exists at `apps/web`
**WHEN** `pnpm lint` and `pnpm typecheck` run from monorepo root
**THEN** both pass across all workspaces — ESLint flat config enforces rules for TypeScript + Tailwind class ordering, Prettier formats consistently, shared `tsconfig.base.json` is extended by all packages

### ACP Prompt
````
# Task T-00a-004 — ESLint + Prettier + TypeScript project references

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §11 — Cross-cutting Requirements` — build posture, PR files cap, linting requirements
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — stack constraints

## Twoje zadanie
Skonfiguruj unified ESLint + Prettier dla monorepo. ESLint flat config (nie `.eslintrc`). Prettier z Tailwind plugin dla class ordering. Shared `tsconfig.base.json` na root, extended przez `apps/web/tsconfig.json`.

## Implementacja
1. Utwórz root `eslint.config.mjs` (ESLint v9 flat config): importy `@eslint/js`, `typescript-eslint`, `eslint-config-next`, `eslint-plugin-tailwindcss`; rules: `no-console: warn`, `no-unused-vars: error`, Tailwind class ordering
2. Utwórz `./prettier.config.mjs`: `{"semi": false, "singleQuote": true, "trailingComma": "es5", "plugins": ["prettier-plugin-tailwindcss"]}`; jeśli potrzebny legacy mirror, użyj `apps/web/.eslintrc.json` lub `./.eslintrc.json`
3. Utwórz `tsconfig.base.json` na root: `{"compilerOptions": {"strict": true, "noUncheckedIndexedAccess": true, "moduleResolution": "bundler", "target": "ES2022", "lib": ["ES2022", "DOM"]}}` — `apps/web/tsconfig.json` ma `"extends": "../../tsconfig.base.json"`
4. Dodaj do `./turbo.json` pipeline: `"lint": {"outputs": []}`, `"typecheck": {"outputs": []}` + npm scripts na root `./package.json`; jeśli potrzebny format config, zapisz go w `./.prettierrc.json` lub `apps/web/.prettierrc.json`
5. Uruchom `pnpm lint && pnpm typecheck`, napraw initial errors w `eslint.config.mjs`, `prettier.config.mjs`, `tsconfig.base.json`, `apps/web/tsconfig.json`, `turbo.json` i `package.json`, a następnie zacommituj zmiany

## Files
**Create:** `eslint.config.mjs`, `prettier.config.mjs`, `tsconfig.base.json`
**Modify:** `turbo.json` — dodaj: lint + typecheck pipelines; `apps/web/tsconfig.json` — dodaj: extends tsconfig.base.json; `package.json` — dodaj: lint + typecheck scripts

## Done when
- `pnpm lint` exits 0 (all workspaces)
- `pnpm typecheck` exits 0 (all workspaces)
- `pnpm test:smoke` green

## Rollback
`git revert HEAD` — removes ESLint/Prettier/tsconfig.base config.
````

### Test gate (planning summary)
- **CI gate:** `pnpm lint && pnpm typecheck` exits 0 across all workspaces

### Rollback
`git revert HEAD`
## T-00a-005 — Root README + CONTRIBUTING skeleton

**Type:** T1-schema
**Context budget:** ~15k tokens
**Est time:** 20 min
**Parent feature:** 00-a scaffold
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["any", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-001 — Initialise pnpm workspace + Turborepo config]
- **Downstream (will consume this):** [T-00b-E01, T-00b-E02, T-00b-E03, T-00b-000 — enum locks unblock after this]
- **Parallel (can run concurrently):** [T-00a-002, T-00a-003, T-00a-004]

### GIVEN / WHEN / THEN
**GIVEN** pnpm workspace + Turborepo are initialised
**WHEN** a fresh developer clones the repo and reads `README.md`
**THEN** they can reach `pnpm dev` green at `localhost:3000` in under 10 minutes; `README.md` covers stack overview, monorepo layout, how to run locally, test discipline; `CONTRIBUTING.md` covers PR rules including 40k token cap and link to Phase E-0 plan

### ACP Prompt
````
# Task T-00a-005 — Root README + CONTRIBUTING skeleton

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — stack summary (Next.js, pnpm, Turborepo, Drizzle, Supabase, Vitest, Playwright)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §7` — context budget audit (40k token cap per PR)

## Twoje zadanie
Utwórz `README.md` i `CONTRIBUTING.md` na root projektu. README musi umożliwić fresh developer dotarcie do `pnpm dev` green w ≤10 minut. CONTRIBUTING musi mieć 40k token cap per PR jako hard rule.

## Implementacja
1. Utwórz `./README.md` z sekcjami: Stack (Next.js 14 App Router, pnpm workspaces, Turborepo, Drizzle ORM, Supabase local, Vitest, Playwright), Monorepo layout (`apps/web`, `packages/db`, `packages/pwa`), Quick start (`pnpm install && supabase start && pnpm dev`), Test commands (`pnpm test:unit`, `pnpm test:smoke`, `pnpm migrate`)
2. Utwórz `./CONTRIBUTING.md` z sekcjami: PR rules (1 atomic task per PR, max 40000 tokens in diff — link do `00-FOUNDATION-PRD.md §11.3`), Branch naming (`feat/T-00a-001-description`), Commit style (conventional commits), Pre-commit hooks (lint + typecheck + token cap)
3. Dodaj sekcję w `./README.md` odsyłającą do `docs/BUILD-POSTURE.md` i utwórz `docs/BUILD-POSTURE.md` (stub — będzie wypełniony w T-00i tasks)
4. Nie ma test gate — docs task; zweryfikuj przez `./README.md` i `./CONTRIBUTING.md`, że fresh `pnpm dev` green jest opisane w ≤10 min
5. Zacommituj `./README.md`, `./CONTRIBUTING.md` i `docs/BUILD-POSTURE.md`

## Files
**Create:** `./README.md`, `./CONTRIBUTING.md`, `docs/BUILD-POSTURE.md`

## Done when
- `README.md` istnieje z Quick start section
- `CONTRIBUTING.md` istnieje z 40k token cap rule
- `pnpm test:smoke` green (docs nie blokują smoke)

## Rollback
`git rm README.md CONTRIBUTING.md docs/BUILD-POSTURE.md`
````

### Test gate (planning summary)
- **CI gate:** `pnpm test:smoke` green (docs don't block smoke)

### Rollback
`git rm README.md CONTRIBUTING.md docs/BUILD-POSTURE.md`
## T-00a-006 — Husky pre-commit hook (lint + typecheck on staged)

**Type:** T4-wiring+test
**Context budget:** ~25k tokens
**Est time:** 25 min
**Parent feature:** 00-a scaffold
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["any", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-004 — ESLint + Prettier + TypeScript project references]
- **Downstream (will consume this):** [T-00a-006b — Pre-commit token-cap gate]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** ESLint + Prettier are configured and `pnpm lint` passes
**WHEN** a developer runs `git commit`
**THEN** Husky pre-commit runs `lint-staged` (ESLint + Prettier on staged `.ts`/`.tsx` files) and blocks the commit with exit code 1 on any lint or format failure

### ACP Prompt
````
# Task T-00a-006 — Husky pre-commit hook (lint + typecheck on staged)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §11 — Cross-cutting Requirements` — build posture, pre-commit requirements
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — stack constraints

## Twoje zadanie
Skonfiguruj Husky + lint-staged jako pre-commit hook. Na staged `.ts`/`.tsx` files: ESLint fix + Prettier format. Hook blokuje commit na failure (exit 1). NIE uruchamiaj pełnego typecheck na pre-commit (za wolne) — tylko lint-staged. Typecheck jest w CI.

## Implementacja
1. Dodaj `husky` i `lint-staged` do root `package.json` — uruchom `pnpm add husky lint-staged --save-dev -w` w repo root — a następnie `pnpm exec husky init`, aby przygotować `.husky/pre-commit`
2. Edytuj `./.husky/pre-commit` żeby zawierał: `pnpm exec lint-staged`
3. Dodaj `lint-staged` config do `./package.json` (root):
   ```json
   "lint-staged": {
     "**/*.{ts,tsx}": ["eslint --fix", "prettier --write"],
     "**/*.{json,md,css}": ["prettier --write"]
   }
   ```
4. Smoke test: celowo wprowadź lint error w `apps/web/app/page.tsx` jako staged file → `git commit` → obserwuj blokadę exit 1
5. Napraw lint error w `apps/web/app/page.tsx` i zacommituj poprawny kod z `.husky/pre-commit`

## Files
**Create:** `.husky/pre-commit`
**Modify:** `package.json` — dodaj: lint-staged config

## Done when
- `git commit` z intentional lint error jest blokowany (exit 1)
- `git commit` z clean code przechodzi
- `pnpm test:smoke` green

## Rollback
`git rm .husky/pre-commit` + usuń lint-staged z package.json.
````

### Test gate (planning summary)
- **Manual smoke:** intentional lint error → commit blocked
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm .husky/pre-commit` + remove lint-staged from package.json
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
- **Upstream (must be done first):** [T-00a-002 — Bootstrap apps/web]
- **Downstream (will consume this):** [T-00b-001 — Supabase local bootstrap, T-00c-001 — Auth schema]
- **Parallel (can run concurrently):** [T-00a-003 — Tailwind + shadcn]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app scaffold exists
**WHEN** any server component imports `env` from `apps/web/lib/env.ts` and `SUPABASE_URL` is missing from environment
**THEN** the missing var is caught at build time via Zod with a clear error message; when all vars present, `env.SUPABASE_URL` is a typed string; `.env.example` lists all 6 required keys

### ACP Prompt
````
# Task T-00a-007 — Env var loader (`@t3-oss/env-nextjs`) + `.env.example`

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — Postgres/Supabase + PostHog + Sentry config keys
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T2-api constraints

## Twoje zadanie
Utwórz type-safe env var loader używając `@t3-oss/env-nextjs`. Plik `apps/web/lib/env.ts` eksportuje obiekt `env` z 6 kluczami: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN`. Brakujące vars = build error (Zod). Utwórz `.env.example` z placeholder values.

## Implementacja
1. Dodaj `@t3-oss/env-nextjs` i `zod` do `apps/web/package.json` — uruchom `pnpm --filter web add @t3-oss/env-nextjs zod` w `apps/web`
2. Utwórz `apps/web/lib/env.ts`:
   ```typescript
   import { createEnv } from "@t3-oss/env-nextjs"
   import { z } from "zod"
   export const env = createEnv({
     server: {
       DATABASE_URL: z.string().url(),
       SUPABASE_URL: z.string().url(),
       SUPABASE_ANON_KEY: z.string().min(1),
       SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
       SENTRY_DSN: z.string().url().optional(),
     },
     client: {
       NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
     },
     runtimeEnv: { ... } // map all 6 from process.env
   })
   ```
3. Utwórz `apps/web/.env.example` lub `./.env.example` z 6 placeholder values (no real secrets)
4. Utwórz `apps/web/lib/env.test.ts` — unit test: import env with missing `DATABASE_URL` throws Zod error
5. Zacommituj `apps/web/lib/env.ts`, `apps/web/lib/env.test.ts` i `./.env.example` lub `apps/web/.env.example`

## Files
**Create:** `apps/web/lib/env.ts`, `apps/web/lib/env.test.ts`, `.env.example`

## Done when
- `vitest apps/web/lib/env.test.ts` PASS — sprawdza: missing DATABASE_URL throws at import
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/env.ts .env.example`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/env.test.ts` — covers: missing var throws Zod error
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/env.ts .env.example`
## T-00a-008 — PWA scaffold (manifest + service worker)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~40k tokens
**Est time:** 60 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #3)
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-002 — Bootstrap apps/web, T-00a-003 — Tailwind + shadcn]
- **Downstream (will consume this):** [T-00a-009 — IndexedDB sync queue]
- **Parallel (can run concurrently):** [T-00a-006 — Husky pre-commit]

### GIVEN / WHEN / THEN
**GIVEN** Next.js app boots and builds successfully
**WHEN** a browser visits `/` over HTTPS (or localhost with HTTPS flag)
**THEN** `manifest.webmanifest` is served at `/manifest.webmanifest`, service worker registers via `navigator.serviceWorker.register`, Playwright asserts `navigator.serviceWorker.ready` resolves, `pnpm --filter web build` is green

### ACP Prompt
````
# Task T-00a-008 — PWA scaffold (manifest + service worker)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — PWA/Workbox requirements (R5 MES-TRENDS-2026 §7): Service Worker + IndexedDB sync queue + DataWedge keyboard-wedge
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T3-ui constraints

## Twoje zadanie
Zbuduj minimalny PWA scaffold dla `apps/web`. Cel E-0: manifest + service worker registration. Caching strategy i IndexedDB queue będą w T-00a-009. Stack: `next-pwa` lub `@ducanh2912/next-pwa` dla Next.js 14 App Router.

## Implementacja
1. Dodaj `@ducanh2912/next-pwa` do `apps/web/package.json` — uruchom `pnpm --filter web add @ducanh2912/next-pwa` w `apps/web` (lub dodaj `next-pwa` do `apps/web/package.json`, jeśli to ono działa z Next.js 14 App Router)
2. Utwórz `apps/web/public/manifest.webmanifest`:
   ```json
   {"name": "Monopilot", "short_name": "Monopilot", "display": "standalone", "background_color": "#ffffff", "theme_color": "#000000", "start_url": "/", "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png"}]}
   ```
3. Utwórz placeholder icons: `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png` (1x1 px PNG stubs)
4. Link manifest w `apps/web/app/layout.tsx`: `<link rel="manifest" href="/manifest.webmanifest" />`
5. Skonfiguruj SW stub w `apps/web/sw.js` i `apps/web/next.config.js` (no caching yet) — service worker tylko rejestruje się, nie cachuje jeszcze nic

## Files
**Create:** `apps/web/public/manifest.webmanifest`, `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png`, `apps/web/sw.js` (lub Next.js generated equivalent)
**Modify:** `apps/web/app/layout.tsx` — dodaj: manifest link tag; `apps/web/next.config.js` — dodaj: next-pwa config

## Prototype reference
Brak prototypu — komponent jest nowy. Implementuj bezpośrednio w shadcn/Radix patterns.
Translation checklist:
- [ ] Użyj shadcn primitives (nie custom CSS)
- [ ] Każdy form state przez useForm + zodResolver (nie useState)
- [ ] Loading: `<Skeleton className="h-4 w-full" />` z shadcn
- [ ] Error: `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`

## Done when
- `playwright e2e/pwa-sw.spec.ts` PASS — sprawdza: `navigator.serviceWorker.ready` resolves
- `pnpm --filter web build` green

- `pnpm test:smoke` green
## Rollback
`git revert HEAD` — removes manifest + SW registration.
````
### Test gate (planning summary)
- **E2E:** `playwright e2e/pwa-sw.spec.ts` — covers: service worker registers
- **CI gate:** `pnpm --filter web build` green

### Rollback
`git revert HEAD`
## T-00a-009 — IndexedDB sync queue + offline queue flusher

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #3)
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-008 — PWA scaffold, T-00f-002 — Outbox insertOutboxEvent helper]
- **Downstream (will consume this):** [T-00i-001 — E-0 dogfood acceptance harness]
- **Parallel (can run concurrently):** [T-00f-003 — pg-boss worker]

### GIVEN / WHEN / THEN
**GIVEN** service worker is registered and outbox helper exists
**WHEN** the client goes offline, performs N mutations, then reconnects
**THEN** IndexedDB FIFO queue stores mutations with their original UUID v7 `transaction_id`; on `online` event queue flushes in order; server-side idempotency guarantees no duplicate effects for replayed `transaction_id`

### ACP Prompt
````
# Task T-00a-009 — IndexedDB sync queue + offline queue flusher

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §10 — Event-first + AI/Trace-ready Schema` — R14 Idempotent mutations: client-generated UUID v7 `transaction_id`, server deterministic replay
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T2-api constraints

## Twoje zadanie
Zbuduj IndexedDB FIFO sync queue w `packages/pwa/`. Gdy fetch Server Action failuje (offline), mutation jest queue'owana z UUID v7 `transaction_id`. Na event `online` queue flushuje w kolejności FIFO. Server Action musi być idempotentny na replay tego samego `transaction_id`.

Queue schema w IndexedDB:
````
store: "mutation_queue"
key: transaction_id (UUID v7)
value: { transaction_id: string, url: string, method: string, body: string, queued_at: number, retry_count: number }
```

## Implementacja
1. Utwórz `packages/pwa/` workspace + `package.json`; dodaj `idb` do `packages/pwa/package.json` dla typed IndexedDB
2. Utwórz `packages/pwa/indexeddb-queue.ts` z functions: `enqueue(mutation)`, `dequeue()`, `peekAll()`, `clearById(transaction_id)` — używając `idb` openDB + store `mutation_queue`
3. Utwórz `apps/web/lib/pwa/fetch-with-queue.ts` — wrapper dla Server Action fetch: on NetworkError → `enqueue(mutation)`, on reconnect (`window.addEventListener('online', ...)`) → flush FIFO z `dequeue()` loop
4. Napisz unit test w `packages/pwa/indexeddb-queue.test.ts`: queue FIFO order preserved, dedup by `transaction_id` (no double-enqueue same id)
5. E2E Playwright test w `apps/web/e2e/pwa-offline.spec.ts` lub `apps/web/e2e/offline-sync.spec.ts`: simulate offline (`page.context().setOffline(true)`) → mutation → go online → assert mutation replayed once

## Files
**Create:** `packages/pwa/package.json`, `packages/pwa/indexeddb-queue.ts`, `packages/pwa/indexeddb-queue.test.ts`, `apps/web/lib/pwa/fetch-with-queue.ts`

## Done when
- `vitest packages/pwa/indexeddb-queue.test.ts` PASS — sprawdza: FIFO order, dedup by transaction_id
- `playwright e2e/pwa-offline.spec.ts` PASS — sprawdza: offline → online replay exactly once
- `pnpm test:smoke` green

## Rollback
`rm -rf packages/pwa apps/web/lib/pwa` — fetches fail loud when offline.
```

### Test gate (planning summary)
- **Unit:** `vitest packages/pwa/indexeddb-queue.test.ts` — covers: FIFO + dedup
- **E2E:** `playwright e2e/pwa-offline.spec.ts` — covers: offline→online replay
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf packages/pwa apps/web/lib/pwa`
## T-00a-006b — Pre-commit token-cap gate (40000 tokens)

**Type:** T2-api
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** 00-a scaffold (gap-fill per Decision #5)
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["any", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-006 — Husky pre-commit hook]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** Husky pre-commit is installed and running lint-staged
**WHEN** a developer attempts to commit a diff exceeding 40000 tokens
**THEN** the hook rejects the commit (exit 1) with message: "Commit diff exceeds 40000 token cap. Split the PR. See 00-FOUNDATION-PRD.md §11.3" — and exits 0 for diffs under 40000 tokens

### ACP Prompt
````
# Task T-00a-006b — Pre-commit token-cap gate (40000 tokens)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §11 — Cross-cutting Requirements` — "PR files cap ~18k tokenów; split jeśli większy" (nota: user decision overrides to 40000 tokens, nie 18000)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §7 — Context budget audit` — hard ceiling 100k, PR cap rule

## Twoje zadanie
Rozszerz `.husky/pre-commit` o token count check. Cap = **40000 tokens** (NOT 18000 — user decision overrides PRD text). Używaj `@dqbd/tiktoken` dla tokenizacji. Staged diff (`git diff --cached`) zliczaj jako tokeny, jeśli >40000 → exit 1 z pointerem do `00-FOUNDATION-PRD.md §11.3`.

## Implementacja
1. Dodaj `@dqbd/tiktoken` do root `package.json` — uruchom `pnpm add @dqbd/tiktoken --save-dev -w` w repo root
2. Utwórz `scripts/token-cap.ts` i dodaj potrzebny wpis zależności do `./package.json`:
   ```typescript
   import { execSync } from 'child_process'
   import { get_encoding } from '@dqbd/tiktoken'
   const diff = execSync('git diff --cached').toString()
   const enc = get_encoding('cl100k_base')
   const tokens = enc.encode(diff).length
   const CAP = 40000
   if (tokens > CAP) {
     console.error(`Token cap exceeded: ${tokens} > ${CAP}. Split the PR. See 00-FOUNDATION-PRD.md §11.3`)
     process.exit(1)
   }
   enc.free()
   ```
3. Dodaj do `./.husky/pre-commit` wywołanie: `pnpm exec ts-node scripts/token-cap.ts` (lub `node --loader ts-node/esm scripts/token-cap.ts`)
4. Dodaj comment w `./.husky/pre-commit` powyżej linii: `# Token cap: 40000 tokens. See 00-FOUNDATION-PRD.md §11.3`
5. Unit test w `scripts/token-cap.test.ts`: small diff (100 tokens) passes, inflated diff (41000 tokens) fails; test ma pokrywać integrację z `./.husky/pre-commit`

## Files
**Create:** `scripts/token-cap.ts`, `scripts/token-cap.test.ts`
**Modify:** `.husky/pre-commit` — dodaj: token-cap call + comment

## Done when
- `vitest scripts/token-cap.test.ts` PASS — sprawdza: cap enforced at 40000 boundary
- `pnpm test:smoke` green

## Rollback
Usuń linię z `.husky/pre-commit` wywołującą token-cap.
````

### Test gate (planning summary)
- **Unit:** `vitest scripts/token-cap.test.ts` — covers: cap enforced at 40000
- **CI gate:** `pnpm test:smoke` green

### Rollback
`Remove token-cap line from `.husky/pre-commit``
## §2 — Sub-module 00-b — Supabase + Drizzle scaffolding

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
- **Upstream (must be done first):** [T-00a-007 — Env var loader]
- **Downstream (will consume this):** [T-00b-000 — Baseline migration, T-00b-002 — Drizzle config]
- **Parallel (can run concurrently):** [T-00b-E01, T-00b-E02, T-00b-E03]

### GIVEN / WHEN / THEN
**GIVEN** Docker is installed on the developer machine
**WHEN** `pnpm db:start` runs from repo root
**THEN** Supabase local cluster (Postgres + GoTrue + Storage) is up at known ports (`localhost:54321` API, `localhost:54322` Studio, `localhost:54323` Inbucket), `.env.local` is populated with anon key + service role key + DATABASE_URL

### ACP Prompt
````
# Task T-00b-001 — Supabase local (Docker) bootstrap + project link

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — Postgres/Supabase stack, RLS default requirement (R3)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T1-schema constraints

## Twoje zadanie
Zainicjalizuj Supabase CLI lokalnie. `supabase start` uruchamia pełny stack. Keys ladują do `.env.local`. Dodaj npm scripts dla wygody: `db:start`, `db:stop`, `db:reset`.

## Implementacja
1. Dodaj `supabase` do root `./package.json` — uruchom `pnpm add supabase --save-dev -w` w repo root; następnie `pnpm exec supabase init` w root — generuje `supabase/config.toml`
2. Edytuj `supabase/config.toml`: ustaw `project_id = "monopilot-kira"`, default ports
3. Uruchom `pnpm exec supabase start`, a potem pobierz klucze przez `pnpm exec supabase status` i zapisz wynik do `./.env.local` przez `scripts/setup-env.sh`
4. Utwórz skrypt `scripts/setup-env.sh` który zapisuje output `supabase status` do `./.env.local` (DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
5. Dodaj npm scripts do root `./package.json`: `"db:start": "supabase start"`, `"db:stop": "supabase stop"`, `"db:reset": "supabase db reset"`

## Files
**Create:** `supabase/config.toml`, `scripts/setup-env.sh`
**Modify:** `./package.json` — dodaj: db:start, db:stop, db:reset scripts; `./.gitignore` — dodaj: `.env.local`

## Done when
- `pnpm db:start` exits 0 z Supabase running
- `psql $DATABASE_URL -c "SELECT 1"` returns `1`
- `pnpm test:smoke` green

## Rollback
`pnpm db:stop && rm -rf supabase/` — removes supabase config.
````

### Test gate (planning summary)
- **CI gate:** `supabase start && psql $DATABASE_URL -c "SELECT 1"` exits 0

### Rollback
`pnpm db:stop && rm -rf supabase/`
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
- **Upstream (must be done first):** [T-00b-001 — Supabase local bootstrap]
- **Downstream (will consume this):** [T-00b-000 — Baseline migration, T-00b-003 — Migration runner, T-00b-006 — RLS context setter]
- **Parallel (can run concurrently):** [T-00b-E01, T-00b-E02, T-00b-E03]

### GIVEN / WHEN / THEN
**GIVEN** Supabase local is running with known DATABASE_URL
**WHEN** `import { db } from '@monopilot/db'` runs server-side in `apps/web`
**THEN** Drizzle client connects via `DATABASE_URL`, honours transactions, `db.execute(sql\`select 1\`)` returns `[{?column?: 1}]`, schema namespace is exported as typed `schema`

### ACP Prompt
````
# Task T-00b-002 — Drizzle config + client singleton

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — Drizzle ORM + Postgres 16 + RLS requirements (R3)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T1-schema constraints: Drizzle ORM + drizzle-kit generate pattern

## Twoje zadanie
Utwórz `packages/db/` workspace z Drizzle ORM client singleton. Package name: `@monopilot/db`. Export: `db` (Drizzle client), `client` (postgres connection), `schema` namespace. Config: `drizzle.config.ts` na root.

## Implementacja
1. Utwórz `packages/db/package.json` z `name: "@monopilot/db"`, dependencies: `drizzle-orm`, `postgres`; devDependencies: `drizzle-kit`
2. Utwórz `packages/db/index.ts`:
   ```typescript
   import { drizzle } from 'drizzle-orm/postgres-js'
   import postgres from 'postgres'
   import * as schema from './schema'
   const client = postgres(process.env.DATABASE_URL!)
   export const db = drizzle(client, { schema })
   export { client, schema }
   ```
3. Utwórz `packages/db/schema/index.ts` (stub — re-exports z baseline.ts gdy będzie gotowe)
4. Utwórz `./drizzle.config.ts` na root:
   ```typescript
   export default { schema: './packages/db/schema/*', out: './drizzle/migrations', dialect: 'postgresql', dbCredentials: { url: process.env.DATABASE_URL! } }
   ```
5. Utwórz `packages/db/smoke.test.ts` — integration test: `db.execute(sql\`select 1\`)` returns `[{?column?: 1}]`

## Files
**Create:** `packages/db/package.json`, `packages/db/index.ts`, `packages/db/schema/index.ts`, `packages/db/smoke.test.ts`, `drizzle.config.ts`

## Done when
- `vitest packages/db/smoke.test.ts` PASS — sprawdza: `select 1` returns `[{"?column?": 1}]`
- `pnpm test:smoke` green

## Rollback
`rm -rf packages/db drizzle.config.ts`
````

### Test gate (planning summary)
- **Integration:** `vitest packages/db/smoke.test.ts` — covers: Drizzle connects, `select 1` passes
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf packages/db drizzle.config.ts`
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
- **Upstream (must be done first):** [T-00b-000 — Baseline migration, T-00b-002 — Drizzle config]
- **Downstream (will consume this):** [T-00d-001, T-00e-001, T-00f-001, T-00i-003]
- **Parallel (can run concurrently):** [T-00b-004 — Seed runner]

### GIVEN / WHEN / THEN
**GIVEN** Drizzle config and baseline migration exist
**WHEN** `pnpm migrate` runs headlessly
**THEN** drizzle-kit applies pending migrations idempotently, `drizzle_migrations` table tracks applied set, `pnpm migrate:down` reverts last migration, CI runs `pnpm migrate` headless on ephemeral Postgres

### ACP Prompt
````
# Task T-00b-003 — Migration runner scripts (up/down) + `pnpm migrate`

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §11 — Cross-cutting Requirements` — build posture: "Nigdy DDL w-locie w request path (schema changes = jobs z approval)", migration runner requirement
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T1-schema migration runner: `pnpm drizzle-kit migrate` (NOT alembic)

## Twoje zadanie
Utwórz migration runner scripts. Stack: drizzle-kit (NOT alembic — to jest Next.js/Node.js stack). Trzy komendy: `pnpm migrate` (apply pending), `pnpm migrate:down` (revert last), `pnpm migrate:status` (show pending). Idempotent: `pnpm migrate` run twice = no error.

## Implementacja
1. Utwórz `packages/db/scripts/migrate.ts`:
   ```typescript
   import { migrate } from 'drizzle-orm/postgres-js/migrator'
   import { db, client } from '../index'
   await migrate(db, { migrationsFolder: './drizzle/migrations' })
   await client.end()
   ```
2. Utwórz `packages/db/scripts/migrate-down.ts` używając `drizzle-kit drop` z guard (wymaga confirm=true flag żeby nie przypadkiem dropować)
3. Dodaj npm scripts do root `package.json`: `"migrate": "tsx packages/db/scripts/migrate.ts"`, `"migrate:down": "tsx packages/db/scripts/migrate-down.ts"`, `"migrate:status": "pnpm exec drizzle-kit status"`
4. Integration test `packages/db/scripts/migrate.test.ts`: apply → down → apply cycle bez error
5. Dodaj do CI przez `./package.json` (np. `pretest` script) lub `./turbo.json`: `pnpm migrate` przed `pnpm test:smoke`

## Files
**Create:** `packages/db/scripts/migrate.ts`, `packages/db/scripts/migrate-down.ts`, `packages/db/scripts/migrate.test.ts`
**Modify:** `package.json` — dodaj: migrate, migrate:down, migrate:status scripts

## Done when
- `vitest packages/db/scripts/migrate.test.ts` PASS — sprawdza: migrate up→down→up cycle idempotent
- `pnpm migrate && pnpm migrate:status` exits 0
- `pnpm test:smoke` green

## Rollback
`git revert HEAD` + `DROP TABLE drizzle_migrations` on test DB.
````

### Test gate (planning summary)
- **Integration:** `vitest packages/db/scripts/migrate.test.ts` — covers: up→down→up cycle
- **CI gate:** `pnpm migrate && pnpm migrate:status` exits 0

### Rollback
`git revert HEAD`
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
- **Upstream (must be done first):** [T-00b-000 — Baseline migration]
- **Downstream (will consume this):** [T-00i-004, T-00d-004]
- **Parallel (can run concurrently):** [T-00b-003 — Migration runner]

### GIVEN / WHEN / THEN
**GIVEN** baseline migration has been applied
**WHEN** `pnpm seed forza-baseline` runs
**THEN** named snapshot populates: 1 tenant (`Forza Foods Ltd`, `tenant_id: 'forza-uuid-xxxx'`), 3 users (admin@forza.com, dev@forza.com, viewer@forza.com), 3 roles (admin, developer, viewer) — idempotently (re-running is a no-op via `onConflictDoNothing`)

### ACP Prompt
````
# Task T-00b-004 — Seed runner + named snapshots registry

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §10 — Event-first + AI/Trace-ready Schema` — R13 columns wymagane na każdej business table (tenant_id, id UUID, etc.)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T5-seed constraints: `seed/<feature>-seed.ts` z Drizzle typed insert, factory pattern, snapshot names `forza-baseline`, `empty-tenant`, `multi-tenant-3`

## Twoje zadanie
Utwórz seed runner z 3 named snapshots. Factory pattern per entity. Seed jest idempotentny (onConflictDoNothing). Snapshot `forza-baseline` = referencyjna dane testowe dla wszystkich integracyjnych testów.

## Implementacja
1. Utwórz `packages/db/seed/index.ts` z `applySnapshot(name: 'forza-baseline' | 'empty-tenant' | 'multi-tenant-3')` dispatcher
2. Utwórz `packages/db/seed/factories/tenant.factory.ts`:
   ```typescript
   export const createTenant = (overrides?) => db.insert(schema.tenants).values({
     id: crypto.randomUUID(), name: 'Test Tenant', schema_version: 1, ...overrides
   }).onConflictDoNothing()
   ```
   Podobne factories dla `user.factory.ts`, `role.factory.ts`
3. Utwórz `packages/db/seed/snapshots/forza-baseline.ts`: 1 tenant (Forza Foods Ltd) + 3 users (admin@forza.com, dev@forza.com, viewer@forza.com) + 3 roles (admin/developer/viewer)
4. Utwórz `packages/db/seed/snapshots/empty-tenant.ts` (1 tenant, 0 users) + `packages/db/seed/snapshots/multi-tenant-3.ts` (3 tenants)
5. Dodaj npm script: `"seed": "tsx packages/db/seed/index.ts"` — wywołanie: `pnpm seed forza-baseline`

## Files
**Create:** `packages/db/seed/index.ts`, `packages/db/seed/factories/tenant.factory.ts`, `packages/db/seed/factories/user.factory.ts`, `packages/db/seed/factories/role.factory.ts`, `packages/db/seed/snapshots/forza-baseline.ts`, `packages/db/seed/snapshots/empty-tenant.ts`, `packages/db/seed/snapshots/multi-tenant-3.ts`
**Modify:** `package.json` — dodaj: seed script

## Done when
- `vitest packages/db/seed/seed.test.ts` PASS — sprawdza: forza-baseline idempotent (run twice = same row count)
- `pnpm seed forza-baseline` exits 0
- `pnpm test:smoke` green

## Rollback
`DELETE FROM roles; DELETE FROM users; DELETE FROM tenants;` on test DB.
````

### Test gate (planning summary)
- **Integration:** `vitest packages/db/seed/seed.test.ts` — covers: idempotent seed
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DELETE FROM roles; DELETE FROM users; DELETE FROM tenants;`
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
- **Upstream (must be done first):** [T-00b-003 — Migration runner scripts, T-00h-001 — DeptColumns migration]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-00b-004 — Seed runner]

### GIVEN / WHEN / THEN
**GIVEN** Drizzle schema and `Reference.DeptColumns` metadata table exist
**WHEN** `pnpm drift:check` runs (CI or daily job)
**THEN** differences between `information_schema.columns` and declared Drizzle schema are reported as rows in `drift_events` table + stdout JSON, exit code 1 in CI on any drift found

### ACP Prompt
````
# Task T-00b-005 — Schema drift detector (daily job + CI gate)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §6 — Schema-driven Foundation` — "Drift detection daily job: compare information_schema vs Reference.DeptColumns", schema versioning requirements
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T2-api constraints

## Twoje zadanie
Utwórz drift detection script + `drift_events` table migration. Script porównuje `information_schema.columns` z Drizzle schema introspection. Na drift → INSERT do `drift_events` + stdout + exit 1. Idempotent: re-run bez driftu = exit 0.

## Implementacja
1. Utwórz migration `packages/db/schema/drift-events.ts` + wygeneruj `drizzle/migrations/002-drift-events.sql` — tabela: `drift_events (id UUID PK, detected_at TIMESTAMPTZ DEFAULT now(), table_name TEXT, column_name TEXT, expected_type TEXT, actual_type TEXT, resolved_at TIMESTAMPTZ NULL)`
2. Utwórz `packages/db/scripts/drift-check.ts`:
   - Query `information_schema.columns WHERE table_schema = 'public'` → compare vs `db._.schema` introspection
   - INSERT drift rows do `drift_events` (jeśli nie already reported i unresolved)
   - Print JSON summary do stdout
   - Exit 1 jeśli unresolved drift found, else exit 0
3. Utwórz integration test `packages/db/drift-check.test.ts` z deliberate drift fixture (add column manually, run check, assert drift detected)
4. Dodaj npm script: `"drift:check": "tsx packages/db/scripts/drift-check.ts"` + CI step w `turbo.json`
5. Dodaj Sentry breadcrumb emit w `packages/db/scripts/drift-check.ts`, jeśli `SENTRY_DSN` env present

## Files
**Create:** `packages/db/schema/drift-events.ts`, `drizzle/migrations/002-drift-events.sql`, `packages/db/scripts/drift-check.ts`, `packages/db/drift-check.test.ts`
**Modify:** `package.json` — dodaj: drift:check script; `turbo.json` — dodaj: drift-check pipeline step

## Done when
- `vitest packages/db/drift-check.test.ts` PASS — sprawdza: deliberate drift detected, exit 1 on drift
- `pnpm drift:check` exits 0 on clean schema
- `pnpm test:smoke` green

## Rollback
Disable CI step; `DROP TABLE drift_events`.
````

### Test gate (planning summary)
- **Integration:** `vitest packages/db/drift-check.test.ts` — covers: drift detected on schema mismatch
- **CI gate:** `pnpm drift:check` exits 0 on clean schema; exits 1 on any drift

### Rollback
`Disable CI step; `DROP TABLE drift_events``
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
- **Upstream (must be done first):** [T-00b-002 — Drizzle config + client singleton]
- **Downstream (will consume this):** [T-00c-003 — Next.js middleware, T-00d-002 — RLS policies]
- **Parallel (can run concurrently):** [T-00b-005 — Schema drift detector]

### GIVEN / WHEN / THEN
**GIVEN** Drizzle client exists and baseline migration is applied
**WHEN** a request handler calls `await setCurrentOrgId(db, orgId)` inside a transaction
**THEN** the Postgres session has `SET LOCAL app.current_org_id = '<orgId>'` active for that transaction; RLS policies using `current_setting('app.current_org_id')` enforce tenant isolation; calling outside transaction throws `OrgIdContextError`

### ACP Prompt
````
# Task T-00b-006 — Supabase client singleton + `setCurrentOrgId` RLS context setter

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — RLS default (R3): `tenant_id UUID NOT NULL` na wszystkich tabelach biznesowych, policies USING + WITH CHECK, LEAKPROOF SECURITY DEFINER wrappers
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T2-api constraints

## Twoje zadanie
Utwórz RLS context setter `setCurrentOrgId` który ustawia Postgres session variable `app.current_org_id`. Musi być wywoływany WEWNĄTRZ transaction (nie outside). Eksportuj też convenience wrapper `withOrgContext(orgId, fn)`.

## Implementacja
1. Utwórz `packages/db/rls-context.ts`:
   ```typescript
   export class OrgIdContextError extends Error {}
   
   export async function setCurrentOrgId(db: DrizzleClient, orgId: string): Promise<void> {
     // Must be inside transaction — detect via pg session state
     await db.execute(sql`SET LOCAL app.current_org_id = ${orgId}`)
   }
   
   export async function withOrgContext<T>(db: DrizzleClient, orgId: string, fn: () => Promise<T>): Promise<T> {
     return db.transaction(async (tx) => {
       await setCurrentOrgId(tx, orgId)
       return fn()
     })
   }
   ```
2. Utwórz integration test `packages/db/rls-context.integration.test.ts`: call `setCurrentOrgId` outside transaction → throws error; inside transaction → `SELECT current_setting('app.current_org_id')` returns orgId
3. Dodaj przypadek testowy do `packages/db/rls-context.integration.test.ts`: insert row with wrong tenant_id inside `withOrgContext` → RLS blocks
4. Export from `packages/db/index.ts`
5. Zacommituj `packages/db/rls-context.ts`, `packages/db/rls-context.integration.test.ts` i zmiany w `packages/db/index.ts`

## Files
**Create:** `packages/db/rls-context.ts`, `packages/db/rls-context.integration.test.ts`
**Modify:** `packages/db/index.ts` — dodaj: export { setCurrentOrgId, withOrgContext, OrgIdContextError }

## Done when
- `vitest packages/db/rls-context.integration.test.ts` PASS — sprawdza: SET LOCAL sets session var, outside-tx throws, RLS enforced
- `pnpm test:smoke` green

## Rollback
`git rm packages/db/rls-context.ts`
````

### Test gate (planning summary)
- **Integration:** `vitest packages/db/rls-context.integration.test.ts` — covers: SET LOCAL, outside-tx error, RLS enforcement
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm packages/db/rls-context.ts`
## T-00b-M01 — Main Table migration (69 typed Forza cols + ext/private JSONB + schema_version)

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
- **Upstream (must be done first):** [T-00b-000 — Baseline migration, T-00h-001 — DeptColumns migration]
- **Downstream (will consume this):** [T-00d-002, T-00e-002, T-00i-001]
- **Parallel (can run concurrently):** [T-00f-001, T-00g-001]

### GIVEN / WHEN / THEN
**GIVEN** baseline and DeptColumns migrations have been applied
**WHEN** migration `015-main-table-69-cols.sql` runs
**THEN** `main_table` exists with: 69 typed Forza columns per MAIN-TABLE-SCHEMA.md, `ext_jsonb JSONB`, `private_jsonb JSONB`, `schema_version INT NOT NULL DEFAULT 1`, composite index `(tenant_id, created_at)`, GIN index on `ext_jsonb`; column count integration test passes

### ACP Prompt
````
# Task T-00b-M01 — Main Table migration (69 typed Forza cols + ext/private JSONB + schema_version)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §6 — Schema-driven Foundation` — Main Table 69 cols, storage tiers (L1-L4), ext_jsonb + private_jsonb, R2 hybrid storage pattern
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T1-schema constraints: Drizzle ORM, R13 columns
- Dodatkowe: jeśli istnieje `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/specs/MAIN-TABLE-SCHEMA.md` — przeczytaj wszystkie 69 kolumn

## Twoje zadanie
Utwórz Drizzle schema dla `main_table` z 69 typed Forza columns + storage tiers. R13 columns wymagane (id UUID, tenant_id UUID NOT NULL REFERENCES tenants(id), created_at TIMESTAMPTZ DEFAULT now(), created_by_user UUID, created_by_device UUID, app_version TEXT, model_prediction_id UUID, epcis_event_id UUID, external_id TEXT, schema_version INT NOT NULL DEFAULT 1). Dodatkowo L3/L4 storage: `ext_jsonb JSONB`, `private_jsonb JSONB`. R2 indexes: composite `(tenant_id, created_at)` + GIN on `ext_jsonb`.

## Implementacja
1. Przeczytaj `_meta/specs/MAIN-TABLE-SCHEMA.md` (lub Foundation PRD §6) — wylistuj wszystkie 69 kolumn z typami
2. Utwórz `packages/db/schema/main-table.ts` z Drizzle pgTable definition: R13 cols + 69 Forza cols + ext_jsonb + private_jsonb + schema_version
3. Dodaj indexes w `packages/db/schema/main-table.ts`: `.index('main_table_tenant_created_idx', (t) => [t.tenant_id, t.created_at])` + `.index('main_table_ext_jsonb_gin_idx', (t) => t.ext_jsonb, { using: 'gin' })`
4. Uruchom `pnpm drizzle-kit generate` dla `packages/db/schema/main-table.ts` → generuje `drizzle/migrations/015-main-table-69-cols.sql`
5. Napisz i uruchom integration test w `drizzle/migrations/main-table-69.integration.test.ts`: `\\d+ main_table` ma ≥69 typed cols + 2 JSONB + schema_version + 2 indexes

## Files
**Create:** `packages/db/schema/main-table.ts`, `drizzle/migrations/015-main-table-69-cols.sql`

## Done when
- `vitest drizzle/migrations/main-table-69.integration.test.ts` PASS — sprawdza: column count ≥69, ext_jsonb JSONB type, GIN index exists, composite index exists
- `pnpm test:migrations` green
- `pnpm test:smoke` green

## Rollback
`DROP TABLE main_table CASCADE` (replace with placeholder stub).
````

### Test gate (planning summary)
- **Integration:** `vitest drizzle/migrations/main-table-69.integration.test.ts` — covers: column count, JSONB types, indexes
- **CI gate:** `pnpm test:migrations` green

### Rollback
`DROP TABLE main_table CASCADE`
## T-00b-A01 — Postgres app-role connection split (migrations role vs app role)

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 60 min
**Parent feature:** 00-b db scaffold (R3 hardening)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-002 — Drizzle config, T-00d-002 — RLS policies]
- **Downstream (will consume this):** [T-00i-003, T-00d-004]
- **Parallel (can run concurrently):** [T-00b-006 — RLS context setter]

### GIVEN / WHEN / THEN
**GIVEN** Drizzle client exists and RLS baseline migration has run
**WHEN** `import { dbApp, dbAdmin } from '@monopilot/db'` is used
**THEN** `dbApp` connects as `app_role` (RLS-enforced, SELECT/INSERT/UPDATE/DELETE on business tables, no DDL), `dbAdmin` connects as migrations role with full DDL; ESLint guard + CI check forbids `dbAdmin` import in `apps/**/*`

### ACP Prompt
````
# Task T-00b-A01 — Postgres app-role connection split (migrations role vs app role)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/00-FOUNDATION-PRD.md` → znajdź sekcję `## §5 — Tech Stack` — RLS default (R3): "testy zawsze z app-role connection (nigdy superuser)"
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/plans/atomic-task-decomposition-guide.md` → znajdź sekcję `## §5` — T1-schema + T2-api constraints

## Twoje zadanie
Utwórz split: `app_role` dla request path (RLS enforced, no DDL) vs migrations role dla schema changes. ESLint rule blokuje import `dbAdmin` w `apps/**`. Cel: żaden request path kod nie może robić DDL.

SQL dla migration:
```sql
CREATE ROLE app_role WITH NOLOGIN;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;
-- No CREATE TABLE, no DDL grants
```

## Implementacja
1. Utwórz migration `packages/db/schema/app-role.ts` → wygeneruje `drizzle/migrations/016-app-role.sql` z SQL powyżej
2. Zaktualizuj `packages/db/index.ts`:
   ```typescript
   export const dbApp = drizzle(postgres(process.env.DATABASE_APP_ROLE_URL!), { schema })
   export const dbAdmin = drizzle(postgres(process.env.DATABASE_URL!), { schema })
   ```
   Dodaj `DATABASE_APP_ROLE_URL` do `apps/web/lib/env.ts` Zod schema
3. Dodaj ESLint rule do `eslint.config.mjs`: `no-restricted-imports` dla `apps/**/*` banning import `dbAdmin` from `@monopilot/db`
4. Integration test `packages/db/app-role.integration.test.ts`: `dbApp` cannot `CREATE TABLE` (gets permission denied), RLS still enforced
5. Zacommituj `packages/db/index.ts`, `eslint.config.mjs`, `apps/web/lib/env.ts` i `packages/db/app-role.integration.test.ts`, a potem zweryfikuj przez `eslint.config.mjs`, że `pnpm lint` enforces the guard

## Files
**Create:** `packages/db/schema/app-role.ts`, `drizzle/migrations/016-app-role.sql`, `packages/db/app-role.integration.test.ts`
**Modify:** `packages/db/index.ts` — dodaj: dbApp export; `eslint.config.mjs` — dodaj: no-restricted-imports rule; `apps/web/lib/env.ts` — dodaj: DATABASE_APP_ROLE_URL

## Done when
- `vitest packages/db/app-role.integration.test.ts` PASS — sprawdza: dbApp cannot DDL, RLS enforced
- `pnpm lint` flags dbAdmin import in apps/ (test with fixture)
- `pnpm test:smoke` green

## Rollback
`DROP ROLE app_role` + revert client split.
````

### Test gate (planning summary)
- **Integration:** `vitest packages/db/app-role.integration.test.ts` — covers: app_role cannot DDL, RLS enforced
- **CI gate:** ESLint rule green; `pnpm test:smoke` green

### Rollback
`DROP ROLE app_role` + revert index.ts client split
## Dependency table

| ID | Upstream | Parallel |
|---|---|---|
| T-00a-001 | [] | [] |
| T-00a-002 | [T-00a-001] | [T-00a-007] |
| T-00a-003 | [T-00a-002] | [T-00a-004] |
| T-00a-004 | [T-00a-002] | [T-00a-003] |
| T-00a-005 | [T-00a-001] | [T-00a-002, T-00a-003, T-00a-004] |
| T-00a-006 | [T-00a-004] | [] |
| T-00a-007 | [T-00a-002] | [T-00a-003] |
| T-00a-008 | [T-00a-002, T-00a-003] | [T-00a-006] |
| T-00a-009 | [T-00a-008, T-00f-002] | [T-00f-003] |
| T-00a-006b | [T-00a-006] | [] |
| T-00b-E01 | [T-00a-005] | [T-00b-E02, T-00b-E03] |
| T-00b-E02 | [T-00a-005] | [T-00b-E01, T-00b-E03] |
| T-00b-E03 | [T-00a-005] | [T-00b-E01, T-00b-E02] |
| T-00b-000 | [T-00a-005, T-00b-001] | [] |
| T-00b-001 | [T-00a-007] | [T-00b-E01, T-00b-E02, T-00b-E03] |
| T-00b-002 | [T-00b-001] | [T-00b-E01, T-00b-E02, T-00b-E03] |
| T-00b-003 | [T-00b-000, T-00b-002] | [T-00b-004] |
| T-00b-004 | [T-00b-000] | [T-00b-003] |
| T-00b-005 | [T-00b-003, T-00h-001] | [T-00b-004] |
| T-00b-006 | [T-00b-002] | [T-00b-005] |
| T-00b-M01 | [T-00b-000, T-00h-001] | [T-00f-001, T-00g-001] |
| T-00b-A01 | [T-00b-002, T-00d-002] | [T-00b-006] |

---

## Wave plan

**Wave 0 (HARD BLOCKERS — dispatch first, no parallel until done):**
T-00b-E01, T-00b-E02, T-00b-E03, T-00b-000

_Note: Wave 0 requires T-00a-005 (README) as prerequisite, which itself requires T-00a-001. So minimum pre-Wave-0 chain: T-00a-001 → T-00a-005 → [T-00b-E01, T-00b-E02, T-00b-E03 parallel]. T-00b-000 additionally needs T-00b-001 → T-00b-002._

**Wave -1 (prerequisite chain for Wave 0):**
T-00a-001 → T-00a-005

**Wave 1 (after T-00a-001, parallel):**
T-00a-002, T-00a-003, T-00a-004, T-00a-005, T-00a-007
_(T-00a-002 blocks T-00a-003/004/007; T-00a-003 + T-00a-004 parallel)_

**Wave 2 (after Wave 1 + after T-00b-001):**
T-00b-E01, T-00b-E02, T-00b-E03 (parallel trio — all need T-00a-005)
T-00b-001 (needs T-00a-007)
T-00a-006 (needs T-00a-004)
T-00a-008 (needs T-00a-002 + T-00a-003)

**Wave 3 (after Wave 2):**
T-00b-002 (needs T-00b-001)
T-00b-000 (needs T-00b-001 + T-00a-005 — both done in Wave 2)
T-00a-006b (needs T-00a-006)

**Wave 4 (after Wave 3 — first Drizzle work):**
T-00b-003, T-00b-004 (parallel — both need T-00b-000)
T-00b-006 (needs T-00b-002)

**Wave 5 (after Wave 4 + T-00h-001 from another track):**
T-00b-005 (needs T-00b-003 + T-00h-001)
T-00b-M01 (needs T-00b-000 + T-00h-001)
T-00b-A01 (needs T-00b-002 + T-00d-002)
T-00a-009 (needs T-00a-008 + T-00f-002)
