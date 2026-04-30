# E-1 Settings-a — Identity + Reference Data + Toggles + i18n (v2)

Generated: 2026-04-23
Tracks: S-α Identity (E01, E02, 001-010, 026, 027), S-β Reference Data (011-015, 025), S-γ Toggles+i18n (016-024, 028)
Tasks: T-02SETa-E01, E02, 001-028

## T-02SETa-E01 — `permissions.enum.ts` Settings extension (architect lock)

**Type:** T1-schema
**Context budget:** ~25k tokens
**Est time:** 30 min
**Parent feature:** 02-SET-a RBAC (§3, §5.1)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-E01 — Foundation permissions.enum.ts lock]
- **Downstream (will consume this):** [T-02SETa-001, T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005, T-02SETa-006]
- **Parallel (can run concurrently):** [T-02SETa-E02]

### GIVEN / WHEN / THEN
**GIVEN** Foundation `apps/web/lib/rbac/permissions.enum.ts` exists with base permissions from T-00b-E01
**WHEN** the Settings permission group is appended and the file re-locked
**THEN** a single source of truth exists for the 14 settings permission strings: `settings:orgs:view`, `settings:orgs:create`, `settings:orgs:update`, `settings:orgs:delete`, `settings:users:view`, `settings:users:invite`, `settings:users:update`, `settings:users:deactivate`, `settings:roles:view`, `settings:roles:create`, `settings:roles:update`, `settings:roles:delete`, `settings:security:view`, `settings:security:update` — all with JSDoc + exported `ALL_SETTINGS_PERMISSIONS` slice

### Test gate
- **Unit:** `vitest apps/web/lib/rbac/permissions.test.ts` — no dupes, `^[a-z]+:[a-z_]+:[a-z_]+$` regex, all 14 settings strings present
- **CI gate:** `pnpm test:unit` green

### Rollback
`git checkout apps/web/lib/rbac/permissions.enum.ts` — remove appended Settings block; re-run unit test.
### ACP Prompt
````
# Task T-02SETa-E01 — permissions.enum.ts Settings extension (architect lock)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → cały plik — istniejące permission strings, struktura exportów

## Twoje zadanie
Append a SETTINGS permission group to `apps/web/lib/rbac/permissions.enum.ts`.
The file already has base permissions from Foundation. You must ADD (never replace) a clearly delimited
`// ─── SETTINGS ──────────────────────────────────────────────────────────────`
block containing the following 14 enum entries with JSDoc:

```ts
/** Settings – Organizations */
SETTINGS_ORGS_VIEW = 'settings:orgs:view',
SETTINGS_ORGS_CREATE = 'settings:orgs:create',
SETTINGS_ORGS_UPDATE = 'settings:orgs:update',
SETTINGS_ORGS_DELETE = 'settings:orgs:delete',
/** Settings – Users */
SETTINGS_USERS_VIEW = 'settings:users:view',
SETTINGS_USERS_INVITE = 'settings:users:invite',
SETTINGS_USERS_UPDATE = 'settings:users:update',
SETTINGS_USERS_DEACTIVATE = 'settings:users:deactivate',
/** Settings – Roles */
SETTINGS_ROLES_VIEW = 'settings:roles:view',
SETTINGS_ROLES_CREATE = 'settings:roles:create',
SETTINGS_ROLES_UPDATE = 'settings:roles:update',
SETTINGS_ROLES_DELETE = 'settings:roles:delete',
/** Settings – Security policies */
SETTINGS_SECURITY_VIEW = 'settings:security:view',
SETTINGS_SECURITY_UPDATE = 'settings:security:update',
```

After the enum block, also export:
```ts
export const ALL_SETTINGS_PERMISSIONS: Permission[] = [
  Permission.SETTINGS_ORGS_VIEW,
  Permission.SETTINGS_ORGS_CREATE,
  Permission.SETTINGS_ORGS_UPDATE,
  Permission.SETTINGS_ORGS_DELETE,
  Permission.SETTINGS_USERS_VIEW,
  Permission.SETTINGS_USERS_INVITE,
  Permission.SETTINGS_USERS_UPDATE,
  Permission.SETTINGS_USERS_DEACTIVATE,
  Permission.SETTINGS_ROLES_VIEW,
  Permission.SETTINGS_ROLES_CREATE,
  Permission.SETTINGS_ROLES_UPDATE,
  Permission.SETTINGS_ROLES_DELETE,
  Permission.SETTINGS_SECURITY_VIEW,
  Permission.SETTINGS_SECURITY_UPDATE,
]
```

## Implementacja
1. Read `apps/web/lib/rbac/permissions.enum.ts` — locate end of existing enum body and existing exports
2. Append the SETTINGS block (14 entries with JSDoc, delimited by section comment) inside the `Permission` enum in `apps/web/lib/rbac/permissions.enum.ts`
3. Append `ALL_SETTINGS_PERMISSIONS` exported array after the enum declaration in `apps/web/lib/rbac/permissions.enum.ts` (below any existing `ALL_*` exports)
4. Update `apps/web/lib/rbac/permissions.test.ts` — add test cases:
   - All 14 settings strings match regex `/^[a-z]+:[a-z_]+:[a-z_]+$/`
   - `ALL_SETTINGS_PERMISSIONS.length === 14`
   - No duplicate values across entire enum
5. Update `CODEOWNERS` — add `apps/web/lib/rbac/permissions.enum.ts @architect` if CODEOWNERS exists

## Files
**Modify:** `apps/web/lib/rbac/permissions.enum.ts` — append Settings block inside enum + ALL_SETTINGS_PERMISSIONS export
**Modify:** `apps/web/lib/rbac/permissions.test.ts` — extend unit tests

## Done when
- `vitest apps/web/lib/rbac/permissions.test.ts` PASS — all 14 settings strings present, regex green, no dupes
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git checkout apps/web/lib/rbac/permissions.enum.ts apps/web/lib/rbac/permissions.test.ts`
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/rbac/permissions.test.ts` — covers: all 14 settings strings present, regex green, no dupes
- **CI gate:** `pnpm test:unit` green

### Rollback
`git checkout apps/web/lib/rbac/permissions.enum.ts apps/web/lib/rbac/permissions.test.ts`
## T-02SETa-E02 — `events.enum.ts` Settings extension (architect lock)

**Type:** T1-schema
**Context budget:** ~20k tokens
**Est time:** 20 min
**Parent feature:** 02-SET-a outbox events
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-E02 — Foundation events.enum.ts lock]
- **Downstream (will consume this):** [T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005]
- **Parallel (can run concurrently):** [T-02SETa-E01]

### GIVEN / WHEN / THEN
**GIVEN** Foundation `apps/web/lib/outbox/events.enum.ts` exists with base event types
**WHEN** Settings domain events are appended
**THEN** event type strings `settings.org.created`, `settings.org.updated`, `settings.org.deleted`, `settings.user.invited`, `settings.user.updated`, `settings.user.deactivated`, `settings.role.created`, `settings.role.updated` all exist as enum entries in ISA-95 dot format with JSDoc

### Test gate
- **Unit:** `vitest apps/web/lib/outbox/events.test.ts` — no dupes, format regex `/^[a-z]+\.[a-z_]+\.[a-z_]+$/`, all 8 settings events present
- **CI gate:** `pnpm test:unit` green

### Rollback
`git checkout apps/web/lib/outbox/events.enum.ts` — remove appended Settings block.
### ACP Prompt
````
# Task T-02SETa-E02 — events.enum.ts Settings extension (architect lock)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → cały plik — istniejące event type strings, struktura exportów

## Twoje zadanie
Append a SETTINGS event group to `apps/web/lib/outbox/events.enum.ts`.
Add (never replace) a clearly delimited
`// ─── SETTINGS ──────────────────────────────────────────────────────────────`
block containing the following 8 entries:

```ts
/** Settings – Organization lifecycle */
SETTINGS_ORG_CREATED = 'settings.org.created',
SETTINGS_ORG_UPDATED = 'settings.org.updated',
SETTINGS_ORG_DELETED = 'settings.org.deleted',
/** Settings – User lifecycle */
SETTINGS_USER_INVITED = 'settings.user.invited',
SETTINGS_USER_UPDATED = 'settings.user.updated',
SETTINGS_USER_DEACTIVATED = 'settings.user.deactivated',
/** Settings – Role lifecycle */
SETTINGS_ROLE_CREATED = 'settings.role.created',
SETTINGS_ROLE_UPDATED = 'settings.role.updated',
```

All strings follow ISA-95 dot-notation: `<module>.<aggregate>.<verb>`.

## Implementacja
1. Read `apps/web/lib/outbox/events.enum.ts` — locate end of existing enum body
2. Append the SETTINGS block (8 entries, JSDoc, section comment delimiter) inside the `EventType` enum in `apps/web/lib/outbox/events.enum.ts`
3. Update `apps/web/lib/outbox/events.test.ts` — add tests:
   - All 8 settings strings match regex `/^[a-z]+\.[a-z_]+\.[a-z_]+$/`
   - No duplicate values in entire enum
4. Update `CODEOWNERS` — add `apps/web/lib/outbox/events.enum.ts @architect` if CODEOWNERS exists

## Files
**Modify:** `apps/web/lib/outbox/events.enum.ts` — append Settings block
**Modify:** `apps/web/lib/outbox/events.test.ts` — extend unit tests

## Done when
- `vitest apps/web/lib/outbox/events.test.ts` PASS — all 8 settings events present, regex green, no dupes
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git checkout apps/web/lib/outbox/events.enum.ts apps/web/lib/outbox/events.test.ts`
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/outbox/events.test.ts` — covers: all 8 settings events present, regex green, no dupes
- **CI gate:** `pnpm test:unit` green

### Rollback
`git checkout apps/web/lib/outbox/events.enum.ts apps/web/lib/outbox/events.test.ts`
## T-02SETa-001 — Schema: organizations + org_security_policies + users + roles tables

**Type:** T1-schema
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a Identity (§5.1, §5.7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — baseline migration], [T-02SETa-E01]
- **Downstream (will consume this):** [T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005, T-02SETa-006, T-02SETa-027]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** Baseline migration applied (tenants skeleton, `apps/web/drizzle/migrations/` exists), `permissions.enum.ts` has Settings block (T-02SETa-E01 done)
**WHEN** `apps/web/drizzle/migrations/020-settings-identity.sql` is applied to local Supabase
**THEN** four tables exist: `organizations` (with R13 + slug, name, logo_url, status, settings JSONB), `org_security_policies` (with org_id PK FK + 6 policy columns), `users` extended (email, display_name, avatar_url, status, last_login_at, supabase_auth_id), `roles` (with id, tenant_id, name, description, is_system_role, permissions TEXT[] + R13); plus `role_permissions` join table; RLS enabled on all org-scoped tables; integration test PASS

### Test gate
- **Integration:** `vitest apps/web/drizzle/migrations/__tests__/020-settings-identity.integration.test.ts` — all 5 tables exist, R13 cols on organizations/users/roles, 0 system roles (seeded separately in T-027), RLS policies present
- **Unit:** `vitest apps/web/drizzle/schema/__tests__/settings-identity.test.ts` — Drizzle schema exports all table references, Zod validators reject invalid data
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop --migration 020-settings-identity` then `supabase db reset`
### ACP Prompt
````
# Task T-02SETa-001 — Schema: organizations + org_security_policies + users + roles tables

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/` → sprawdź istniejące migration pliki (numeracja) + schema/index.ts eksporty
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → upewnij się, że T-02SETa-E01 jest done (SETTINGS block obecny)

## Twoje zadanie
Utwórz Drizzle ORM schema i wygeneruj migration dla 5 tabel Settings Identity. Tabele muszą mieć R13 columns
na każdej tabeli biznesowej.

**R13 columns (wymagane na każdej tabeli biznesowej):**
`id UUID DEFAULT gen_random_uuid() PRIMARY KEY`,
`tenant_id UUID NOT NULL REFERENCES tenants(id)`,
`created_at TIMESTAMPTZ DEFAULT now()`,
`created_by_user UUID`,
`created_by_device UUID`,
`app_version TEXT`,
`model_prediction_id UUID`,
`epcis_event_id UUID`,
`external_id TEXT`,
`schema_version INT NOT NULL DEFAULT 1`

**Tabela organizations (R13 + dodatkowe kolumny):**
`slug TEXT UNIQUE NOT NULL`,
`name TEXT NOT NULL`,
`logo_url TEXT`,
`status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived'))`,
`settings JSONB NOT NULL DEFAULT '{}'`

**Tabela org_security_policies (R13 + dodatkowe):**
`org_id UUID NOT NULL REFERENCES organizations(id)` (UNIQUE — one row per org),
`min_password_length INT NOT NULL DEFAULT 8`,
`require_mfa BOOL NOT NULL DEFAULT false`,
`session_timeout_min INT NOT NULL DEFAULT 480`,
`allowed_domains TEXT[]`,
`sso_enabled BOOL NOT NULL DEFAULT false`

**Tabela users (R13 + dodatkowe):**
`email TEXT NOT NULL`,
`display_name TEXT`,
`avatar_url TEXT`,
`status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','deactivated'))`,
`last_login_at TIMESTAMPTZ`,
`supabase_auth_id UUID UNIQUE`

**Tabela roles (R13 + dodatkowe):**
`name TEXT NOT NULL`,
`description TEXT`,
`is_system_role BOOL NOT NULL DEFAULT false`,
`permissions TEXT[] NOT NULL DEFAULT '{}'`

**Tabela role_permissions (join table — NIE R13):**
`role_id UUID NOT NULL REFERENCES roles(id)`,
`permission TEXT NOT NULL`,
`PRIMARY KEY (role_id, permission)`

## Implementacja
1. Utwórz `apps/web/drizzle/schema/settings-identity.ts` z Drizzle `pgTable()` definicjami dla wszystkich 5 tabel używając `drizzle-orm/pg-core`; dodaj R13 cols na każdej tabeli biznesowej
2. Dodaj Zod validators w `apps/web/lib/validators/settings-identity.ts`:
   - `createOrgSchema` — slug regex `/^[a-z0-9-]+$/`, name required, status enum
   - `createUserSchema` — email format, status enum
   - `createRoleSchema` — name required, permissions array of strings
   - `updateOrgSecurityPolicySchema` — min_password_length min(8) max(128), session_timeout_min min(15) max(1440)
3. Uruchom `pnpm drizzle-kit generate` → wygeneruje `apps/web/drizzle/migrations/020-settings-identity.sql`
4. Zmodyfikuj `apps/web/drizzle/schema/index.ts` — dodaj re-export `export * from './settings-identity'`
5. Utwórz `apps/web/drizzle/migrations/__tests__/020-settings-identity.integration.test.ts` — apply migration na test DB i assert: wszystkie 5 tabel istnieje, R13 cols na organizations/users/roles obecne, `org_security_policies` ma constraint `org_id` UNIQUE

## Files
**Create:** `apps/web/drizzle/schema/settings-identity.ts`
**Create:** `apps/web/lib/validators/settings-identity.ts`
**Create:** `apps/web/drizzle/migrations/020-settings-identity.sql` (generated by drizzle-kit)
**Create:** `apps/web/drizzle/migrations/__tests__/020-settings-identity.integration.test.ts`
**Modify:** `apps/web/drizzle/schema/index.ts` — dodaj re-export

## Done when
- `vitest apps/web/drizzle/migrations/__tests__/020-settings-identity.integration.test.ts` PASS — 5 tabel, R13 cols, constraints OK
- `vitest apps/web/lib/validators/__tests__/settings-identity.test.ts` PASS — Zod rejects invalid slug regex, invalid email, invalid status enum
- `pnpm test:migrations` green

- `pnpm test:smoke` green
## Rollback
`pnpm drizzle-kit drop --migration 020-settings-identity` następnie `supabase db reset`
````
### Test gate (planning summary)
- **Integration:** `vitest apps/web/drizzle/migrations/__tests__/020-settings-identity.integration.test.ts` — covers: 5 tabel, R13 cols, constraints OK
- **Unit:** `vitest apps/web/lib/validators/__tests__/settings-identity.test.ts` — covers: Zod rejects invalid slug regex, invalid email, invalid status enum
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop --migration 020-settings-identity` następnie `supabase db reset`
## T-02SETa-002 — Server Actions: createOrg / updateOrg / deleteOrg

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 02-SET-a Organizations CRUD (§5.1)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001 — schema], [T-02SETa-E01 — permissions], [T-02SETa-E02 — events], [T-02SETa-006 — RBAC middleware]
- **Downstream (will consume this):** [T-02SETa-026 — E2E wiring]
- **Parallel (can run concurrently):** [T-02SETa-003, T-02SETa-004, T-02SETa-005]

### GIVEN / WHEN / THEN
**GIVEN** `organizations` table migrated; `permissions.enum.ts` has `SETTINGS_ORGS_CREATE/UPDATE/DELETE`; `events.enum.ts` has `SETTINGS_ORG_CREATED/UPDATED/DELETED`; `withPermission` middleware exists
**WHEN** `createOrg(data)`, `updateOrg(id, data)`, or `deleteOrg(id)` server actions are called
**THEN** org is created/updated/soft-deleted (status='archived'); `insertAuditLog()` emits one entry per mutation; `insertOutboxEvent(tenantId, EventType.SETTINGS_ORG_CREATED|UPDATED|DELETED, 'organization', org.id, payload)` called; RBAC guard rejects callers without matching permission; Zod input validation rejects malformed data with typed error

### Test gate
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/org-actions.test.ts` — RBAC reject (wrong permission), Zod reject (missing slug), success path emits audit + outbox
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/org-actions.integration.test.ts` — real local DB: createOrg → DB row + audit_log row + outbox_events row
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/app/actions/settings/org-actions.ts` and test files
### ACP Prompt
````
# Task T-02SETa-002 — Server Actions: createOrg / updateOrg / deleteOrg

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-identity.ts` → definicje tabel organizations
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → sprawdź SETTINGS_ORGS_* entries
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → sprawdź SETTINGS_ORG_* entries
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/with-permission.ts` → sygnatura withPermission HOF

## Twoje zadanie
Utwórz `apps/web/app/actions/settings/org-actions.ts` z 3 server actions:
- `createOrg(data: CreateOrgInput)` — wymaga `Permission.SETTINGS_ORGS_CREATE`
- `updateOrg(id: string, data: UpdateOrgInput)` — wymaga `Permission.SETTINGS_ORGS_UPDATE`
- `deleteOrg(id: string)` — soft delete (status='archived') — wymaga `Permission.SETTINGS_ORGS_DELETE`

Każda action musi:
1. Być owinięta przez `withPermission(Permission.SETTINGS_ORGS_*, async (data, ctx) => {...})`
2. Walidować input przez Zod (schema z `lib/validators/settings-identity.ts`)
3. Wykonać Drizzle insert/update do tabeli `organizations`
4. Wywołać `insertAuditLog({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'org.created'|'org.updated'|'org.deleted', resourceType: 'organization', resourceId: org.id })`
5. Wywołać `insertOutboxEvent(ctx.tenantId, EventType.SETTINGS_ORG_CREATED|UPDATED|DELETED, 'organization', org.id, {...payload})`

**Server Action pattern (użyj dosłownie):**
```ts
"use server"
import { Permission } from '@/lib/rbac/permissions.enum'
import { withPermission } from '@/lib/rbac/with-permission'
import { insertAuditLog } from '@/lib/audit/insert-audit-log'
import { insertOutboxEvent } from '@/lib/outbox/insert-outbox-event'
import { EventType } from '@/lib/outbox/events.enum'

export const createOrg = withPermission(
  Permission.SETTINGS_ORGS_CREATE,
  async (data: CreateOrgInput, ctx: ActionContext) => {
    // 1. validate z Zod
    // 2. db.insert(organizations).values({...data, tenantId: ctx.tenantId})
    // 3. insertAuditLog({...})
    // 4. insertOutboxEvent(ctx.tenantId, EventType.SETTINGS_ORG_CREATED, 'organization', org.id, {...})
    return { success: true, org }
  }
)
```

## Implementacja
1. Utwórz `apps/web/app/actions/settings/org-actions.ts` z `createOrg`, `updateOrg`, `deleteOrg` (soft-delete via `status = 'archived'`)
2. `createOrg` w `apps/web/app/actions/settings/org-actions.ts`: walidacja Zod `createOrgSchema`, insert do `organizations`, audit + outbox z `EventType.SETTINGS_ORG_CREATED`
3. `updateOrg` w `apps/web/app/actions/settings/org-actions.ts`: walidacja Zod `updateOrgSchema` (partial), update where id + tenantId, audit + outbox z `EventType.SETTINGS_ORG_UPDATED`
4. `deleteOrg` w `apps/web/app/actions/settings/org-actions.ts`: soft delete `status = 'archived'`, audit + outbox z `EventType.SETTINGS_ORG_DELETED`
5. Utwórz `apps/web/app/actions/settings/__tests__/org-actions.test.ts` (unit, mock Drizzle + auth) + `org-actions.integration.test.ts` (real supabaseLocalDb fixture, zero DB mocks)

## Files
**Create:** `apps/web/app/actions/settings/org-actions.ts`
**Create:** `apps/web/app/actions/settings/__tests__/org-actions.test.ts`
**Create:** `apps/web/app/actions/settings/__tests__/org-actions.integration.test.ts`

## Done when
- `vitest apps/web/app/actions/settings/__tests__/org-actions.test.ts` PASS — RBAC reject, Zod reject, success emits audit + outbox
- `vitest apps/web/app/actions/settings/__tests__/org-actions.integration.test.ts` PASS — createOrg → DB row + audit_log + outbox_events
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm apps/web/app/actions/settings/org-actions.ts` i pliki testów
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/org-actions.test.ts` — covers: RBAC reject, Zod reject, success emits audit + outbox
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/org-actions.integration.test.ts` — covers: createOrg → DB row + audit_log + outbox_events
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/app/actions/settings/org-actions.ts` i pliki testów
## T-02SETa-003 — Server Actions: inviteUser / updateUser / deactivateUser

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 75 min
**Parent feature:** 02-SET-a Users CRUD (§5.1)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001 — schema], [T-02SETa-E01 — permissions], [T-02SETa-E02 — events], [T-02SETa-006 — RBAC middleware]
- **Downstream (will consume this):** [T-02SETa-026 — E2E wiring]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-004, T-02SETa-005]

### GIVEN / WHEN / THEN
**GIVEN** `users` and `roles` tables migrated; `SETTINGS_USERS_INVITE`, `SETTINGS_USERS_UPDATE`, `SETTINGS_USERS_DEACTIVATE` permissions exist; `SETTINGS_USER_INVITED`, `SETTINGS_USER_UPDATED`, `SETTINGS_USER_DEACTIVATED` events exist; `withPermission` middleware exists
**WHEN** admin calls `inviteUser(data)`, `updateUser(id, data)`, or `deactivateUser(id)`
**THEN** user is inserted with `status='invited'` / updated / soft-deactivated (`status='deactivated'`); `insertAuditLog()` + `insertOutboxEvent()` called for each mutation; RBAC guard rejects callers without matching permission; Zod rejects invalid email or missing required fields; Supabase Auth `admin.inviteUserByEmail` called on invite path

### Test gate
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/user-actions.test.ts` — RBAC reject per permission, Zod reject (invalid email), invite emits audit + outbox with event `settings.user.invited`
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/user-actions.integration.test.ts` — inviteUser → user row in `users` table + `outbox_events` row
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/app/actions/settings/user-actions.ts` and test files
### ACP Prompt
````
# Task T-02SETa-003 — Server Actions: inviteUser / updateUser / deactivateUser

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-identity.ts` → definicje tabeli users, roles
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → SETTINGS_USERS_INVITE, SETTINGS_USERS_UPDATE, SETTINGS_USERS_DEACTIVATE
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → SETTINGS_USER_INVITED, SETTINGS_USER_UPDATED, SETTINGS_USER_DEACTIVATED
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/with-permission.ts` → sygnatura withPermission HOF

## Twoje zadanie
Utwórz `apps/web/app/actions/settings/user-actions.ts` z 3 server actions:
- `inviteUser(data: InviteUserInput)` — wymaga `Permission.SETTINGS_USERS_INVITE`
- `updateUser(id: string, data: UpdateUserInput)` — wymaga `Permission.SETTINGS_USERS_UPDATE`
- `deactivateUser(id: string)` — soft deactivate (`status='deactivated'`) — wymaga `Permission.SETTINGS_USERS_DEACTIVATE`

**inviteUser** musi:
1. Zwalidować `{ email: string, display_name?: string, roleId: string }` przez Zod (email format)
2. Wywołać Supabase Auth Admin API: `supabase.auth.admin.inviteUserByEmail(email)`
3. Wstawić wiersz do tabeli `users` z `status='invited'`, `supabase_auth_id` z odpowiedzi auth
4. `insertAuditLog(...)` + `insertOutboxEvent(tenantId, EventType.SETTINGS_USER_INVITED, 'user', userId, { email })`

**updateUser** musi:
1. Zwalidować partial `{ display_name?, avatar_url?, status? }`
2. Drizzle update where `id = userId AND tenant_id = ctx.tenantId`
3. `insertAuditLog(...)` + `insertOutboxEvent(tenantId, EventType.SETTINGS_USER_UPDATED, 'user', userId, diff)`

**deactivateUser** musi:
1. Update `status = 'deactivated'` gdzie `id = userId AND tenant_id = ctx.tenantId`
2. Sprawdzić czy nie deaktywuje ostatniego właściciela (owner role) — throw jeśli tak
3. `insertAuditLog(...)` + `insertOutboxEvent(tenantId, EventType.SETTINGS_USER_DEACTIVATED, 'user', userId, {})`

## Implementacja
1. Utwórz `apps/web/app/actions/settings/user-actions.ts` z trzema server actions owinętymi przez `withPermission`
2. Dodaj Zod schemas `inviteUserSchema`, `updateUserSchema` do `apps/web/lib/validators/settings-identity.ts`
3. `inviteUser` w `apps/web/app/actions/settings/user-actions.ts`: Supabase auth invite → insert users row → audit + outbox
4. `deactivateUser` w `apps/web/app/actions/settings/user-actions.ts`: sprawdź last-owner guard (query roles.is_system_role=true AND name='owner' count) → soft delete → audit + outbox
5. Utwórz `apps/web/app/actions/settings/__tests__/user-actions.test.ts` (unit, mock) + `user-actions.integration.test.ts` (supabaseLocalDb fixture)

## Files
**Create:** `apps/web/app/actions/settings/user-actions.ts`
**Create:** `apps/web/app/actions/settings/__tests__/user-actions.test.ts`
**Create:** `apps/web/app/actions/settings/__tests__/user-actions.integration.test.ts`
**Modify:** `apps/web/lib/validators/settings-identity.ts` — dodaj inviteUserSchema, updateUserSchema

## Done when
- `vitest apps/web/app/actions/settings/__tests__/user-actions.test.ts` PASS — każda z 3 actions: RBAC reject, Zod reject, success path emits audit + outbox
- `vitest apps/web/app/actions/settings/__tests__/user-actions.integration.test.ts` PASS — inviteUser → users row + outbox_events row
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm apps/web/app/actions/settings/user-actions.ts` i pliki testów
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/user-actions.test.ts` — covers: każda z 3 actions: RBAC reject, Zod reject, success path emits audit + outbox
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/user-actions.integration.test.ts` — covers: inviteUser → users row + outbox_events row
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/app/actions/settings/user-actions.ts` i pliki testów
## T-02SETa-004 — Server Actions: createRole / updateRole / deleteRole

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a 10 Roles + RBAC (§3, §5.1)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001 — schema], [T-02SETa-E01 — permissions], [T-02SETa-E02 — events], [T-02SETa-006 — RBAC middleware]
- **Downstream (will consume this):** [T-02SETa-026 — E2E wiring]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003, T-02SETa-005]

### GIVEN / WHEN / THEN
**GIVEN** `roles` and `role_permissions` tables migrated; `SETTINGS_ROLES_CREATE/UPDATE/DELETE` permissions exist; `SETTINGS_ROLE_CREATED/UPDATED` events exist; `withPermission` + `ALL_SETTINGS_PERMISSIONS` available
**WHEN** owner calls `createRole(data)`, `updateRole(id, data)`, or `deleteRole(id)` for custom (non-system) roles
**THEN** role is created/updated/deleted with `permissions TEXT[]` validated against `ALL_SETTINGS_PERMISSIONS`; system roles (`is_system_role=true`) throw `IMMUTABLE_SYSTEM_ROLE` error on any mutation; `insertAuditLog()` + `insertOutboxEvent()` called; RBAC guard rejects callers without matching permission

### Test gate
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/role-actions.test.ts` — system role mutation rejected with IMMUTABLE_SYSTEM_ROLE, invalid permission string rejected, success path emits audit + outbox
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/role-actions.integration.test.ts` — createRole → roles row + role_permissions rows + audit_log row
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/app/actions/settings/role-actions.ts` and test files
### ACP Prompt
````
# Task T-02SETa-004 — Server Actions: createRole / updateRole / deleteRole

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-identity.ts` → definicje tabel roles, role_permissions
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → SETTINGS_ROLES_CREATE/UPDATE/DELETE + ALL_SETTINGS_PERMISSIONS export
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → SETTINGS_ROLE_CREATED, SETTINGS_ROLE_UPDATED
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/with-permission.ts` → sygnatura withPermission HOF

## Twoje zadanie
Utwórz `apps/web/app/actions/settings/role-actions.ts` z 3 server actions:
- `createRole(data: CreateRoleInput)` — wymaga `Permission.SETTINGS_ROLES_CREATE`
- `updateRole(id: string, data: UpdateRoleInput)` — wymaga `Permission.SETTINGS_ROLES_UPDATE`
- `deleteRole(id: string)` — hard delete (tylko custom roles) — wymaga `Permission.SETTINGS_ROLES_DELETE`

**Immutability guard** — KAŻDA z trzech actions musi:
1. Pobrać rolę z DB sprawdzić `is_system_role`
2. Jeśli `is_system_role === true` → throw new Error('IMMUTABLE_SYSTEM_ROLE')

**Permission validation** — `createRole` i `updateRole` muszą:
1. Sprawdzić, że każdy string w `data.permissions[]` istnieje w `ALL_SETTINGS_PERMISSIONS` (import z `lib/rbac/permissions.enum.ts`)
2. Jeśli nieznany permission string → throw new Error(`UNKNOWN_PERMISSION: ${str}`)

**role_permissions table**: po każdym create/update wyczyść stare wiersze i wstaw nowe:
```ts
await db.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id))
await db.insert(rolePermissions).values(data.permissions.map(p => ({ roleId: role.id, permission: p })))
```

Każda mutation musi wywołać:
- `insertAuditLog({ tenantId, userId, action: 'role.created'|'role.updated'|'role.deleted', resourceType: 'role', resourceId: role.id })`
- `insertOutboxEvent(ctx.tenantId, EventType.SETTINGS_ROLE_CREATED|UPDATED, 'role', role.id, {...payload})`

## Implementacja
1. Utwórz `apps/web/app/actions/settings/role-actions.ts` z `createRole`, `updateRole`, `deleteRole`, każda owinięta przez `withPermission`
2. Dodaj immutability guard i permission validation jak opisano w `apps/web/app/actions/settings/role-actions.ts`
3. Dodaj Zod schemas `createRoleSchema`, `updateRoleSchema` do `apps/web/lib/validators/settings-identity.ts`
4. `deleteRole` w `apps/web/app/actions/settings/role-actions.ts`: sprawdź że `is_system_role=false`, potem usuń `role_permissions` rows, potem usuń `roles` row
5. Utwórz `apps/web/app/actions/settings/__tests__/role-actions.test.ts` (unit) + `role-actions.integration.test.ts` (supabaseLocalDb fixture, zero DB mocks)

## Files
**Create:** `apps/web/app/actions/settings/role-actions.ts`
**Create:** `apps/web/app/actions/settings/__tests__/role-actions.test.ts`
**Create:** `apps/web/app/actions/settings/__tests__/role-actions.integration.test.ts`
**Modify:** `apps/web/lib/validators/settings-identity.ts` — dodaj createRoleSchema, updateRoleSchema

## Done when
- `vitest apps/web/app/actions/settings/__tests__/role-actions.test.ts` PASS — system role throws IMMUTABLE_SYSTEM_ROLE, unknown permission throws UNKNOWN_PERMISSION, success path emits audit + outbox
- `vitest apps/web/app/actions/settings/__tests__/role-actions.integration.test.ts` PASS — createRole → roles row + role_permissions rows + audit_log row
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm apps/web/app/actions/settings/role-actions.ts` i pliki testów
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/role-actions.test.ts` — covers: system role throws IMMUTABLE_SYSTEM_ROLE, unknown permission throws UNKNOWN_PERMISSION, success path emits audit + outbox
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/role-actions.integration.test.ts` — covers: createRole → roles row + role_permissions rows + audit_log row
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/app/actions/settings/role-actions.ts` i pliki testów
## T-02SETa-005 — Server Action: updateOrgSecurityPolicy

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a Org security baseline (§5.7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001 — schema], [T-02SETa-E01 — permissions], [T-02SETa-E02 — events], [T-02SETa-006 — RBAC middleware]
- **Downstream (will consume this):** [T-02SETa-026 — E2E wiring]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003, T-02SETa-004]

### GIVEN / WHEN / THEN
**GIVEN** `org_security_policies` table migrated; `SETTINGS_SECURITY_UPDATE` permission exists; `SETTINGS_ORG_UPDATED` event exists; `withPermission` middleware exists
**WHEN** owner calls `updateOrgSecurityPolicy(orgId, data)` server action
**THEN** policy row is upserted (INSERT ... ON CONFLICT DO UPDATE) for the given orgId; validated values enforced: `min_password_length` 8–128, `session_timeout_min` 15–1440, `require_mfa` bool, `sso_enabled` bool, `allowed_domains` string array; `insertAuditLog()` + `insertOutboxEvent(tenantId, EventType.SETTINGS_ORG_UPDATED, 'org_security_policy', orgId, payload)` called; non-owner RBAC guard rejects

### Test gate
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/security-actions.test.ts` — RBAC reject, Zod reject (min_password_length < 8, session_timeout_min < 15), success emits audit + outbox
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/security-actions.integration.test.ts` — upsert creates row on first call, updates on second call; outbox_events row present
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/app/actions/settings/security-actions.ts` and test files
### ACP Prompt
````
# Task T-02SETa-005 — Server Action: updateOrgSecurityPolicy

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-identity.ts` → definicja tabeli org_security_policies
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → SETTINGS_SECURITY_VIEW, SETTINGS_SECURITY_UPDATE
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → SETTINGS_ORG_UPDATED
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/with-permission.ts` → sygnatura withPermission HOF

## Twoje zadanie
Utwórz `apps/web/app/actions/settings/security-actions.ts` z 1 server action:
- `updateOrgSecurityPolicy(orgId: string, data: UpdateOrgSecurityPolicyInput)` — wymaga `Permission.SETTINGS_SECURITY_UPDATE`

**Tabela org_security_policies ma te kolumny** (przekazuj jako data):
- `org_id UUID` (FK do organizations, UNIQUE per org)
- `min_password_length INT` — min 8, max 128, default 8
- `require_mfa BOOL` — default false
- `session_timeout_min INT` — min 15, max 1440, default 480
- `allowed_domains TEXT[]` — array of domain strings np. ["example.com"]
- `sso_enabled BOOL` — default false

**Zod schema** (`updateOrgSecurityPolicySchema`) musi walidować:
```ts
z.object({
  min_password_length: z.number().int().min(8).max(128).optional(),
  require_mfa: z.boolean().optional(),
  session_timeout_min: z.number().int().min(15).max(1440).optional(),
  allowed_domains: z.array(z.string()).optional(),
  sso_enabled: z.boolean().optional(),
})
```

**Upsert pattern** (Drizzle):
```ts
await db.insert(orgSecurityPolicies)
  .values({ orgId, tenantId: ctx.tenantId, ...validated })
  .onConflictDoUpdate({ target: orgSecurityPolicies.orgId, set: { ...validated } })
```

Po upsert:
- `insertAuditLog({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'security_policy.updated', resourceType: 'org_security_policy', resourceId: orgId })`
- `insertOutboxEvent(ctx.tenantId, EventType.SETTINGS_ORG_UPDATED, 'org_security_policy', orgId, { ...validated })`

## Implementacja
1. Utwórz `apps/web/app/actions/settings/security-actions.ts` z `updateOrgSecurityPolicy` owinięte przez `withPermission(Permission.SETTINGS_SECURITY_UPDATE, ...)`
2. Dodaj `updateOrgSecurityPolicySchema` do `apps/web/lib/validators/settings-identity.ts`
3. Zaimplementuj upsert w `apps/web/app/actions/settings/org-security-actions.ts` używając Drizzle `onConflictDoUpdate` (nie raw SQL)
4. Wywołaj `insertAuditLog` + `insertOutboxEvent` po upsert w `apps/web/app/actions/settings/org-security-actions.ts`
5. Utwórz `apps/web/app/actions/settings/__tests__/security-actions.test.ts` (unit, mock) + `security-actions.integration.test.ts` (supabaseLocalDb, zero DB mocks)

## Files
**Create:** `apps/web/app/actions/settings/security-actions.ts`
**Create:** `apps/web/app/actions/settings/__tests__/security-actions.test.ts`
**Create:** `apps/web/app/actions/settings/__tests__/security-actions.integration.test.ts`
**Modify:** `apps/web/lib/validators/settings-identity.ts` — dodaj updateOrgSecurityPolicySchema

## Done when
- `vitest apps/web/app/actions/settings/__tests__/security-actions.test.ts` PASS — RBAC reject, Zod reject (min_password_length=5 → error, session_timeout_min=10 → error), success emits audit + outbox
- `vitest apps/web/app/actions/settings/__tests__/security-actions.integration.test.ts` PASS — upsert na pustej tabeli tworzy wiersz, drugi call updatuje; outbox_events row obecny
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm apps/web/app/actions/settings/security-actions.ts` i pliki testów
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/security-actions.test.ts` — covers: RBAC reject, Zod reject (min_password_length=5 → error, session_timeout_min=10 → error), success emits audit + outbox
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/security-actions.integration.test.ts` — covers: upsert na pustej tabeli tworzy wiersz, drugi call updatuje; outbox_events row obecny
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/app/actions/settings/security-actions.ts` i pliki testów
## T-02SETa-006 — RBAC middleware: `withPermission` guard + session resolver

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a RBAC middleware (§3, §5.7)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001 — schema], [T-02SETa-E01 — permissions]
- **Downstream (will consume this):** [T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** `users` and `roles` tables exist with `permissions TEXT[]` on roles; `permissions.enum.ts` has Settings block; Supabase session available via Next.js auth helpers
**WHEN** a Server Action wrapped with `withPermission(Permission.X, handler)` is called
**THEN** if the current user's role `permissions` array contains `Permission.X` → handler executes with `ActionContext { tenantId, userId, orgId }`; otherwise throws `ForbiddenError` with status 403; `setCurrentOrgId(orgId)` helper sets Postgres `SET LOCAL app.current_org_id` for RLS enforcement

### Test gate
- **Unit:** `vitest apps/web/lib/rbac/__tests__/with-permission.test.ts` — permission present → resolves, permission absent → ForbiddenError, unknown role → ForbiddenError, ForbiddenError shape has `.code === 'FORBIDDEN'`
- **Integration:** `vitest apps/web/lib/rbac/__tests__/with-permission.integration.test.ts` — RLS enforced: `setCurrentOrgId(orgA)` → query returns orgA rows only, cannot read orgB rows
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/lib/rbac/with-permission.ts` and test files
### ACP Prompt
````
# Task T-02SETa-006 — RBAC middleware: withPermission guard + session resolver

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → Permission enum, ALL_SETTINGS_PERMISSIONS
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-identity.ts` → tabele users, roles (permissions TEXT[])
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/` → sprawdź czy jest auth helper (getSession / getServerSession)

## Twoje zadanie
Utwórz `apps/web/lib/rbac/with-permission.ts` z:

**1. `ActionContext` type:**
```ts
export type ActionContext = {
  tenantId: string
  userId: string
  orgId: string
  userPermissions: string[]
}
```

**2. `ForbiddenError` class:**
```ts
export class ForbiddenError extends Error {
  code = 'FORBIDDEN' as const
  status = 403
  constructor(permission: string) {
    super(`Missing permission: ${permission}`)
  }
}
```

**3. `withPermission` HOF:**
```ts
export function withPermission<TInput, TOutput>(
  requiredPermission: Permission,
  handler: (input: TInput, ctx: ActionContext) => Promise<TOutput>
) {
  return async (input: TInput): Promise<TOutput> => {
    // 1. Pobierz sesję (getServerSession lub supabase.auth.getSession)
    // 2. Query users + roles JOIN przez userId gdzie tenant_id = session.tenantId
    // 3. Sprawdź czy role.permissions array zawiera requiredPermission string
    // 4. Jeśli nie → throw new ForbiddenError(requiredPermission)
    // 5. await setCurrentOrgId(user.orgId)
    // 6. return handler(input, { tenantId, userId, orgId, userPermissions: role.permissions })
  }
}
```

**4. `setCurrentOrgId` helper:**
```ts
export async function setCurrentOrgId(orgId: string): Promise<void> {
  await db.execute(sql`SET LOCAL app.current_org_id = ${orgId}`)
}
```

## Implementacja
1. Utwórz `apps/web/lib/rbac/with-permission.ts` z `ActionContext`, `ForbiddenError`, `withPermission`, `setCurrentOrgId`
2. `withPermission` w `apps/web/lib/rbac/require-permission.ts`: pobierz sesję → query `users JOIN roles ON users.role_id = roles.id` → sprawdź `role.permissions.includes(requiredPermission)` → throw lub execute handler
3. `setCurrentOrgId` w `apps/web/lib/rbac/with-permission.ts`: Drizzle `db.execute(sql\`SET LOCAL app.current_org_id = ${orgId}\`)`
4. Zaktualizuj `apps/web/lib/rbac/index.ts` — dodaj re-export `export * from './with-permission'`
5. Utwórz `apps/web/lib/rbac/__tests__/with-permission.test.ts` (unit, mock Drizzle + session) + `with-permission.integration.test.ts` (supabaseLocalDb fixture — `createClient({ userId: testUser.id })`)

## Files
**Create:** `apps/web/lib/rbac/with-permission.ts`
**Create:** `apps/web/lib/rbac/__tests__/with-permission.test.ts`
**Create:** `apps/web/lib/rbac/__tests__/with-permission.integration.test.ts`
**Modify:** `apps/web/lib/rbac/index.ts` — dodaj re-export

## Done when
- `vitest apps/web/lib/rbac/__tests__/with-permission.test.ts` PASS — permission present → resolves, absent → ForbiddenError(.code === 'FORBIDDEN'), unknown role → ForbiddenError
- `vitest apps/web/lib/rbac/__tests__/with-permission.integration.test.ts` PASS — RLS: user w org A nie widzi danych org B po setCurrentOrgId(orgA)
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`git rm apps/web/lib/rbac/with-permission.ts` i pliki testów
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/rbac/__tests__/with-permission.test.ts` — covers: permission present → resolves, absent → ForbiddenError(.code === 'FORBIDDEN'), unknown role → ForbiddenError
- **Integration:** `vitest apps/web/lib/rbac/__tests__/with-permission.integration.test.ts` — covers: RLS: user w org A nie widzi danych org B po setCurrentOrgId(orgA)
- **CI gate:** `pnpm test:unit` green

### Rollback
`git rm apps/web/lib/rbac/with-permission.ts` i pliki testów
## T-02SETa-007 — UI: OrgsList + OrgForm modal (create/edit)

**Type:** T3-ui
**Prototype ref:** `company_profile_screen` — `design/Monopilot Design System/settings/org-screens.jsx`
  - component_type: form
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Form, Input, Select, Button, Avatar, Card, Separator
  - estimated_translation_time_min: 90
**Context budget:** ~65k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Organizations CRUD
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-002 — Server Actions: createOrg, updateOrg, deleteOrg]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring]
- **Parallel (can run concurrently):** [T-02SETa-008, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `createOrg`, `updateOrg`, `deleteOrg` server actions exist in `apps/web/app/actions/settings/orgs.ts`; i18n scaffold complete; shadcn components installed
**WHEN** admin navigates to `/settings/organizations`
**THEN** `<OrgsList />` renders org rows (name, slug, status badge, logo avatar, edit/delete actions); "Add Organization" button opens `<OrgForm />` Radix Dialog; form validates via Zod `CreateOrgSchema` (slug regex `^[a-z0-9-]+$` min 3 max 50, name min 1 max 100, logoUrl optional URL); submit calls `createOrg` / `updateOrg` Server Action; `<Skeleton />` shown during loading; `<Alert variant="destructive">` shown on error; success closes modal and calls `revalidatePath`

### ACP Prompt
````
# Task T-02SETa-007 — UI: OrgsList + OrgForm modal (create/edit)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/orgs.ts` → Server Actions createOrg, updateOrg, deleteOrg (sygnatury do użycia)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → definicja tabeli orgs (kolumny, typy)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/messages/en/02-settings.json` → istniejące klucze i18n (dodaj do namespace orgs.*)

## Prototype reference
Plik: `design/Monopilot Design System/settings/org-screens.jsx` linie 4-100
Translation checklist:
- [ ] Replace window.Modal → @radix-ui/react-dialog Dialog
- [ ] Convert useState form → useForm + zodResolver(CreateOrgSchema)
- [ ] Wire Server Actions createOrg / updateOrg
- [ ] Replace hardcoded labels → next-intl keys (t('settings.orgs.*'))
- [ ] Logo upload placeholder → shadcn Avatar; S3/Blob upload deferred

## Twoje zadanie
GIVEN: createOrg, updateOrg, deleteOrg Server Actions są zaimplementowane; shadcn/ui jest zainstalowany w projekcie.
WHEN: admin wchodzi na /settings/organizations.
THEN: strona renderuje tabelę organizacji z kolumnami name, slug, status badge (active/inactive), logo Avatar, actions (Edit/Delete). Przycisk "Add Organization" otwiera Dialog z formularzem. Formularz waliduje pola przez Zod CreateOrgSchema. Submit wywołuje Server Action. Loading state: Skeleton rows. Error: Alert destructive pod przyciskiem submit. Sukces: zamknij modal + revalidatePath.

Zod schema (embed exact):
```ts
const CreateOrgSchema = z.object({
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/, 'Only lowercase letters, digits, hyphens'),
  name: z.string().min(1).max(100),
  logoUrl: z.string().url().optional(),
})
```

## Implementacja
1. Utwórz `apps/web/app/(app)/settings/organizations/page.tsx` — Server Component; pobiera listę org przez Drizzle query; renderuje `<OrgsList organizations={orgs} />`
2. Utwórz `apps/web/components/settings/identity/OrgsList.tsx` — Client Component; shadcn Table z kolumnami: Avatar+name, slug, Badge(status), Actions dropdown (Edit/Delete); prop `organizations: Org[]`; "Add Organization" Button otwiera OrgForm Dialog state via useState<boolean>
3. Utwórz `apps/web/components/settings/identity/OrgForm.tsx` — Client Component; Dialog + Form (shadcn); pola: name (Input), slug (Input, auto-generated via `watch('name').toLowerCase().replace(/\s+/g, '-')`), logoUrl (Input type=url optional); zodResolver(CreateOrgSchema); onSubmit: wywołaj createOrg lub updateOrg (zależnie od prop `org?: Org`); loading: Button disabled + spinner; error: Alert variant="destructive"; sukces: onSuccess() callback
4. Dodaj loading state w `apps/web/components/settings/identity/OrgsList.tsx`: renderuj 5 wierszy `<Skeleton className="h-10 w-full" />` gdy lista organizacji jest jeszcze ładowana lub gdy komponent pokazuje placeholder state
5. Dodaj klucze i18n do `apps/web/messages/en/02-settings.json` pod kluczem `orgs`: title, addButton, columns (name, slug, status, actions), form (fields, errors, submit), deleteConfirm

Shadcn imports (exact):
```tsx
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
```

## Files
**Create:** `apps/web/app/(app)/settings/organizations/page.tsx`, `apps/web/components/settings/identity/OrgsList.tsx`, `apps/web/components/settings/identity/OrgForm.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj orgs.* klucze; `apps/web/messages/pl/02-settings.json` — placeholder PL

## Done when
- `vitest apps/web/components/settings/identity/OrgForm.test.tsx` PASS — sprawdza: slug regex rejects 'My Org!' (invalid), valid schema passes, form submit calls createOrg mock
- `playwright apps/web/e2e/settings/orgs.spec.ts` PASS — sprawdza: owner otwiera form, wypełnia name+slug, submit, org pojawia się w tabeli
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/app/(app)/settings/organizations/ apps/web/components/settings/identity/Org*.tsx`; revert messages files.
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/identity/OrgForm.test.tsx` — covers: Zod validation reject (invalid slug), form submit calls server action mock
- **E2E:** `playwright apps/web/e2e/settings/orgs.spec.ts` — covers: owner opens form, fills name+slug, submits, org visible in list
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/app/(app)/settings/organizations/ apps/web/components/settings/identity/Org*.tsx`; revert message files.
## T-02SETa-008 — UI: UsersList + UserInviteModal + UserEditModal

**Type:** T3-ui
**Prototype ref:** `users_screen` — `design/Monopilot Design System/settings/access-screens.jsx`
  - component_type: page-layout
  - ui_pattern: list-with-actions
  - shadcn_equivalent: Table, Tabs, ToggleGroup, Input, Select, Badge, Avatar, Card, Button
  - estimated_translation_time_min: 150
**Context budget:** ~70k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Users CRUD
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-003 — Server Actions: inviteUser, updateUser, deactivateUser]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `inviteUser`, `updateUser`, `deactivateUser` server actions exist; roles table seeded with system roles
**WHEN** admin navigates to `/settings/users`
**THEN** `<UsersList />` renders user rows with Avatar, displayName, email, role badge (color by role), active/inactive Badge, last login, Actions dropdown (Edit/Deactivate); "Invite User" opens `<UserInviteModal />` (email Input, roleId Select, displayName optional); editing a row opens `<UserEditModal />` prefilled; deactivating shows AlertDialog confirm → calls `deactivateUser`; all forms use RHF + Zod resolver; loading via Skeleton; error via Alert; next-intl keys applied

### ACP Prompt
````
# Task T-02SETa-008 — UI: UsersList + UserInviteModal + UserEditModal

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/users.ts` → Server Actions inviteUser, updateUser, deactivateUser (sygnatury)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → tabela users + roles (kolumny, enum status)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/messages/en/02-settings.json` → istniejące i18n klucze

## Prototype reference
Plik: `design/Monopilot Design System/settings/access-screens.jsx` linie 4-151 (users_screen) + `settings/modals.jsx` linie 378-407 (user_invite_modal) + linie 410-447 (role_assign_modal)
Translation checklist:
- [ ] Replace window.Modal → @radix-ui/react-dialog Dialog
- [ ] Convert useState form → useForm + zodResolver(InviteUserSchema)
- [ ] Wire Server Actions inviteUser / updateUser / deactivateUser
- [ ] Replace window.SETTINGS_USERS → Drizzle query Server Component
- [ ] Replace hardcoded labels → next-intl keys (t('settings.users.*'))
- [ ] Pills filter (role tabs) → shadcn Tabs or ToggleGroup with URL searchParam

## Twoje zadanie
GIVEN: inviteUser, updateUser, deactivateUser Server Actions są zaimplementowane; tabela roles zawiera system roles.
WHEN: admin wchodzi na /settings/users.
THEN: strona renderuje tabelę użytkowników z Avatar, displayName, email, role Badge (kolorowany per rola), status Badge (active/invited/inactive), last_login, Actions dropdown. "Invite User" Button otwiera UserInviteModal. Edit otwiera UserEditModal prefillowany danymi. Deactivate otwiera AlertDialog confirmation. Loading: Skeleton rows. Error: Alert destructive.

Zod schemas (embed exact):
```ts
const InviteUserSchema = z.object({
  email: z.string().email(),
  roleId: z.string().uuid(),
  displayName: z.string().optional(),
})

const EditUserSchema = z.object({
  displayName: z.string().min(1).max(100),
  roleId: z.string().uuid(),
  language: z.enum(['en', 'pl']),
})
```

## Implementacja
1. Utwórz `apps/web/app/(app)/settings/users/page.tsx` — Server Component; Drizzle query na users JOIN roles WHERE tenant_id = currentTenantId; renderuje `<UsersList users={users} roles={roles} />`
2. Utwórz `apps/web/components/settings/identity/UsersList.tsx` — Client Component; shadcn Table: Avatar+displayName, email, role Badge (role.name), status Badge (active=green/invited=yellow/inactive=gray), last_login (formated via date-fns), Actions DropdownMenu (Edit/Deactivate); "Invite User" Button; filtry ról via shadcn Tabs (URL searchParam ?role=)
3. Utwórz `apps/web/components/settings/identity/UserInviteModal.tsx` — Dialog; pola: email (Input type=email), roleId (Select z opcjami z prop roles), displayName (Input optional); zodResolver(InviteUserSchema); onSubmit: wywołaj inviteUser; loading/error handling
4. Utwórz `apps/web/components/settings/identity/UserEditModal.tsx` — Dialog; defaultValues z prop user; pola: displayName (Input), roleId (Select), language (Select en/pl); zodResolver(EditUserSchema); onSubmit: wywołaj updateUser; Deactivate button → AlertDialog confirm → deactivateUser
5. Dodaj klucze i18n do `apps/web/messages/en/02-settings.json` pod kluczem `users`: title, inviteButton, columns (name, email, role, status, lastLogin, actions), form (invite/edit fields/errors/submit), deactivateConfirm

Shadcn imports (exact):
```tsx
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
```

## Files
**Create:** `apps/web/app/(app)/settings/users/page.tsx`, `apps/web/components/settings/identity/UsersList.tsx`, `apps/web/components/settings/identity/UserInviteModal.tsx`, `apps/web/components/settings/identity/UserEditModal.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj users.* klucze; `apps/web/messages/pl/02-settings.json` — placeholder PL

## Done when
- `vitest apps/web/components/settings/identity/UserInviteModal.test.tsx` PASS — sprawdza: invalid email rejected, roleId required (empty string fails uuid()), valid schema passes
- `playwright apps/web/e2e/settings/users.spec.ts` PASS — sprawdza: admin invites user → user pojawia się w tabeli ze statusem 'invited'
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/app/(app)/settings/users/ apps/web/components/settings/identity/User*.tsx`; revert messages files.
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/identity/UserInviteModal.test.tsx` — covers: invalid email rejected, role required
- **E2E:** `playwright apps/web/e2e/settings/users.spec.ts` — covers: admin invites user → appears in list with invited badge
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/app/(app)/settings/users/ apps/web/components/settings/identity/User*.tsx`; revert message files.
## T-02SETa-009 — UI: RolesList + RoleForm modal (RBAC permission matrix editor)

**Type:** T3-ui
**Prototype ref:** `role_assign_modal` — `design/Monopilot Design System/settings/modals.jsx`
  - component_type: modal
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Dialog, Command, Input, Select, Button, Badge, Alert, Avatar
  - estimated_translation_time_min: 60
**Context budget:** ~70k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a 10 Roles + RBAC UI
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-004 — Server Actions: createRole, updateRole; ALL_PERMISSIONS enum]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008]

### GIVEN / WHEN / THEN
**GIVEN** `createRole`, `updateRole` server actions exist; `ALL_PERMISSIONS` enum exported from `lib/rbac/permissions.enum.ts`
**WHEN** owner navigates to `/settings/roles`
**THEN** `<RolesList />` renders 10 system roles (lock Badge for `is_system=true`) plus custom roles; clicking a system role opens read-only detail Dialog with "System roles are immutable" Alert; clicking custom role opens `<RoleForm />` with permission checkboxes grouped by module prefix (settings.*, npd.*, warehouse.*, etc.); system role inputs are disabled; form validates `permissions` must be non-empty array; submit calls `createRole` / `updateRole`; next-intl keys applied

### ACP Prompt
````
# Task T-02SETa-009 — UI: RolesList + RoleForm modal (RBAC permission matrix editor)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/roles.ts` → Server Actions createRole, updateRole (sygnatury)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/lib/rbac/permissions.enum.ts` → ALL_PERMISSIONS array + Permission enum (wszystkie strings do grupowania)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → tabela roles, role_permissions (kolumny is_system, permissions JSONB)

## Prototype reference
Plik: `design/Monopilot Design System/settings/modals.jsx` linie 410-447 (role_assign_modal)
Translation checklist:
- [ ] Replace window.Modal → @radix-ui/react-dialog Dialog with size='wide'
- [ ] Convert local user search → shadcn Command (cmdk) for async user lookup (not needed for RoleForm; use Checkbox matrix)
- [ ] Convert useState form → useForm + zodResolver(RoleSchema)
- [ ] Wire Server Actions createRole / updateRole
- [ ] Replace hardcoded labels → next-intl keys (t('settings.roles.*'))

## Twoje zadanie
GIVEN: createRole, updateRole Server Actions są zaimplementowane; ALL_PERMISSIONS = string[] exported from lib/rbac/permissions.enum.ts.
WHEN: owner wchodzi na /settings/roles.
THEN: tabela ról z kolumnami: name, code, is_system Badge (lock icon + "System"), permission count, Actions. System roles: readonly detail Dialog. Custom roles: RoleForm Dialog z macierzą checkboxów. Grupowanie permissionów: prefix przed pierwszą kropką (settings, npd, warehouse, production, finance, qa, oee, maintenance, scanning, reporting). permissions muszą być non-empty. Submit tworzy/aktualizuje rolę.

Zod schema (embed exact):
```ts
const RoleSchema = z.object({
  name: z.string().min(1).max(50),
  code: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
  permissions: z.array(z.string()).min(1, 'At least one permission required'),
})
```

Permission groups to render as checkbox sections (wygeneruj dynamicznie z ALL_PERMISSIONS):
- ORGS: settings.orgs.view, settings.orgs.create, settings.orgs.update, settings.orgs.delete
- USERS: settings.users.view, settings.users.create, settings.users.update, settings.users.deactivate
- ROLES: settings.roles.view, settings.roles.create, settings.roles.update, settings.roles.delete
- SECURITY: settings.security.view, settings.security.update
- REFERENCE: settings.reference.view, settings.reference.create, settings.reference.update, settings.reference.delete
- MODULES: settings.modules.view, settings.modules.toggle
- NPD: npd.items.view, npd.items.create, npd.items.update, npd.items.approve
- WAREHOUSE: warehouse.stock.view, warehouse.stock.create, warehouse.transfers.create, warehouse.adjustments.create

## Implementacja
1. Utwórz `apps/web/app/(app)/settings/roles/page.tsx` — Server Component; Drizzle query na roles WHERE tenant_id = currentTenantId ORDER BY is_system DESC, name ASC; renderuje `<RolesList roles={roles} />`
2. Utwórz `apps/web/components/settings/identity/RolesList.tsx` — Client Component; shadcn Table: name, code, is_system Badge (lock + "System" / "Custom"), permission_count, Actions (Edit dla custom / View dla system); "Add Role" Button; open state via useState<{open: boolean, role: Role | null}>
3. Utwórz `apps/web/components/settings/identity/RoleForm.tsx` — Dialog (size wide via className="max-w-3xl"); pola: name (Input), code (Input, auto z name), ScrollArea z sekcjami checkbox per group; dla is_system=true: wszystkie inputy disabled + Alert "System roles are immutable"; zodResolver(RoleSchema); permissions: wartości z checkboxów (controlled array via useForm setValue)
4. Dodaj helper `groupPermissions(permissions: string[]): Record<string, string[]>` do `apps/web/components/settings/identity/RoleForm.tsx` — grupuje `ALL_PERMISSIONS` po prefixie (split('.')[0].toUpperCase()); renderuj jako `<Accordion>` lub sekcje Card per group
5. Dodaj klucze i18n do `apps/web/messages/en/02-settings.json` pod kluczem `roles`: title, addButton, columns, form (fields, errors, submit), systemRoleImmutableAlert, permissionGroups.*

Shadcn imports (exact):
```tsx
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
```

## Files
**Create:** `apps/web/app/(app)/settings/roles/page.tsx`, `apps/web/components/settings/identity/RolesList.tsx`, `apps/web/components/settings/identity/RoleForm.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj roles.* klucze; `apps/web/messages/pl/02-settings.json` — placeholder PL

## Done when
- `vitest apps/web/components/settings/identity/RoleForm.test.tsx` PASS — sprawdza: system role renders disabled inputs + immutable Alert, empty permissions array fails validation, valid custom role passes
- `playwright apps/web/e2e/settings/roles.spec.ts` PASS — sprawdza: owner creates custom role z 2 permissions → rola pojawia się w tabeli
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/app/(app)/settings/roles/ apps/web/components/settings/identity/Role*.tsx`; revert messages files.
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/identity/RoleForm.test.tsx` — covers: system role shows disabled inputs, empty permissions rejected
- **E2E:** `playwright apps/web/e2e/settings/roles.spec.ts` — covers: owner creates custom role with 2 permissions → appears in list
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/app/(app)/settings/roles/ apps/web/components/settings/identity/Role*.tsx`; revert message files.
## T-02SETa-010 — UI: OrgSecurityPolicyForm (password / session / MFA settings)

**Type:** T3-ui
**Prototype ref:** `security_screen` — `design/Monopilot Design System/settings/access-screens.jsx`
  - component_type: form
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Switch, Checkbox, Select, Input, Table, Button, Badge, Card
  - estimated_translation_time_min: 120
**Context budget:** ~55k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a Org security baseline
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-005 — Server Action: updateOrgSecurityPolicy]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008, T-02SETa-009]

### GIVEN / WHEN / THEN
**GIVEN** `updateOrgSecurityPolicy` server action exists; `org_security_policies` table migrated with columns: `min_password_length INT`, `require_mfa BOOLEAN`, `session_timeout_min INT`, `sso_enabled BOOLEAN`, `allowed_domains TEXT[]`
**WHEN** owner navigates to `/settings/security`
**THEN** page renders `<OrgSecurityPolicyForm />` pre-loaded with current policy; fields: minPasswordLength Input (min 8 max 128), requireMfa Switch, sessionTimeoutMin Input (min 15 max 10080), ssoEnabled Switch, allowedDomains dynamic tag input; RHF + Zod enforces ranges; submit shows success toast via `sonner`; invalid ranges show inline error via shadcn FormMessage; next-intl keys applied

### ACP Prompt
````
# Task T-02SETa-010 — UI: OrgSecurityPolicyForm (password / session / MFA settings)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/security.ts` → Server Action updateOrgSecurityPolicy (sygnatura + return type)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → tabela org_security_policies (kolumny i typy do użycia w Server Component query)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/messages/en/02-settings.json` → istniejące klucze i18n

## Prototype reference
Plik: `design/Monopilot Design System/settings/access-screens.jsx` linie 154-239 (security_screen)
Translation checklist:
- [ ] Section + SRow primitives → shadcn Card sections with FormDescription hints
- [ ] Toggle (2FA, SSO) → shadcn Switch; each triggers updateOrgSecurityPolicy Server Action
- [ ] Checkbox group for 2FA methods → shadcn Checkbox with useForm array field
- [ ] Password policy selects + number inputs → useForm + zodResolver(SecurityPolicySchema)
- [ ] Replace hardcoded labels → next-intl keys (t('settings.security.*'))

## Twoje zadanie
GIVEN: updateOrgSecurityPolicy Server Action jest zaimplementowany; org_security_policies tabela istnieje.
WHEN: owner wchodzi na /settings/security.
THEN: strona renderuje OrgSecurityPolicyForm z aktualną polityką załadowaną server-side. Pola: minPasswordLength (Input type=number min=8 max=128), requireMfa (Switch), sessionTimeoutMin (Input type=number min=15 max=10080), ssoEnabled (Switch), allowedDomains (dynamiczny tag input). RHF + Zod. Submit → success toast via sonner; błędy → FormMessage inline. Tylko właściciel/admin ma dostęp (renderuj disabled z tooltipem dla innych ról).

Zod schema (embed exact):
```ts
const SecurityPolicySchema = z.object({
  minPasswordLength: z.number().int().min(8).max(128),
  requireMfa: z.boolean(),
  sessionTimeoutMin: z.number().int().min(15).max(10080),
  ssoEnabled: z.boolean(),
  allowedDomains: z.array(z.string()).default([]),
})
```

## Implementacja
1. Utwórz `apps/web/app/(app)/settings/security/page.tsx` — Server Component; Drizzle query na org_security_policies WHERE tenant_id = currentTenantId; jeśli brak wiersza → defaults ({minPasswordLength:8, requireMfa:false, sessionTimeoutMin:480, ssoEnabled:false, allowedDomains:[]}); renderuje `<OrgSecurityPolicyForm policy={policy} />`
2. Utwórz `apps/web/components/settings/security/OrgSecurityPolicyForm.tsx` — Client Component; shadcn Card layout (3 sekcje: Password Policy, Session & MFA, SSO & Domains); useForm<SecurityPolicySchema>({ resolver: zodResolver(SecurityPolicySchema), defaultValues: props.policy }); każda sekcja jako Card z CardHeader + CardContent
3. W `apps/web/components/settings/security/OrgSecurityPolicyForm.tsx` dodaj sekcję Password Policy: minPasswordLength (FormField + Input type=number), description hint (FormDescription) "8-128 characters"
4. W `apps/web/components/settings/security/OrgSecurityPolicyForm.tsx` dodaj sekcję Session & MFA: requireMfa (FormField + Switch), sessionTimeoutMin (FormField + Input type=number), description hints
5. W `apps/web/components/settings/security/OrgSecurityPolicyForm.tsx` dodaj sekcję SSO & Domains: ssoEnabled (Switch), allowedDomains — simple tag-input: Input + Button "Add Domain" appending to array field via setValue; existing domains rendered jako Badge z X button; onSubmit: wywołaj `updateOrgSecurityPolicy`; `toast.success()` z `sonner`; error → Alert destructive; dodaj klucze i18n pod `security.*` do `apps/web/messages/en/02-settings.json` i `apps/web/messages/pl/02-settings.json`

Shadcn imports (exact):
```tsx
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
```

## Files
**Create:** `apps/web/app/(app)/settings/security/page.tsx`, `apps/web/components/settings/security/OrgSecurityPolicyForm.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj security.* klucze; `apps/web/messages/pl/02-settings.json` — placeholder PL

## Done when
- `vitest apps/web/components/settings/security/OrgSecurityPolicyForm.test.tsx` PASS — sprawdza: minPasswordLength=5 rejected (min 8), sessionTimeoutMin=10 rejected (min 15), requireMfa accepts boolean, valid schema passes
- `playwright apps/web/e2e/settings/security.spec.ts` PASS — sprawdza: owner saves security policy z requireMfa=true → success toast pojawia się
- `pnpm test:smoke` green

## Rollback
`rm apps/web/app/(app)/settings/security/page.tsx apps/web/components/settings/security/OrgSecurityPolicyForm.tsx`; revert messages files.
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/security/OrgSecurityPolicyForm.test.tsx` — covers: out-of-range values rejected, requireMfa boolean enforced
- **E2E:** `playwright apps/web/e2e/settings/security.spec.ts` — covers: owner saves security policy → success toast appears
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/app/(app)/settings/security/page.tsx apps/web/components/settings/security/OrgSecurityPolicyForm.tsx`; revert message files.
## T-02SETa-026 — E2E + Integration: Identity track wiring

**Type:** T4-wiring+test
**Context budget:** ~80k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a Identity full flow
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010 — all Identity UI tasks]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETa-027 — Seed]

### GIVEN / WHEN / THEN
**GIVEN** Orgs/Users/Roles/Security UI + server actions all implemented and pages accessible at `/settings/organizations`, `/settings/users`, `/settings/roles`, `/settings/security`
**WHEN** Playwright E2E suite runs full admin flow on local Supabase; integration tests run against `supabaseLocalDb` fixture (no DB mocks)
**THEN** owner creates org → invites user → creates custom role → assigns role to user → user logs in → RLS enforces org scope (user from org A cannot read org B rows) → org security policy updated → `audit_log` contains rows for each mutation → `outbox_events` table contains `org.created`, `user.invited`, `role.assigned` events

### ACP Prompt
````
# Task T-02SETa-026 — E2E + Integration: Identity track wiring

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/orgs.ts` → createOrg, updateOrg signatures
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/users.ts` → inviteUser, updateUser, deactivateUser signatures
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/roles.ts` → createRole, updateRole signatures
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/security.ts` → updateOrgSecurityPolicy signature
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → tabele orgs, users, roles, role_permissions, org_security_policies, audit_log, outbox_events
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/seed/settings-identity-seed.ts` → factory functions createOrg, createUser (po T-02SETa-027)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/tests/helpers/supabase-fixture.ts` → supabaseLocalDb fixture (zero DB mocks); createClient({ userId }) dla RLS tests

## Twoje zadanie
GIVEN: Wszystkie Identity UI + Server Actions są zaimplementowane. Seed factories dostępne (T-02SETa-027 upstream).
Napisz integration tests (vitest + supabaseLocalDb fixture, zero DB mocks) i E2E tests (Playwright).

Integration tests — `apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts`:
1. createOrg → weryfikuj wiersz w tabeli orgs; audit_log zawiera action='org.created'; outbox_events zawiera EventType.ORG_CREATED
2. inviteUser → weryfikuj wiersz w users ze status='invited'; outbox_events zawiera EventType.USER_INVITED z payload.email
3. assignRole → weryfikuj role_permissions updated; outbox_events zawiera EventType.ROLE_ASSIGNED
4. updateSecurityPolicy → weryfikuj wiersz w org_security_policies; audit_log zawiera action='security_policy.updated'
5. Cross-tenant isolation: createClient({ userId: userOrgA.id }) → SELECT * FROM orgs → 0 rows dla orgB (RLS enforcement)

E2E tests — `apps/web/e2e/settings/identity.spec.ts`:
Full flow: login jako admin (seed user) → /settings/organizations → create org → /settings/users → invite user (z email) → /settings/roles → create custom role z 2 permissions → assign role to invited user → /settings/security → save security policy → verify all items visible in respective lists

## Implementacja
1. Utwórz `apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts`:
   - import { supabaseLocalDb } from `tests/helpers/supabase-fixture`
   - Każdy test: before createOrg/user via seed factories; after cleanup via db.delete
   - assert audit_log: `db.select().from(auditLog).where(eq(auditLog.action, 'org.created'))` → length >= 1
   - assert outbox: `db.select().from(outboxEvents).where(eq(outboxEvents.eventType, 'org.created'))` → length >= 1
   - RLS test: `const clientA = createClient({ userId: userA.id })`; `const { data } = await clientA.from('orgs').select()`; expect(data).toHaveLength(1) (only own org)
2. Utwórz `apps/web/e2e/settings/identity.spec.ts`:
   - `test.beforeAll`: seed test DB z settings-identity-baseline snapshot (supabase db reset --db-url=$LOCAL_DB_URL)
   - test('admin full identity flow', async ({ page }) => { /* pełny flow */ })
   - Użyj `page.getByRole('button', { name: 'Add Organization' })` + `page.getByLabel('Name')` etc. (accessibility selectors)
   - Każdy krok: `await expect(page.getByText('orgName')).toBeVisible()` po submit
3. Upewnij się w `apps/web/playwright.config.ts` i `apps/web/vitest.config.ts` że `pnpm test:smoke` uruchamia `apps/web/e2e/settings/identity.spec.ts` oraz `apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts`; dodaj include/testMatch jeśli brakuje

## Files
**Create:** `apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts`, `apps/web/e2e/settings/identity.spec.ts`
**Modify:** `playwright.config.ts` — dodaj `e2e/settings/identity.spec.ts` do test match jeśli glob nie pokrywa; `vitest.config.ts` — upewnij się że `__tests__/**/*.integration.test.ts` jest w include

## Done when
- `vitest apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts` PASS — sprawdza: createOrg → audit_log row, inviteUser → outbox event, cross-tenant RLS 0 rows
- `playwright apps/web/e2e/settings/identity.spec.ts` PASS — sprawdza: pełny admin onboard flow end-to-end
- `pnpm test:smoke` green

## Rollback
`rm apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts apps/web/e2e/settings/identity.spec.ts` — no schema/code changes.
````

### Test gate (planning summary)
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts` — covers: DB mutations, audit_log rows, outbox events, RLS cross-tenant isolation
- **E2E:** `playwright apps/web/e2e/settings/identity.spec.ts` — covers: full owner onboard flow
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/app/actions/settings/__tests__/identity-wiring.integration.test.ts apps/web/e2e/settings/identity.spec.ts` — no schema/code changes.
## T-02SETa-027 — Seed: 10 system roles + org factory + user factory

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 30 min
**Parent feature:** 02-SET-a Identity seed
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-001 — Schema: organizations + users + roles tables migrated]
- **Downstream (will consume this):** [T-02SETa-026 — E2E + Integration wiring; all T4 tasks in E-1]
- **Parallel (can run concurrently):** [T-02SETa-E01, T-02SETa-E02]

### GIVEN / WHEN / THEN
**GIVEN** identity schema migrated (tables: orgs, users, roles, role_permissions, org_security_policies all exist)
**WHEN** `pnpm seed:settings-identity` runs against local Supabase
**THEN** 10 system roles inserted with `is_system=true` and permissions JSONB; `createOrg(overrides?)` factory creates a test org with `org_security_policies` default row; `createUser(orgId, roleCode, overrides?)` factory creates test user with role assigned; named snapshot `settings-identity-baseline` available via `supabase db dump` for E2E DB reset; re-runs are idempotent (upsert by code)

### ACP Prompt
````
# Task T-02SETa-027 — Seed: 10 system roles + org factory + user factory

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/drizzle/schema/settings-identity.ts` → typy NewRole, NewOrg, NewUser, Role, Org, User (Drizzle inferred types)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/lib/rbac/permissions.enum.ts` → Permission enum strings (użyj do SYSTEM_ROLES permissions arrays)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/seed/index.ts` → istniejący seed entrypoint (dodaj import i wywołanie)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/package.json` → istniejące npm scripts (dodaj seed:settings-identity)

## Twoje zadanie
GIVEN: Tabele orgs, users, roles, role_permissions, org_security_policies są zmigratowane.
Napisz seed file + factory functions. Seed musi być idempotentny (upsert by code/slug). Factory functions muszą być typed (Drizzle inferred types).

SYSTEM_ROLES (embed exact):
```ts
export const SYSTEM_ROLES = [
  { name: 'Owner', code: 'owner', permissions: ['settings:*', 'npd:*', 'warehouse:*', 'production:*', 'finance:*', 'qa:*', 'oee:*', 'maintenance:*', 'scanning:*', 'reporting:*'] },
  { name: 'Admin', code: 'admin', permissions: ['settings.orgs:*', 'settings.users:*', 'settings.roles:*', 'settings.security:*', 'settings.reference:*'] },
  { name: 'Member', code: 'member', permissions: ['npd.items:view', 'warehouse.stock:view', 'production:view', 'reporting:view'] },
  { name: 'Viewer', code: 'viewer', permissions: ['npd.items:view', 'warehouse.stock:view', 'reporting:view'] },
  { name: 'Billing', code: 'billing', permissions: ['finance:*', 'reporting.finance:view'] },
  { name: 'DevOps', code: 'devops', permissions: ['settings.modules:*', 'settings.reference:view'] },
  { name: 'HR', code: 'hr', permissions: ['settings.users:*', 'reporting.hr:view'] },
  { name: 'Sales', code: 'sales', permissions: ['npd:*', 'reporting.sales:view'] },
  { name: 'Operations', code: 'ops', permissions: ['warehouse:*', 'production:*', 'scanning:*', 'oee:view', 'maintenance:view'] },
  { name: 'Read-only', code: 'readonly', permissions: ['npd.items:view', 'warehouse.stock:view', 'production:view', 'reporting:view', 'qa:view'] },
]
```

## Implementacja
1. Utwórz `apps/web/seed/settings-identity-seed.ts`:
   - Drizzle typed inserts; import db from `lib/db`; import { roles, orgs, users, orgSecurityPolicies } from `drizzle/schema/settings-identity`
   - seedSystemRoles(): `db.insert(roles).values(SYSTEM_ROLES.map(r => ({ ...r, isSystem: true, tenantId: SYSTEM_TENANT_ID }))).onConflictDoUpdate({ target: roles.code, set: { permissions: sql`excluded.permissions` } })`
   - export async function seedSettingsIdentity(): Promise<void> — wywołuje seedSystemRoles()
2. Utwórz `apps/web/seed/factories/org.factory.ts`:
   ```ts
   export async function createOrg(overrides?: Partial<NewOrg>): Promise<Org> {
     const defaults: NewOrg = { slug: `test-org-${Date.now()}`, name: 'Test Org', tenantId: overrides?.tenantId ?? generateTestTenantId(), schemaVersion: 1 }
     const [org] = await db.insert(orgs).values({ ...defaults, ...overrides }).returning()
     await db.insert(orgSecurityPolicies).values({ orgId: org.id, tenantId: org.tenantId, minPasswordLength: 8, requireMfa: false, sessionTimeoutMin: 480, ssoEnabled: false, allowedDomains: [], schemaVersion: 1 }).onConflictDoNothing()
     return org
   }
   ```
3. Utwórz `apps/web/seed/factories/user.factory.ts`:
   ```ts
   export async function createUser(orgId: string, roleCode: string, overrides?: Partial<NewUser>): Promise<User> {
     const defaults: NewUser = { email: `test-${Date.now()}@example.com`, displayName: 'Test User', orgId, status: 'active', schemaVersion: 1 }
     const [user] = await db.insert(users).values({ ...defaults, ...overrides }).returning()
     const role = await db.select().from(roles).where(eq(roles.code, roleCode)).limit(1)
     if (role[0]) await db.insert(userRoles).values({ userId: user.id, roleId: role[0].id })
     return user
   }
   export async function assignRole(userId: string, roleId: string): Promise<void> {
     await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing()
   }
   ```
4. Zmodyfikuj `apps/web/seed/index.ts` — dodaj `import { seedSettingsIdentity } from './settings-identity-seed'`; wywołaj w main seed function
5. Zmodyfikuj `package.json` — dodaj `"seed:settings-identity": "tsx apps/web/seed/settings-identity-seed.ts"`; po seedzie utwórz snapshot: `supabase db dump --db-url $LOCAL_DB_URL -f .snapshots/settings-identity-baseline.sql`

R13 columns dla wszystkich Drizzle table inserts — każda tabela business ma:
`id UUID DEFAULT gen_random_uuid() PRIMARY KEY`, `tenant_id UUID NOT NULL REFERENCES tenants(id)`, `created_at TIMESTAMPTZ DEFAULT now()`, `created_by_user UUID`, `created_by_device UUID`, `app_version TEXT`, `model_prediction_id UUID`, `epcis_event_id UUID`, `external_id TEXT`, `schema_version INT NOT NULL DEFAULT 1`
Upewnij się że factory functions przekazują `schemaVersion: 1` do każdego insertu.

## Files
**Create:** `apps/web/seed/settings-identity-seed.ts`, `apps/web/seed/factories/org.factory.ts`, `apps/web/seed/factories/user.factory.ts`
**Modify:** `apps/web/seed/index.ts` — dodaj import + wywołanie; `package.json` — dodaj seed:settings-identity script

## Done when
- `vitest apps/web/seed/settings-identity-seed.test.ts` PASS — sprawdza: seedSettingsIdentity() runs without error, 10 roles in DB with is_system=true, createOrg() returns typed Org with id/slug/tenantId, createUser() returns typed User with correct orgId
- `pnpm seed:settings-identity` PASS na fresh local DB (zero pre-existing rows)
- `pnpm test:smoke` green

## Rollback
`supabase db reset --db-url $LOCAL_DB_URL` restores pre-seed state; `rm apps/web/seed/settings-identity-seed.ts apps/web/seed/factories/org.factory.ts apps/web/seed/factories/user.factory.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/seed/settings-identity-seed.test.ts` — covers: seed runs without error, 10 roles inserted, factory returns valid typed rows
- **CI gate:** `pnpm seed:settings-identity` green on fresh DB
- **CI gate:** `pnpm test:smoke` green

### Rollback
`supabase db reset --db-url $LOCAL_DB_URL`; `rm apps/web/seed/settings-identity-seed.ts apps/web/seed/factories/org.factory.ts apps/web/seed/factories/user.factory.ts`
## Dependency table

| ID | Upstream | Parallel |
|---|---|---|
| T-02SETa-007 | [T-02SETa-002] | [T-02SETa-008, T-02SETa-009] |
| T-02SETa-008 | [T-02SETa-003] | [T-02SETa-007, T-02SETa-009] |
| T-02SETa-009 | [T-02SETa-004] | [T-02SETa-007, T-02SETa-008] |
| T-02SETa-010 | [T-02SETa-005] | [T-02SETa-007, T-02SETa-008, T-02SETa-009] |
| T-02SETa-026 | [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010] | [T-02SETa-027] |
| T-02SETa-027 | [T-02SETa-001] | [T-02SETa-026 (can start parallel once schema done)] |

## Parallel dispatch plan

Wave 0 (schema prerequisite — must be done): T-02SETa-001 (schema), T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005 (server actions — all in E-1 alpha Part 1)
Wave 1 (UI — all parallel, each has distinct upstream SA): T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010
Wave 1b (seed — parallel with UI): T-02SETa-027
Wave 2 (after all UI done): T-02SETa-026

## PRD coverage

✅ Organizations CRUD UI → T-02SETa-007
✅ Users CRUD + Invite UI → T-02SETa-008
✅ Roles RBAC matrix editor UI → T-02SETa-009
✅ Security policy form UI → T-02SETa-010
✅ E2E + Integration wiring → T-02SETa-026
✅ System roles seed + factories → T-02SETa-027
⚠️ SSO/SAML configuration — basic ssoEnabled switch only; SAML provider config deferred to E-1-b
⚠️ SCIM provisioning toggle — not in scope for E-1 alpha

## Task count summary

| Type | Count | Tasks |
|---|---|---|
| T3-ui | 4 | 007, 008, 009, 010 |
| T4-wiring+test | 1 | 026 |
| T5-seed | 1 | 027 |
| **Total** | **6** | |

Est total time: ~450 min (007: 90 + 008: 90 + 009: 90 + 010: 60 + 026: 90 + 027: 30)
Context budget: ~375k tokens total


## T-02SETa-011 — Schema: reference_tables + reference_schemas + reference_rows

**Type:** T1-schema
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 02-SET-a Reference Tables (§5.5, §8)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — Supabase + Drizzle + migrations pipeline]
- **Downstream (will consume this):** [T-02SETa-012, T-02SETa-013, T-02SETa-014, T-02SETa-015, T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-001 — Schema: organizations + users + roles]

### GIVEN / WHEN / THEN
**GIVEN** baseline Drizzle migration pipeline applied (T-00b-000 done); `tenants` table exists with `id UUID PRIMARY KEY`
**WHEN** migration `021-settings-reference-tables.sql` is applied via `drizzle-kit generate` + `drizzle-kit migrate`
**THEN** three tables exist: `reference_tables` (registry of table names + metadata), `reference_schemas` (per-table column definitions), `reference_rows` (generic JSONB row storage); all carry R13 columns; `UNIQUE(table_name)` on `reference_tables`; `UNIQUE(table_name, column_name)` on `reference_schemas`; RLS enabled on all three; Zod validators exported from `lib/validators/reference.ts`

### Test gate (planning summary)
- **Unit:** `vitest apps/web/drizzle/schema/settings-reference.test.ts` — covers: Zod schema rejects unknown column_type, validates required fields
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` — covers: migration applies, unique constraints enforced, RLS blocks cross-tenant query
- **E2E:** none for schema task
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm drizzle-kit drop --migration 021-settings-reference-tables`
### ACP Prompt
````
# Task T-02SETa-011 — Schema: reference_tables + reference_schemas + reference_rows

## Context — przeczytaj przed implementacją
- `apps/web/drizzle/schema/` → istniejące pliki schema (sprawdź co już istnieje, szczególnie tenants.ts)
- `apps/web/drizzle/migrations/` → ostatni numer migracji (nowa ma być 021)
- `apps/web/lib/validators/` → istniejące Zod validators (wzorzec do naśladowania)

## Twoje zadanie
Stwórz trzy tabele Drizzle dla systemu generic reference data. Tabele muszą:
- Zawierać R13 columns na każdej tabeli biznesowej
- Mieć RLS enabled
- Eksportować Zod validators

## Implementacja

1. Utwórz `apps/web/drizzle/schema/settings-reference.ts` z definicjami Drizzle:

   **Tabela `reference_tables`** — rejestr dostępnych tabel referencyjnych:
   ```ts
   // R13 columns (na każdej tabeli):
   id: uuid('id').defaultRandom().primaryKey(),
   tenant_id: uuid('tenant_id').notNull().references(() => tenants.id),
   created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
   created_by_user: uuid('created_by_user'),
   created_by_device: uuid('created_by_device'),
   app_version: text('app_version'),
   model_prediction_id: uuid('model_prediction_id'),
   epcis_event_id: uuid('epcis_event_id'),
   external_id: text('external_id'),
   schema_version: integer('schema_version').notNull().default(1),
   // domain columns:
   table_name: text('table_name').unique().notNull(),
   display_name: text('display_name').notNull(),
   description: text('description'),
   is_active: boolean('is_active').notNull().default(true),
   row_count: integer('row_count').notNull().default(0),
   ```

   **Tabela `reference_schemas`** — definicje kolumn per tabela:
   ```ts
   // R13 columns (jak wyżej)
   // domain columns:
   table_name: text('table_name').notNull().references(() => referenceTables.tableName),
   column_name: text('column_name').notNull(),
   column_type: text('column_type').notNull(), // CHECK IN ('text','integer','boolean','date','uuid','jsonb')
   is_required: boolean('is_required').notNull().default(false),
   display_name: text('display_name').notNull(),
   sort_order: integer('sort_order').notNull().default(0),
   // UNIQUE(table_name, column_name)
   ```

   **Tabela `reference_rows`** — generyczne wiersze JSONB:
   ```ts
   // R13 columns (jak wyżej)
   // domain columns:
   table_name: text('table_name').notNull().references(() => referenceTables.tableName),
   row_data: jsonb('row_data').notNull().default('{}'),
   is_active: boolean('is_active').notNull().default(true),
   code: text('code'), // opcjonalny klucz lookup
   ```

2. Uruchom `pnpm drizzle-kit generate` → wygeneruje `apps/web/drizzle/migrations/021-settings-reference-tables.sql`

3. Dopisz do wygenerowanego `apps/web/drizzle/migrations/021-reference-tables.sql` (na końcu pliku):
   ```sql
   ALTER TABLE reference_tables ENABLE ROW LEVEL SECURITY;
   ALTER TABLE reference_schemas ENABLE ROW LEVEL SECURITY;
   ALTER TABLE reference_rows ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "tenant_isolation_reference_tables" ON reference_tables
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
   CREATE POLICY "tenant_isolation_reference_schemas" ON reference_schemas
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
   CREATE POLICY "tenant_isolation_reference_rows" ON reference_rows
     USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
   ```

4. Utwórz `apps/web/lib/validators/reference.ts` z Zod schemas:
   ```ts
   import { z } from 'zod'

   export const columnTypeEnum = z.enum(['text', 'integer', 'boolean', 'date', 'uuid', 'jsonb'])

   export const referenceTableSchema = z.object({
     table_name: z.string().min(1).max(64).regex(/^[a-z_]+$/),
     display_name: z.string().min(1).max(128),
     description: z.string().optional(),
     is_active: z.boolean().default(true),
   })

   export const referenceSchemaDefinitionSchema = z.object({
     table_name: z.string().min(1),
     column_name: z.string().min(1).max(64).regex(/^[a-z_]+$/),
     column_type: columnTypeEnum,
     is_required: z.boolean().default(false),
     display_name: z.string().min(1).max(128),
     sort_order: z.number().int().min(0).default(0),
   })

   export const referenceRowInputSchema = z.object({
     table_name: z.string().min(1),
     row_data: z.record(z.unknown()),
     is_active: z.boolean().default(true),
     code: z.string().optional(),
   })
   ```

5. Dodaj eksporty do `apps/web/drizzle/schema/index.ts`:
   ```ts
   export * from './settings-reference'
   ```

## Files
**Create:** `apps/web/drizzle/schema/settings-reference.ts`, `apps/web/lib/validators/reference.ts`
**Modify:** `apps/web/drizzle/schema/index.ts` — dodaj export
**Generated:** `apps/web/drizzle/migrations/021-settings-reference-tables.sql` (via drizzle-kit)

## Done when
- `pnpm drizzle-kit generate` exits 0, plik `021-settings-reference-tables.sql` istnieje
- `pnpm drizzle-kit migrate` exits 0, tabele obecne w lokalnej Supabase
- `vitest apps/web/lib/validators/reference.test.ts` PASS — sprawdza: columnTypeEnum odrzuca 'float', referenceSchemaDefinitionSchema odrzuca brak column_name
- `pnpm test:smoke` green

## Rollback
`pnpm drizzle-kit drop --migration 021-settings-reference-tables` + usuń `apps/web/drizzle/schema/settings-reference.ts` i `apps/web/lib/validators/reference.ts`
````

### Test gate (planning summary)
- **CI gate:** `pnpm drizzle-kit generate` green
- **CI gate:** `pnpm drizzle-kit migrate` green
- **Unit:** `vitest apps/web/lib/validators/reference.test.ts` — covers: sprawdza: columnTypeEnum odrzuca 'float', referenceSchemaDefinitionSchema odrzuca brak column_name
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm drizzle-kit drop --migration 021-settings-reference-tables` + usuń `apps/web/drizzle/schema/settings-reference.ts` i `apps/web/lib/validators/reference.ts`
## T-02SETa-012 — Seed: 7 reference table schema definitions + Forza data

**Type:** T5-seed
**Context budget:** ~35k tokens
**Est time:** 40 min
**Parent feature:** 02-SET-a Reference Tables seed (§8.1 #1-7)
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-011 — Schema: reference_tables + reference_schemas + reference_rows]
- **Downstream (will consume this):** [T-02SETa-013, T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-015 — MV refresh strategy]

### GIVEN / WHEN / THEN
**GIVEN** tabele `reference_tables`, `reference_schemas`, `reference_rows` istnieją po migracji 021
**WHEN** `pnpm seed:settings-reference` uruchamia `apps/web/seed/settings-reference-seed.ts`
**THEN** w `reference_tables` istnieje 7 wpisów: `units_of_measure`, `currencies`, `countries`, `vat_rates`, `document_types`, `warehouse_zones`, `production_shift_types`; każda tabela ma wiersze schema w `reference_schemas` odpowiadające typom kolumn; `reference_rows` zawiera Forza baseline data dla wszystkich 7 tabel; snapshot nazwany `settings-reference-forza-baseline`

### Test gate (planning summary)
- **Unit:** `vitest apps/web/seed/settings-reference-seed.test.ts` — covers: seed uruchamia się bez błędów, 7 table_names obecnych, row counts zgodne
- **Integration:** brak (seed test na lokalnym DB)
- **E2E:** none
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DELETE FROM reference_rows WHERE table_name IN ('units_of_measure','currencies','countries','vat_rates','document_types','warehouse_zones','production_shift_types'); DELETE FROM reference_schemas WHERE table_name IN (...); DELETE FROM reference_tables WHERE table_name IN (...);`
### ACP Prompt
````
# Task T-02SETa-012 — Seed: 7 reference table schema definitions + Forza data

## Context — przeczytaj przed implementacją
- `apps/web/drizzle/schema/settings-reference.ts` → cały plik (typy tabel: referenceTables, referenceSchemas, referenceRows)
- `apps/web/lib/validators/reference.ts` → Zod schemas (referenceTableSchema, referenceSchemaDefinitionSchema, referenceRowInputSchema)
- `apps/web/seed/index.ts` → wzorzec rejestracji seedów (jak dodać nowy seed do pipeline)

## Twoje zadanie
Stwórz seed który wypełnia 7 tabel referencyjnych wymaganych przez ADR-032 carveout. Seed musi działać jako Drizzle typed insert (nie raw SQL). Po insercie zarejestruj snapshot `settings-reference-forza-baseline`.

## Implementacja

1. Utwórz `apps/web/seed/settings-reference-seed.ts`:
   ```ts
   import { db } from '../drizzle/client'
   import { referenceTables, referenceSchemas, referenceRows } from '../drizzle/schema/settings-reference'
   
   // Factory helper
   export const createReferenceTable = (overrides?: Partial<typeof referenceTables.$inferInsert>) =>
     db.insert(referenceTables).values({ ...defaults, ...overrides })
   ```

   Zdefiniuj i wstaw 7 tabel do `reference_tables`:
   - `units_of_measure` — display_name: 'Units of Measure'
   - `currencies` — display_name: 'Currencies'
   - `countries` — display_name: 'Countries'
   - `vat_rates` — display_name: 'VAT Rates'
   - `document_types` — display_name: 'Document Types'
   - `warehouse_zones` — display_name: 'Warehouse Zones'
   - `production_shift_types` — display_name: 'Production Shift Types'

2. Wstaw `reference_schemas` (definicje kolumn) dla każdej tabeli w `apps/web/seed/settings-reference-seed.ts`:
   - `units_of_measure`: `code TEXT is_required=true`, `label TEXT is_required=true`, `symbol TEXT`
   - `currencies`: `code TEXT is_required=true` (ISO 4217), `name TEXT is_required=true`, `symbol TEXT`
   - `countries`: `code TEXT is_required=true` (ISO 3166-1 alpha-2), `name TEXT is_required=true`
   - `vat_rates`: `code TEXT is_required=true`, `rate_pct INTEGER is_required=true`, `label TEXT`
   - `document_types`: `code TEXT is_required=true`, `label TEXT is_required=true`, `requires_signature BOOLEAN`
   - `warehouse_zones`: `code TEXT is_required=true`, `label TEXT is_required=true`, `zone_type TEXT`
   - `production_shift_types`: `code TEXT is_required=true`, `label TEXT is_required=true`, `start_time TEXT`, `end_time TEXT`

3. Wstaw `reference_rows` Forza baseline data w `apps/web/seed/settings-reference-seed.ts`:
   - `units_of_measure` (5 wierszy): `{ code: 'kg', label: 'Kilogram', symbol: 'kg' }`, `{ code: 'g', label: 'Gram', symbol: 'g' }`, `{ code: 'L', label: 'Litre', symbol: 'L' }`, `{ code: 'mL', label: 'Millilitre', symbol: 'mL' }`, `{ code: 'pcs', label: 'Pieces', symbol: 'pcs' }`
   - `currencies` (4 wiersze): `{ code: 'PLN', name: 'Polish Zloty', symbol: 'zł' }`, `{ code: 'EUR', name: 'Euro', symbol: '€' }`, `{ code: 'USD', name: 'US Dollar', symbol: '$' }`, `{ code: 'GBP', name: 'British Pound', symbol: '£' }`
   - `countries` (5 wierszy): `{ code: 'PL', name: 'Poland' }`, `{ code: 'DE', name: 'Germany' }`, `{ code: 'GB', name: 'United Kingdom' }`, `{ code: 'FR', name: 'France' }`, `{ code: 'US', name: 'United States' }`
   - `vat_rates` (4 wiersze): `{ code: 'PL_0', rate_pct: 0, label: '0% (exempt)' }`, `{ code: 'PL_5', rate_pct: 5, label: '5%' }`, `{ code: 'PL_8', rate_pct: 8, label: '8%' }`, `{ code: 'PL_23', rate_pct: 23, label: '23% (standard)' }`
   - `document_types` (5 wierszy): `{ code: 'invoice', label: 'Invoice', requires_signature: false }`, `{ code: 'delivery_note', label: 'Delivery Note', requires_signature: true }`, `{ code: 'quality_cert', label: 'Quality Certificate', requires_signature: true }`, `{ code: 'purchase_order', label: 'Purchase Order', requires_signature: false }`, `{ code: 'return_note', label: 'Return Note', requires_signature: true }`
   - `warehouse_zones` (3 wiersze): `{ code: 'raw_material', label: 'Raw Material', zone_type: 'input' }`, `{ code: 'work_in_progress', label: 'Work in Progress', zone_type: 'production' }`, `{ code: 'finished_goods', label: 'Finished Goods', zone_type: 'output' }`
   - `production_shift_types` (3 wiersze): `{ code: 'morning', label: 'Morning Shift', start_time: '06:00', end_time: '14:00' }`, `{ code: 'afternoon', label: 'Afternoon Shift', start_time: '14:00', end_time: '22:00' }`, `{ code: 'night', label: 'Night Shift', start_time: '22:00', end_time: '06:00' }`

4. W `apps/web/seed/settings-reference-seed.ts` dodaj snapshot name jako komentarz na początku pliku: `// Snapshot: settings-reference-forza-baseline`
   W tym samym pliku `apps/web/seed/settings-reference-seed.ts` zaktualizuj `row_count` w `reference_tables` po wstawieniu wierszy:
   ```ts
   await db.update(referenceTables).set({ row_count: actualCount }).where(eq(referenceTables.tableName, tableName))
   ```

5. Zarejestruj seed w `apps/web/seed/index.ts` i dodaj skrypt do `package.json`:
   ```json
   "seed:settings-reference": "tsx apps/web/seed/settings-reference-seed.ts"
   ```

## Files
**Create:** `apps/web/seed/settings-reference-seed.ts`
**Modify:** `apps/web/seed/index.ts` — dodaj import i wywołanie, `apps/web/package.json` — dodaj skrypt `seed:settings-reference`

## Done when
- `pnpm seed:settings-reference` exits 0 na świeżej lokalnej Supabase
- `SELECT COUNT(*) FROM reference_tables` → 7
- `SELECT COUNT(*) FROM reference_rows` → ≥25 (suma wszystkich Forza rows)
- `vitest apps/web/seed/settings-reference-seed.test.ts` PASS — sprawdza: 7 table_names, row counts zgodne z spec
- `pnpm test:smoke` green

## Rollback
`DELETE FROM reference_rows WHERE table_name IN ('units_of_measure','currencies','countries','vat_rates','document_types','warehouse_zones','production_shift_types'); DELETE FROM reference_schemas WHERE table_name IN ('units_of_measure','currencies','countries','vat_rates','document_types','warehouse_zones','production_shift_types'); DELETE FROM reference_tables WHERE table_name IN ('units_of_measure','currencies','countries','vat_rates','document_types','warehouse_zones','production_shift_types');`
````

### Test gate (planning summary)
- **CI gate:** `pnpm seed:settings-reference` green
- **Unit:** `vitest apps/web/seed/settings-reference-seed.test.ts` — covers: sprawdza: 7 table_names, row counts zgodne z spec
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DELETE FROM reference_rows WHERE table_name IN ('units_of_measure','currencies','countries','vat_rates','document_types','warehouse_zones','production_shift_types'); DELETE FROM reference_schemas WHERE table_name IN ('units_of_measure','currencies','countries','vat_rates','document_types','warehouse_zones','production_shift_types'); DELETE FROM reference_tables WHERE table_name IN ('units_of_measure','currencies','countries','vat_rates','document_types','warehouse_zones','production_shift_types');`
## T-02SETa-013 — Server Actions: reference CRUD (create/update/delete row + list)

**Type:** T2-api
**Context budget:** ~55k tokens
**Est time:** 70 min
**Parent feature:** 02-SET-a Reference Tables CRUD (§8.3)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-011 — Schema: reference_tables + reference_schemas + reference_rows, T-02SETa-E01 — permissions enum update, T-02SETa-E02 — EventType enum update]
- **Downstream (will consume this):** [T-02SETa-014, T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-002 — Server Actions: organizations CRUD, T-02SETa-003 — Server Actions: users CRUD]

### GIVEN / WHEN / THEN
**GIVEN** tabele `reference_tables`, `reference_schemas`, `reference_rows` istnieją; permissions enum zawiera `SETTINGS_REF_VIEW`, `SETTINGS_REF_CREATE`, `SETTINGS_REF_UPDATE`, `SETTINGS_REF_DELETE`; EventType enum zawiera `SETTINGS_REF_ROW_CREATED`, `SETTINGS_REF_ROW_UPDATED`, `SETTINGS_REF_ROW_DELETED`
**WHEN** admin wywołuje server actions: `listRefRows(tableName)`, `createRefRow(input)`, `updateRefRow(rowId, input)`, `deleteRefRow(rowId)`
**THEN** każda akcja sprawdza odpowiedni permission (RBAC guard); `row_data` walidowany Zod schemą generowaną dynamicznie z `reference_schemas`; `createRefRow` emituje audit log + outbox event `SETTINGS_REF_ROW_CREATED`; `updateRefRow` emituje `SETTINGS_REF_ROW_UPDATED`; `deleteRefRow` robi soft-delete (`is_active=false`) + emituje `SETTINGS_REF_ROW_DELETED`; po każdej mutacji wywoływany `POST /api/reference/refresh?table=<tableName>`

### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/reference-actions.test.ts` — covers: RBAC guard odrzuca brak permissions, Zod rejects missing required field, soft-delete ustawia is_active=false
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` — covers: createRefRow → DB row present + audit_log entry + outbox event
- **E2E:** none dla API task
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/app/actions/settings/reference-actions.ts apps/web/lib/reference/zod-builder.ts`
### ACP Prompt
````
# Task T-02SETa-013 — Server Actions: reference CRUD (create/update/delete row + list)

## Context — przeczytaj przed implementacją
- `apps/web/drizzle/schema/settings-reference.ts` → cały plik (typy: referenceTables, referenceSchemas, referenceRows)
- `apps/web/lib/validators/reference.ts` → Zod schemas bazowe (referenceRowInputSchema)
- `apps/web/app/actions/settings/` → wzorzec istniejących server actions (struktura, RBAC guard, audit, outbox)
- `apps/web/lib/rbac/permissions.enum.ts` → znajdź sekcję `SETTINGS_REF_*` — permission strings
- `apps/web/lib/outbox/events.enum.ts` → znajdź sekcję `SETTINGS_REF_ROW_*` — event types

## Twoje zadanie
Stwórz 4 Next.js Server Actions dla reference data CRUD. Każda akcja musi być RBAC-guarded, emitować audit + outbox, i dynamicznie walidować row_data na podstawie definicji kolumn z reference_schemas.

## Implementacja

1. Utwórz `apps/web/lib/reference/zod-builder.ts`:
   ```ts
   import { db } from '../../drizzle/client'
   import { referenceSchemas } from '../../drizzle/schema/settings-reference'
   import { eq } from 'drizzle-orm'
   import { z } from 'zod'
   
   export async function buildRefZodSchema(tableName: string): Promise<z.ZodObject<any>> {
     const cols = await db.select().from(referenceSchemas)
       .where(eq(referenceSchemas.tableName, tableName))
       .orderBy(referenceSchemas.sortOrder)
     
     const shape: Record<string, z.ZodTypeAny> = {}
     for (const col of cols) {
       let fieldSchema: z.ZodTypeAny
       switch (col.columnType) {
         case 'text':    fieldSchema = z.string(); break
         case 'integer': fieldSchema = z.number().int(); break
         case 'boolean': fieldSchema = z.boolean(); break
         case 'date':    fieldSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); break
         case 'uuid':    fieldSchema = z.string().uuid(); break
         case 'jsonb':   fieldSchema = z.record(z.unknown()); break
         default:        fieldSchema = z.unknown()
       }
       shape[col.columnName] = col.isRequired ? fieldSchema : fieldSchema.optional()
     }
     return z.object(shape)
   }
   ```

2. Utwórz `apps/web/app/actions/settings/reference-actions.ts` z 4 server actions:
   ```ts
   'use server'
   import { Permission } from '../../../lib/rbac/permissions.enum'
   import { EventType } from '../../../lib/outbox/events.enum'
   import { insertAuditLog } from '../../../lib/audit/insert-audit-log'
   import { insertOutboxEvent } from '../../../lib/outbox/insert-outbox-event'
   import { buildRefZodSchema } from '../../../lib/reference/zod-builder'
   import { db } from '../../../drizzle/client'
   import { referenceRows } from '../../../drizzle/schema/settings-reference'
   import { eq, and } from 'drizzle-orm'
   ```

   **`listRefRows(tableName: string)`** — guard: `Permission.SETTINGS_REF_VIEW`; zwraca wszystkie `reference_rows` gdzie `table_name = tableName` i `is_active = true` dla current tenant

   **`createRefRow(input: { tableName: string; rowData: Record<string, unknown>; code?: string })`** — guard: `Permission.SETTINGS_REF_CREATE`; waliduj `rowData` przez `buildRefZodSchema(input.tableName)`; wstaw wiersz; emituj:
   ```ts
   await insertAuditLog({ tenantId, userId, action: 'settings.reference.row.created', resourceType: 'reference_row', resourceId: newRow.id })
   await insertOutboxEvent(tenantId, EventType.SETTINGS_REF_ROW_CREATED, 'reference_row', newRow.id, { tableName: input.tableName, code: input.code })
   ```
   Następnie wywołaj `fetch('/api/reference/refresh?table=' + input.tableName, { method: 'POST' })`

   **`updateRefRow(rowId: string, input: { rowData: Record<string, unknown> })`** — guard: `Permission.SETTINGS_REF_UPDATE`; pobierz wiersz, waliduj `rowData`, zaktualizuj; emituj audit + `EventType.SETTINGS_REF_ROW_UPDATED`; wywołaj MV refresh

   **`deleteRefRow(rowId: string)`** — guard: `Permission.SETTINGS_REF_DELETE`; soft-delete: `UPDATE reference_rows SET is_active = false WHERE id = rowId`; emituj audit + `EventType.SETTINGS_REF_ROW_DELETED`; wywołaj MV refresh

3. Dodaj guard helper jeśli nie istnieje (sprawdź `lib/rbac/`):
   ```ts
   async function requirePermission(permission: Permission, tenantId: string, userId: string) {
     const allowed = await checkPermission(tenantId, userId, permission)
     if (!allowed) throw new Error(`Forbidden: missing permission ${permission}`)
   }
   ```

4. Utwórz `apps/web/app/actions/settings/__tests__/reference-actions.test.ts`:
   - Mock `checkPermission` → false → oczekuj throw z 'Forbidden'
   - Mock `buildRefZodSchema` z required field → brak pola → oczekuj ZodError
   - Mock db.insert → sprawdź że insertAuditLog wywołany

5. Utwórz `apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts`:
   - Użyj `supabaseLocalDb` fixture (zero DB mocks)
   - `createRefRow({ tableName: 'units_of_measure', rowData: { code: 'mg', label: 'Milligram', symbol: 'mg' } })`
   - Sprawdź: wiersz w `reference_rows`, wpis w `audit_log`, event w `outbox_events`

## Files
**Create:** `apps/web/app/actions/settings/reference-actions.ts`, `apps/web/lib/reference/zod-builder.ts`, `apps/web/app/actions/settings/__tests__/reference-actions.test.ts`, `apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts`

## Done when
- `vitest apps/web/app/actions/settings/__tests__/reference-actions.test.ts` PASS — sprawdza: RBAC guard, Zod rejection, audit call
- `vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` PASS — sprawdza: create → DB + audit + outbox
- `pnpm test:smoke` green

## Rollback
`rm apps/web/app/actions/settings/reference-actions.ts apps/web/lib/reference/zod-builder.ts`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/reference-actions.test.ts` — covers: sprawdza: RBAC guard, Zod rejection, audit call
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` — covers: sprawdza: create → DB + audit + outbox
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/app/actions/settings/reference-actions.ts apps/web/lib/reference/zod-builder.ts`
## T-02SETa-014 — UI: GenericRefTable + RefRowEditModal (reusable for 7 tables)

**Type:** T3-ui
**Prototype ref:** `reference_data_screen` — `design/Monopilot Design System/settings/admin-screens.jsx` lines 475-535
  - component_type: page-layout
  - ui_pattern: list-with-actions
  - shadcn_equivalent: Card, Table, Badge, Button
  - estimated_translation_time_min: 90
**Context budget:** ~75k tokens
**Est time:** 100 min
**Parent feature:** 02-SET-a Reference Tables UI (§8.6)
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-013 — Server Actions: reference CRUD]
- **Downstream (will consume this):** [T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-007 — UI: organizations, T-02SETa-008 — UI: users, T-02SETa-022 — UI: module toggles]

### GIVEN / WHEN / THEN
**GIVEN** server actions `listRefRows`, `createRefRow`, `updateRefRow`, `deleteRefRow` istnieją; `buildRefZodSchema` dostępna; tabele referencyjne mają dane seed (7 tabel); i18n scaffold z next-intl gotowy
**WHEN** admin nawiguje do `/settings/reference` (index) lub `/settings/reference/[tableName]` (detail)
**THEN** `/settings/reference` renderuje `RefTablesIndex` — Card grid 7 tabel z row_count + "Manage" button; `/settings/reference/[tableName]` renderuje `GenericRefTable` z kolumnami auto-generowanymi z `reference_schemas`; "Add Row" otwiera `RefRowEditModal` z RHF form auto-built ze schema; typy pól: text→Input, integer→Input type="number", boolean→Switch, date→Input type="date"; Skeleton podczas ładowania; Alert przy błędzie; soft-deleted rows wyświetlane z BadgeVariant="secondary" + "Restore" button; wszystkie labels przez next-intl klucze `settings.reference.*`

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/reference/RefRowEditModal.test.tsx` — covers: form auto-generuje poprawne typy inputów, Zod rejects missing required field, Switch renderowany dla boolean column
- **Integration:** none (UI testowane przez E2E)
- **E2E:** `playwright apps/web/e2e/settings/reference-tables.spec.ts` — covers: admin dodaje wiersz units_of_measure → pojawia się w tabeli
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/components/settings/reference/`; `rm apps/web/app/\(settings\)/reference/`; revert message files
### ACP Prompt
````
# Task T-02SETa-014 — UI: GenericRefTable + RefRowEditModal (reusable for 7 tables)

## Context — przeczytaj przed implementacją
- `apps/web/app/actions/settings/reference-actions.ts` → cały plik (4 server actions: listRefRows, createRefRow, updateRefRow, deleteRefRow)
- `apps/web/lib/reference/zod-builder.ts` → buildRefZodSchema signature
- `apps/web/components/settings/` → wzorzec istniejących komponentów (jak działają Table, Dialog, Form w tym projekcie)
- `apps/web/messages/en/02-settings.json` → istniejące i18n klucze (wzorzec nazewnictwa)

## Twoje zadanie
Stwórz 3 komponenty: GenericRefTable (data grid z dynamicznymi kolumnami), RefRowEditModal (dialog z auto-generowanym RHF form), RefTablesIndex (card grid 7 tabel). Implementacja musi używać shadcn/Radix — bez useState dla form state, bez Formik.

## Prototype reference
Plik: `design/Monopilot Design System/settings/admin-screens.jsx` linie 475-535
Translation checklist:
- [ ] Replace window.SETTINGS_REF_TABLES card grid → Drizzle query via listRefRows Server Action; card grid via shadcn Card
- [ ] Replace window.SETTINGS_ALLERGENS → generic schema-driven columns z buildRefZodSchema
- [ ] Convert onClick add/edit → Dialog (RefRowEditModal) z useForm + zodResolver
- [ ] Wire Server Actions createRefRow, updateRefRow, deleteRefRow
- [ ] Replace hardcoded labels → next-intl keys `settings.reference.*`
- [ ] Active table card selection → URL param `?table=units_of_measure` (Next.js searchParams)
- [ ] Plik: `design/Monopilot Design System/settings/modals.jsx` linie 535-572 (ref_row_edit_modal)
- [ ] window.Modal → @radix-ui/react-dialog Dialog; local useState per field → useForm + zodResolver
- [ ] isAllergen branch → generic schema-driven field list z reference_schemas

## Implementacja

1. Utwórz `apps/web/components/settings/reference/GenericRefTable.tsx`:
   ```tsx
   import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
   import { Button } from '@/components/ui/button'
   import { Badge } from '@/components/ui/badge'
   import { Skeleton } from '@/components/ui/skeleton'
   import { Alert, AlertDescription } from '@/components/ui/alert'
   
   interface GenericRefTableProps {
     tableName: string
     schema: ReferenceSchema[]
     rows: ReferenceRow[]
     onSave: (data: ReferenceRowInput) => Promise<void>
     onDelete: (rowId: string) => Promise<void>
   }
   ```
   Kolumny tabeli auto-generowane z `schema` prop (posortowane wg sort_order). Inactive rows: `<Badge variant="secondary">Inactive</Badge>` + "Restore" button wywołujący updateRefRow z `is_active: true`. "Add Row" button otwiera RefRowEditModal w trybie create. Każdy wiersz ma "Edit" + "Delete" actions. Loading: `<Skeleton className="h-4 w-full" />`. Error: `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`.

2. Utwórz `apps/web/components/settings/reference/RefRowEditModal.tsx`:
   ```tsx
   import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
   import { Form, FormField, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
   import { Input } from '@/components/ui/input'
   import { Switch } from '@/components/ui/switch'
   import { Button } from '@/components/ui/button'
   import { useForm } from 'react-hook-form'
   import { zodResolver } from '@hookform/resolvers/zod'
   ```
   Props: `{ open: boolean; onClose: () => void; tableName: string; schema: ReferenceSchema[]; row?: ReferenceRow; onSave: (data) => Promise<void> }`
   Form fields auto-generowane z `schema`: column_type='text'→`<Input>`, 'integer'→`<Input type="number">`, 'boolean'→`<Switch>`, 'date'→`<Input type="date">`. Gdy `row` podany (edit mode): row key field (code) `readOnly`. Zod schema z `buildRefZodSchema(tableName)` (wywołaj server-side i przekaż jako prop lub re-build client-side).

3. Utwórz `apps/web/components/settings/reference/RefTablesIndex.tsx`:
   ```tsx
   import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
   import { Button } from '@/components/ui/button'
   import { Badge } from '@/components/ui/badge'
   ```
   Card grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3) dla 7 tabel: title=display_name, description=description, Badge z row_count, "Manage" button → Next.js `<Link href={'/settings/reference/' + table.table_name}>`.

4. Utwórz page components w `apps/web/app/(settings)/reference/page.tsx` i `apps/web/app/(settings)/reference/[tableName]/page.tsx`:
   - `apps/web/app/(settings)/reference/page.tsx` — Server Component; fetchuje reference_tables list przez `listRefRows`; renderuje `<RefTablesIndex>`
   - `apps/web/app/(settings)/reference/[tableName]/page.tsx` — Server Component; fetchuje schema + rows dla danego tableName; renderuje `<GenericRefTable>`

5. Dodaj i18n klucze do `apps/web/messages/en/02-settings.json`:
   ```json
   "reference": {
     "title": "Reference Data",
     "manage": "Manage",
     "add_row": "Add Row",
     "edit": "Edit",
     "delete": "Delete",
     "restore": "Restore",
     "inactive": "Inactive",
     "row_count": "{{count}} rows",
     "save": "Save",
     "cancel": "Cancel",
     "confirm_delete": "Are you sure you want to delete this row?"
   }
   ```
   Dodaj te same klucze (z placeholder wartościami) do `apps/web/messages/pl/02-settings.json`.

## Files
**Create:** `apps/web/components/settings/reference/GenericRefTable.tsx`, `apps/web/components/settings/reference/RefRowEditModal.tsx`, `apps/web/components/settings/reference/RefTablesIndex.tsx`, `apps/web/app/(settings)/reference/page.tsx`, `apps/web/app/(settings)/reference/[tableName]/page.tsx`
**Modify:** `apps/web/messages/en/02-settings.json` — dodaj sekcję `reference`, `apps/web/messages/pl/02-settings.json` — dodaj sekcję `reference`

## Done when
- `vitest apps/web/components/settings/reference/RefRowEditModal.test.tsx` PASS — sprawdza: column_type='boolean' renderuje Switch, Zod rejects brak required field, edit mode: code field readOnly
- `playwright apps/web/e2e/settings/reference-tables.spec.ts` PASS — sprawdza: admin dodaje wiersz `units_of_measure` → pojawia się w tabeli
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/components/settings/reference/ apps/web/app/\(settings\)/reference/`; revert `apps/web/messages/en/02-settings.json` i `apps/web/messages/pl/02-settings.json`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/reference/RefRowEditModal.test.tsx` — covers: sprawdza: column_type='boolean' renderuje Switch, Zod rejects brak required field, edit mode: code field readOnly
- **E2E:** `playwright apps/web/e2e/settings/reference-tables.spec.ts` — covers: sprawdza: admin dodaje wiersz `units_of_measure` → pojawia się w tabeli
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/components/settings/reference/ apps/web/app/\(settings\)/reference/`; revert `apps/web/messages/en/02-settings.json` i `apps/web/messages/pl/02-settings.json`
## T-02SETa-015 — MV refresh strategy: trigger + on-demand endpoint

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a Reference materialized view (§8.4, §5.5)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-011 — Schema: reference_tables + reference_schemas + reference_rows]
- **Downstream (will consume this):** [T-02SETa-013, T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-012 — Seed: 7 reference tables]

### GIVEN / WHEN / THEN
**GIVEN** tabele `reference_tables`, `reference_schemas`, `reference_rows` istnieją po migracji 021
**WHEN** wiersz jest mutowany w `reference_rows` (INSERT/UPDATE/DELETE) LUB admin wywołuje `POST /api/reference/refresh?table=<tableName>`
**THEN** PostgreSQL trigger function wywołuje `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_rows_<tableName>` dla zmutowanej tabeli; endpoint `POST /api/reference/refresh` guardowany `SETTINGS_REF_UPDATE` permission; refresh latency P95 ≤ 500ms na ≤1000 wierszy; pg_notify('mv_refresh_needed', tableName) emitowany przed REFRESH

### Test gate (planning summary)
- **Unit:** brak (logika jest SQL)
- **Integration:** `vitest apps/web/lib/reference/mv-refresh.integration.test.ts` — covers: insert row → MV refreshed ≤500ms, row queryable z MV
- **E2E:** none
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TRIGGER IF EXISTS trg_refresh_mv_reference ON reference_rows; DROP FUNCTION IF EXISTS refresh_mv_reference_rows(); DROP TABLE IF EXISTS mv_reference_rows_units_of_measure ...; rm apps/web/app/api/reference/refresh/route.ts apps/web/lib/reference/mv-refresh.ts`
### ACP Prompt
````
# Task T-02SETa-015 — MV refresh strategy: trigger + on-demand endpoint

## Context — przeczytaj przed implementacją
- `apps/web/drizzle/schema/settings-reference.ts` → tabela `referenceRows` (nazwa SQL: reference_rows)
- `apps/web/drizzle/migrations/021-settings-reference-tables.sql` → istniejące tabele, zrozum strukturę
- `apps/web/lib/rbac/permissions.enum.ts` → `Permission.SETTINGS_REF_UPDATE` — exact string dla guard
- `apps/web/app/api/` → wzorzec istniejących route.ts (Next.js App Router API routes)

## Twoje zadanie
Stwórz system MV refresh dla reference_rows: PostgreSQL materialized views per table + trigger function + on-demand HTTP endpoint. Strategy: REFRESH MATERIALIZED VIEW CONCURRENTLY (nie blokuje reads), pg_notify dla observability.

## Implementacja

1. Utwórz `apps/web/lib/reference/mv-refresh.ts`:
   ```ts
   import { db } from '../../drizzle/client'
   import { sql } from 'drizzle-orm'
   
   // Dozwolone nazwy tabel (whitelist — nigdy nie interpoluj user input bezpośrednio do SQL)
   const ALLOWED_TABLES = [
     'units_of_measure', 'currencies', 'countries', 'vat_rates',
     'document_types', 'warehouse_zones', 'production_shift_types'
   ] as const
   export type AllowedRefTable = typeof ALLOWED_TABLES[number]
   
   export function isAllowedRefTable(name: string): name is AllowedRefTable {
     return (ALLOWED_TABLES as readonly string[]).includes(name)
   }
   
   export async function refreshMaterializedView(tableName: AllowedRefTable): Promise<void> {
     // Safe: tableName validated against whitelist
     await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY ${'mv_reference_rows_' + tableName}`)
   }
   ```

2. Utwórz `apps/web/drizzle/migrations/022-reference-mv-trigger.sql`:
   ```sql
   -- Create materialized views for each of the 7 carveout tables
   CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_rows_units_of_measure AS
     SELECT r.*, rt.display_name AS table_display_name
     FROM reference_rows r
     JOIN reference_tables rt ON rt.table_name = r.table_name
     WHERE r.table_name = 'units_of_measure' AND r.is_active = true;
   
   CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_rows_currencies AS
     SELECT r.*, rt.display_name AS table_display_name
     FROM reference_rows r
     JOIN reference_tables rt ON rt.table_name = r.table_name
     WHERE r.table_name = 'currencies' AND r.is_active = true;
   
   CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_rows_countries AS
     SELECT r.*, rt.display_name AS table_display_name
     FROM reference_rows r
     JOIN reference_tables rt ON rt.table_name = r.table_name
     WHERE r.table_name = 'countries' AND r.is_active = true;
   
   CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_rows_vat_rates AS
     SELECT r.*, rt.display_name AS table_display_name
     FROM reference_rows r
     JOIN reference_tables rt ON rt.table_name = r.table_name
     WHERE r.table_name = 'vat_rates' AND r.is_active = true;
   
   CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_rows_document_types AS
     SELECT r.*, rt.display_name AS table_display_name
     FROM reference_rows r
     JOIN reference_tables rt ON rt.table_name = r.table_name
     WHERE r.table_name = 'document_types' AND r.is_active = true;
   
   CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_rows_warehouse_zones AS
     SELECT r.*, rt.display_name AS table_display_name
     FROM reference_rows r
     JOIN reference_tables rt ON rt.table_name = r.table_name
     WHERE r.table_name = 'warehouse_zones' AND r.is_active = true;
   
   CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_rows_production_shift_types AS
     SELECT r.*, rt.display_name AS table_display_name
     FROM reference_rows r
     JOIN reference_tables rt ON rt.table_name = r.table_name
     WHERE r.table_name = 'production_shift_types' AND r.is_active = true;
   
   -- Unique indexes (required for CONCURRENTLY refresh)
   CREATE UNIQUE INDEX IF NOT EXISTS mv_ref_units_of_measure_id ON mv_reference_rows_units_of_measure (id);
   CREATE UNIQUE INDEX IF NOT EXISTS mv_ref_currencies_id ON mv_reference_rows_currencies (id);
   CREATE UNIQUE INDEX IF NOT EXISTS mv_ref_countries_id ON mv_reference_rows_countries (id);
   CREATE UNIQUE INDEX IF NOT EXISTS mv_ref_vat_rates_id ON mv_reference_rows_vat_rates (id);
   CREATE UNIQUE INDEX IF NOT EXISTS mv_ref_document_types_id ON mv_reference_rows_document_types (id);
   CREATE UNIQUE INDEX IF NOT EXISTS mv_ref_warehouse_zones_id ON mv_reference_rows_warehouse_zones (id);
   CREATE UNIQUE INDEX IF NOT EXISTS mv_ref_production_shift_types_id ON mv_reference_rows_production_shift_types (id);
   
   -- Trigger function: notify + schedule refresh
   CREATE OR REPLACE FUNCTION refresh_mv_reference_rows()
   RETURNS TRIGGER LANGUAGE plpgsql AS $$
   DECLARE
     affected_table TEXT;
   BEGIN
     IF TG_OP = 'DELETE' THEN
       affected_table := OLD.table_name;
     ELSE
       affected_table := NEW.table_name;
     END IF;
     PERFORM pg_notify('mv_refresh_needed', affected_table);
     -- Immediate refresh (runs inline with transaction commit)
     CASE affected_table
       WHEN 'units_of_measure'      THEN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_rows_units_of_measure;
       WHEN 'currencies'            THEN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_rows_currencies;
       WHEN 'countries'             THEN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_rows_countries;
       WHEN 'vat_rates'             THEN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_rows_vat_rates;
       WHEN 'document_types'        THEN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_rows_document_types;
       WHEN 'warehouse_zones'       THEN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_rows_warehouse_zones;
       WHEN 'production_shift_types' THEN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_rows_production_shift_types;
       ELSE NULL;
     END CASE;
     RETURN NULL;
   END;
   $$;
   
   -- Attach trigger
   DROP TRIGGER IF EXISTS trg_refresh_mv_reference ON reference_rows;
   CREATE TRIGGER trg_refresh_mv_reference
     AFTER INSERT OR UPDATE OR DELETE ON reference_rows
     FOR EACH ROW EXECUTE FUNCTION refresh_mv_reference_rows();
   ```

3. Utwórz `apps/web/app/api/reference/refresh/route.ts`:
   ```ts
   import { NextRequest, NextResponse } from 'next/server'
   import { getServerSession } from 'next-auth'
   import { checkPermission } from '../../../../lib/rbac/check-permission'
   import { Permission } from '../../../../lib/rbac/permissions.enum'
   import { refreshMaterializedView, isAllowedRefTable } from '../../../../lib/reference/mv-refresh'
   
   export async function POST(req: NextRequest) {
     const table = req.nextUrl.searchParams.get('table')
     if (!table || !isAllowedRefTable(table)) {
       return NextResponse.json({ error: 'Invalid or unknown table name' }, { status: 400 })
     }
     const session = await getServerSession()
     if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     const allowed = await checkPermission(session.user.tenantId, session.user.id, Permission.SETTINGS_REF_UPDATE)
     if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
     
     const start = Date.now()
     await refreshMaterializedView(table)
     return NextResponse.json({ ok: true, table, latencyMs: Date.now() - start })
   }
   ```

4. Uruchom `pnpm drizzle-kit migrate` aby zastosować `apps/web/drizzle/migrations/022-reference-mv-trigger.sql`.

5. Utwórz `apps/web/lib/reference/mv-refresh.integration.test.ts`:
   - Użyj `supabaseLocalDb` fixture
   - Insert 1 wiersz do `reference_rows` gdzie `table_name = 'units_of_measure'`
   - Zmierz czas; query `SELECT * FROM mv_reference_rows_units_of_measure WHERE code = 'test_mv'`
   - Assert: wiersz present, latency ≤ 500ms
   - Test 1000-row insert: wstaw 1000 wierszy `currencies`; zmierz czas REFRESH CONCURRENTLY; assert ≤ 500ms

## Files
**Create:** `apps/web/lib/reference/mv-refresh.ts`, `apps/web/app/api/reference/refresh/route.ts`, `apps/web/lib/reference/mv-refresh.integration.test.ts`
**Generated:** `apps/web/drizzle/migrations/022-reference-mv-trigger.sql`

## Done when
- `pnpm drizzle-kit migrate` exits 0, 7 MV i trigger obecne w lokalnej Supabase
- `vitest apps/web/lib/reference/mv-refresh.integration.test.ts` PASS — sprawdza: insert → MV refreshed ≤500ms, 1000-row latency ≤500ms
- `curl -X POST http://localhost:3000/api/reference/refresh?table=currencies` → `{"ok":true}`
- `curl -X POST http://localhost:3000/api/reference/refresh?table=nonexistent` → 400
- `pnpm test:smoke` green

## Rollback
`DROP TRIGGER IF EXISTS trg_refresh_mv_reference ON reference_rows; DROP FUNCTION IF EXISTS refresh_mv_reference_rows(); DROP MATERIALIZED VIEW IF EXISTS mv_reference_rows_units_of_measure, mv_reference_rows_currencies, mv_reference_rows_countries, mv_reference_rows_vat_rates, mv_reference_rows_document_types, mv_reference_rows_warehouse_zones, mv_reference_rows_production_shift_types; rm apps/web/app/api/reference/refresh/route.ts apps/web/lib/reference/mv-refresh.ts`
````

### Test gate (planning summary)
- **CI gate:** `pnpm drizzle-kit migrate` green
- **Integration:** `vitest apps/web/lib/reference/mv-refresh.integration.test.ts` — covers: sprawdza: insert → MV refreshed ≤500ms, 1000-row latency ≤500ms
- **CI gate:** `pnpm test:smoke` green

### Rollback
`DROP TRIGGER IF EXISTS trg_refresh_mv_reference ON reference_rows; DROP FUNCTION IF EXISTS refresh_mv_reference_rows(); DROP MATERIALIZED VIEW IF EXISTS mv_reference_rows_units_of_measure, mv_reference_rows_currencies, mv_reference_rows_countries, mv_reference_rows_vat_rates, mv_reference_rows_document_types, mv_reference_rows_warehouse_zones, mv_reference_rows_production_shift_types; rm apps/web/app/api/reference/refresh/route.ts apps/web/lib/reference/mv-refresh.ts`
## T-02SETa-025 — E2E + Integration: Reference data track wiring

**Type:** T4-wiring+test
**Context budget:** ~75k tokens
**Est time:** 75 min
**Parent feature:** 02-SET-a Reference Tables full flow
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-014 — UI: GenericRefTable + RefRowEditModal, T-02SETa-015 — MV refresh strategy]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETa-026, T-02SETa-028]

### GIVEN / WHEN / THEN
**GIVEN** Reference CRUD UI + server actions + MV refresh zaimplementowane; Forza seed `settings-reference-forza-baseline` zastosowany; Playwright + Vitest harness z E-0 gotowe
**WHEN** full test suite uruchamia się: `playwright apps/web/e2e/settings/reference-tables.spec.ts` + `vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts`
**THEN** admin może CRUD wszystkie 7 tabel referencyjnych przez UI; MV refresh odpala po każdej mutacji; `audit_log` zawiera wpisy dla każdej operacji; `outbox_events` zawiera odpowiednie events; RLS blokuje cross-tenant dostęp do `reference_rows`; `pnpm test:smoke` green

### Test gate (planning summary)
- **Unit:** none (wiring task — testy są celem, nie produktem ubocznym)
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` — covers: MV refresh po mutacji, RLS cross-tenant blokada, audit + outbox per operacja
- **E2E:** `playwright apps/web/e2e/settings/reference-tables.spec.ts` — covers: full CRUD flow dla wszystkich 7 tabel, soft-delete + restore, MV refresh widoczny w UI
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/e2e/settings/reference-tables.spec.ts apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts`
### ACP Prompt
````
# Task T-02SETa-025 — E2E + Integration: Reference data track wiring

## Context — przeczytaj przed implementacją
- `apps/web/app/actions/settings/reference-actions.ts` → 4 server actions (listRefRows, createRefRow, updateRefRow, deleteRefRow)
- `apps/web/components/settings/reference/GenericRefTable.tsx` → UI component (tableName prop, onSave, onDelete)
- `apps/web/components/settings/reference/RefRowEditModal.tsx` → Dialog form
- `apps/web/lib/reference/mv-refresh.ts` → refreshMaterializedView, ALLOWED_TABLES
- `apps/web/e2e/` → wzorzec istniejących E2E testów (fixtures, page objects)
- `apps/web/app/actions/settings/__tests__/` → wzorzec integration testów (supabaseLocalDb fixture)

## Twoje zadanie
Napisz kompletne testy weryfikujące end-to-end działanie Reference Data track: pełny CRUD przez UI, MV refresh, RLS isolation, audit + outbox integration. Użyj `supabaseLocalDb` fixture — zero DB mocks w integration testach.

## Implementacja

1. Utwórz `apps/web/e2e/settings/reference-tables.spec.ts` z Playwright E2E:
   ```ts
   import { test, expect } from '@playwright/test'
   
   test.describe('Reference Data CRUD', () => {
     test.beforeEach(async ({ page }) => {
       // Login jako admin (użyj fixtures z e2e/fixtures/auth.ts)
       await page.goto('/settings/reference')
     })
     
     test('shows all 7 reference tables on index page', async ({ page }) => {
       // Sprawdź że widoczne: Units of Measure, Currencies, Countries, VAT Rates,
       // Document Types, Warehouse Zones, Production Shift Types
       for (const tableName of ['Units of Measure', 'Currencies', 'Countries', 'VAT Rates',
                                'Document Types', 'Warehouse Zones', 'Production Shift Types']) {
         await expect(page.getByText(tableName)).toBeVisible()
       }
     })
     
     test('can add a row to units_of_measure', async ({ page }) => {
       await page.goto('/settings/reference/units_of_measure')
       await page.getByRole('button', { name: 'Add Row' }).click()
       await page.getByLabel('code').fill('oz')
       await page.getByLabel('label').fill('Ounce')
       await page.getByLabel('symbol').fill('oz')
       await page.getByRole('button', { name: 'Save' }).click()
       await expect(page.getByText('oz')).toBeVisible()
       await expect(page.getByText('Ounce')).toBeVisible()
     })
     
     test('can edit an existing row', async ({ page }) => {
       await page.goto('/settings/reference/currencies')
       // Edytuj PLN — zmień display name
       await page.getByRole('row', { name: /PLN/ }).getByRole('button', { name: 'Edit' }).click()
       await page.getByLabel('name').fill('Polish Zloty (PLN)')
       await page.getByRole('button', { name: 'Save' }).click()
       await expect(page.getByText('Polish Zloty (PLN)')).toBeVisible()
     })
     
     test('soft-delete shows row as inactive with Restore button', async ({ page }) => {
       await page.goto('/settings/reference/warehouse_zones')
       await page.getByRole('row', { name: /raw_material/ }).getByRole('button', { name: 'Delete' }).click()
       await expect(page.getByRole('row', { name: /raw_material/ }).getByText('Inactive')).toBeVisible()
       await expect(page.getByRole('row', { name: /raw_material/ }).getByRole('button', { name: 'Restore' })).toBeVisible()
     })
     
     test('can restore a soft-deleted row', async ({ page }) => {
       await page.goto('/settings/reference/warehouse_zones')
       await page.getByRole('row', { name: /raw_material/ }).getByRole('button', { name: 'Delete' }).click()
       await page.getByRole('row', { name: /raw_material/ }).getByRole('button', { name: 'Restore' }).click()
       await expect(page.getByRole('row', { name: /raw_material/ }).getByText('Inactive')).not.toBeVisible()
     })
     
     // Repeat add-row tests for remaining 6 tables (one row per table as smoke)
     for (const [tableName, row] of [
       ['currencies', { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' }],
       ['countries', { code: 'CH', name: 'Switzerland' }],
       ['vat_rates', { code: 'PL_99', rate_pct: '99', label: '99% test' }],
       ['document_types', { code: 'test_doc', label: 'Test Document' }],
       ['production_shift_types', { code: 'test_shift', label: 'Test Shift' }],
     ] as const) {
       test(`can add a row to ${tableName}`, async ({ page }) => {
         await page.goto('/settings/reference/' + tableName)
         await page.getByRole('button', { name: 'Add Row' }).click()
         for (const [key, value] of Object.entries(row)) {
           await page.getByLabel(key).fill(value)
         }
         await page.getByRole('button', { name: 'Save' }).click()
         await expect(page.getByText(row.code)).toBeVisible()
       })
     }
   })
   ```

2. Utwórz `apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` (dopisz jeśli plik istnieje):
   ```ts
   import { describe, it, expect, beforeEach } from 'vitest'
   import { supabaseLocalDb } from '../../../../test/fixtures/supabase-local-db'
   import { createRefRow, updateRefRow, deleteRefRow, listRefRows } from '../reference-actions'
   
   describe('Reference CRUD Integration', () => {
     beforeEach(async () => {
       // Seed clean tenant + seed settings-reference-forza-baseline
       await supabaseLocalDb.resetToSnapshot('settings-reference-forza-baseline')
     })
     
     it('createRefRow inserts row and emits audit + outbox', async () => {
       const result = await createRefRow({ tableName: 'units_of_measure', rowData: { code: 'mg', label: 'Milligram', symbol: 'mg' } })
       expect(result.id).toBeTruthy()
       
       // Sprawdź DB bezpośrednio
       const rows = await supabaseLocalDb.query('SELECT * FROM reference_rows WHERE table_name = $1 AND code = $2', ['units_of_measure', 'mg'])
       expect(rows.length).toBe(1)
       
       const auditRows = await supabaseLocalDb.query('SELECT * FROM audit_log WHERE resource_type = $1 AND resource_id = $2', ['reference_row', result.id])
       expect(auditRows.length).toBe(1)
       expect(auditRows[0].action).toBe('settings.reference.row.created')
       
       const outboxRows = await supabaseLocalDb.query('SELECT * FROM outbox_events WHERE aggregate_id = $1', [result.id])
       expect(outboxRows.length).toBe(1)
       expect(outboxRows[0].event_type).toBe('settings.reference.row.created')
     })
     
     it('createRefRow triggers MV refresh — row queryable from MV', async () => {
       const start = Date.now()
       await createRefRow({ tableName: 'units_of_measure', rowData: { code: 'mv_test', label: 'MV Test', symbol: 'x' } })
       const latency = Date.now() - start
       expect(latency).toBeLessThan(500) // P95 ≤ 500ms
       
       const mvRows = await supabaseLocalDb.query('SELECT * FROM mv_reference_rows_units_of_measure WHERE code = $1', ['mv_test'])
       expect(mvRows.length).toBe(1)
     })
     
     it('deleteRefRow soft-deletes — is_active=false, still in DB', async () => {
       const created = await createRefRow({ tableName: 'currencies', rowData: { code: 'TST', name: 'Test Currency', symbol: 'T' } })
       await deleteRefRow(created.id)
       
       const rows = await supabaseLocalDb.query('SELECT * FROM reference_rows WHERE id = $1', [created.id])
       expect(rows[0].is_active).toBe(false)
     })
     
     it('RLS: reference rows from tenant A not queryable by tenant B', async () => {
       const tenantA = await supabaseLocalDb.createTestTenant('tenant-a')
       const tenantB = await supabaseLocalDb.createTestTenant('tenant-b')
       
       // Insert wiersz jako tenant A
       await supabaseLocalDb.withTenant(tenantA.id, async () => {
         await createRefRow({ tableName: 'countries', rowData: { code: 'AA', name: 'Tenant A Country' } })
       })
       
       // Query jako tenant B — nie powinien widzieć
       const rows = await supabaseLocalDb.withTenant(tenantB.id, async () =>
         supabaseLocalDb.query('SELECT * FROM reference_rows WHERE table_name = $1', ['countries'])
       )
       expect(rows.find(r => r.row_data?.code === 'AA')).toBeUndefined()
     })
     
     it('updateRefRow emits SETTINGS_REF_ROW_UPDATED outbox event', async () => {
       const created = await createRefRow({ tableName: 'vat_rates', rowData: { code: 'PL_TEST', rate_pct: 15, label: '15% test' } })
       await updateRefRow(created.id, { rowData: { code: 'PL_TEST', rate_pct: 16, label: '16% updated' } })
       
       const outboxRows = await supabaseLocalDb.query(
         'SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = $2',
         [created.id, 'settings.reference.row.updated']
       )
       expect(outboxRows.length).toBe(1)
     })
   })
   ```

3. Uruchom testy lokalnie dla `apps/web/e2e/settings/reference-tables.spec.ts` i `apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` i upewnij się że wszystkie przechodzą:
   ```bash
   pnpm playwright apps/web/e2e/settings/reference-tables.spec.ts
   pnpm vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts
   pnpm test:smoke
   ```

4. Jeśli jakiś test failuje: sprawdź logi z `apps/web/e2e/settings/reference-tables.spec.ts` lub `apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts`, zidentyfikuj problem (brakujący fixture, wrong selector, RLS policy gap) i napraw.

5. Upewnij się że `apps/web/e2e/settings/reference-tables.spec.ts` i integration test eksportują named describe block zgodnie z wzorcem projektu.

## Files
**Create:** `apps/web/e2e/settings/reference-tables.spec.ts`
**Create or Modify:** `apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` — dopisz lub utwórz integration test suite

## Done when
- `playwright apps/web/e2e/settings/reference-tables.spec.ts` PASS — wszystkie 12 testów (CRUD + soft-delete + restore dla 7 tabel)
- `vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` PASS — sprawdza: create→audit+outbox, MV refresh ≤500ms, soft-delete, RLS cross-tenant, update outbox event
- `pnpm test:smoke` green

## Rollback
`rm apps/web/e2e/settings/reference-tables.spec.ts`; usuń integration test suite z `apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts`
````

### Test gate (planning summary)
- **E2E:** `playwright apps/web/e2e/settings/reference-tables.spec.ts` — covers: wszystkie 12 testów (CRUD + soft-delete + restore dla 7 tabel)
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts` — covers: sprawdza: create→audit+outbox, MV refresh ≤500ms, soft-delete, RLS cross-tenant, update outbox event
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm apps/web/e2e/settings/reference-tables.spec.ts`; usuń integration test suite z `apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts`
## Dependency table

| ID | Upstream | Parallel |
|---|---|---|
| T-02SETa-011 | [T-00b-000] | [T-02SETa-001] |
| T-02SETa-012 | [T-02SETa-011] | [T-02SETa-015] |
| T-02SETa-013 | [T-02SETa-011, T-02SETa-E01, T-02SETa-E02] | [T-02SETa-002, T-02SETa-003] |
| T-02SETa-014 | [T-02SETa-013] | [T-02SETa-007, T-02SETa-008, T-02SETa-022] |
| T-02SETa-015 | [T-02SETa-011] | [T-02SETa-012] |
| T-02SETa-025 | [T-02SETa-014, T-02SETa-015] | [T-02SETa-026, T-02SETa-028] |

## Parallel dispatch plan

Wave 0 (blockers): T-02SETa-011 (must complete before any S-β task starts)
Wave 1 (parallel after 011): T-02SETa-012, T-02SETa-013, T-02SETa-015 (012 and 015 can run together; 013 needs E01+E02 enums also done)
Wave 2 (after Wave 1): T-02SETa-014 (after 013)
Wave 3 (sequential): T-02SETa-014 → T-02SETa-025

## PRD coverage

```
✅ §5.5 Reference data generic storage → T-02SETa-011 (schema), T-02SETa-015 (MV)
✅ §8.1 Reference tables (7 of 17 ADR-032 carveout) → T-02SETa-012 (seed)
✅ §8.3 Reference CRUD actions → T-02SETa-013
✅ §8.4 MV refresh strategy → T-02SETa-015
✅ §8.6 Reference Data UI → T-02SETa-014
✅ E2E + integration wiring → T-02SETa-025
⚠️ §8.1 remaining 10 reference tables → deferred to 02-SET-d per ADR-032
❌ CSV import wizard (BL-SET-04) → deferred to 02-SET-b
❌ Schema column edit wizard (BL-SET-01) → deferred to 02-SET-b
```

## Task count summary

| Type | Count | Tasks |
|---|---|---|
| T1-schema | 1 | T-02SETa-011 |
| T2-api | 2 | T-02SETa-013, T-02SETa-015 |
| T3-ui | 1 | T-02SETa-014 |
| T4-wiring+test | 1 | T-02SETa-025 |
| T5-seed | 1 | T-02SETa-012 |
| **Total** | **6** | |

**Estimated total time:** 380 min (~6.3 hrs)
**Total context budget:** ~325k tokens


## T-02SETa-016 — Schema: modules + organization_modules + feature_flags_core

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a Module toggles (§10.1, §10.2)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — Foundation baseline migration]
- **Downstream (will consume this):** [T-02SETa-017, T-02SETa-018, T-02SETa-019, T-02SETa-020, T-02SETa-021, T-02SETa-022, T-02SETa-023, T-02SETa-024]
- **Parallel (can run concurrently):** [T-02SETa-001, T-02SETa-011]

### GIVEN / WHEN / THEN
**GIVEN** Foundation baseline migration applied; tenants and organizations tables exist
**WHEN** module toggles schema migration `022-settings-modules.sql` is generated and applied
**THEN** tables `modules`, `organization_modules`, and `feature_flags_core` all exist with correct columns and constraints; RLS enabled on org-scoped tables; `modules` table seeded with 15 module rows; `organization_modules` backfilled for all existing orgs; `pnpm drizzle-kit generate` succeeds; integration test PASS with 15 modules + org_modules backfill counts correct

### ACP Prompt
````
# Task T-02SETa-016 — Schema: modules + organization_modules + feature_flags_core

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → znajdź sekcję `## §10 — Module Toggles + Feature Flags` — spec 15 modułów, dependency checker, feature flags core
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/` → katalog istniejących schematów Drizzle (wzorzec do naśladowania)

## Twoje zadanie
Foundation baseline migration jest applied. Utwórz Drizzle schema + migration SQL dla 3 tabel modułowych i zaseeduj 15 modułów systemu.

**Preconditions:** tabele `tenants`, `organizations` istnieją. Migration number: `022`.

**Acceptance criteria:**
- 3 tabele istnieją z dokładnymi kolumnami (poniżej)
- RLS włączone na `organization_modules` i `feature_flags_core`
- 15 modułów zaseedowanych w `modules`
- Backfill `organization_modules` dla wszystkich istniejących organizacji
- Integration test PASS

## Implementacja

1. Utwórz `apps/web/drizzle/schema/settings-modules.ts`

```ts
// modules table — catalogue of system modules (NOT an R13 business table — no tenant_id here)
export const modules = pgTable('modules', {
  code: text('code').primaryKey(),
  display_name: text('display_name').notNull(),
  description: text('description'),
  category: text('category').notNull(), // CHECK category IN ('core','advanced','add-on')
  is_core: boolean('is_core').notNull().default(false), // core modules cannot be disabled
  // R13 audit columns (schema_version only — no tenant_id on global catalogue table)
  schema_version: integer('schema_version').notNull().default(1),
})

// organization_modules — per-org module enable/disable state
export const organizationModules = pgTable('organization_modules', {
  org_id: uuid('org_id').notNull().references(() => organizations.id),
  module_code: text('module_code').notNull().references(() => modules.code),
  is_enabled: boolean('is_enabled').notNull().default(true),
  enabled_at: timestamp('enabled_at', { withTimezone: true }).defaultNow(),
  enabled_by: uuid('enabled_by'),
  // R13 columns
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  created_by_user: uuid('created_by_user'),
  created_by_device: uuid('created_by_device'),
  app_version: text('app_version'),
  model_prediction_id: uuid('model_prediction_id'),
  epcis_event_id: uuid('epcis_event_id'),
  external_id: text('external_id'),
  schema_version: integer('schema_version').notNull().default(1),
}, (table) => ({
  pk: primaryKey({ columns: [table.org_id, table.module_code] }),
}))

// feature_flags_core — per-tenant feature flags
export const featureFlagsCore = pgTable('feature_flags_core', {
  flag_key: text('flag_key').notNull(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id),
  is_enabled: boolean('is_enabled').notNull().default(false),
  rollout_percentage: integer('rollout_percentage'), // CHECK 0-100
  conditions: jsonb('conditions').default('{}'),
  // R13 columns
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  created_by_user: uuid('created_by_user'),
  created_by_device: uuid('created_by_device'),
  app_version: text('app_version'),
  model_prediction_id: uuid('model_prediction_id'),
  epcis_event_id: uuid('epcis_event_id'),
  external_id: text('external_id'),
  schema_version: integer('schema_version').notNull().default(1),
}, (table) => ({
  pk: primaryKey({ columns: [table.flag_key, table.tenant_id] }),
}))
```

2. Uruchom `pnpm drizzle-kit generate` — generuje `apps/web/drizzle/migrations/022-settings-modules.sql`

3. Edytuj `apps/web/drizzle/migrations/022-settings-modules.sql` — dodaj CHECKs + RLS:
- `CHECK (category IN ('core','advanced','add-on'))` na `modules.category`
- `CHECK (rollout_percentage BETWEEN 0 AND 100)` na `feature_flags_core.rollout_percentage`
- RLS: `ALTER TABLE organization_modules ENABLE ROW LEVEL SECURITY;`
- RLS: `ALTER TABLE feature_flags_core ENABLE ROW LEVEL SECURITY;`
- RLS policy na `organization_modules`: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
- RLS policy na `feature_flags_core`: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`

4. Dodaj do `apps/web/drizzle/migrations/022-settings-modules.sql` seed INSERT INTO modules:
```sql
INSERT INTO modules (code, display_name, description, category, is_core) VALUES
('npd',             'New Product Development',  'NPD module',              'core',     false),
('warehouse',       'Warehouse Management',      'Warehouse module',         'core',     false),
('production',      'Production Management',     'Production module',        'core',     false),
('quality',         'Quality Management',        'QA module',               'core',     false),
('finance',         'Finance & Costing',         'Finance module',           'core',     false),
('shipping',        'Shipping & Dispatch',       'Shipping module',          'advanced', false),
('reporting',       'Reporting & BI',            'Reporting module',         'advanced', false),
('maintenance',     'Maintenance Management',    'Maintenance module',       'advanced', false),
('multi_site',      'Multi-Site Management',     'Multi-site module',        'add-on',   false),
('oee',             'OEE Analytics',             'OEE module',              'add-on',   false),
('settings_advanced','Advanced Settings',        'Advanced settings',        'core',     true),
('scanner',         'Scanner Interface',         'Mobile scanner module',    'advanced', false),
('planning',        'Production Planning',       'Planning module',          'advanced', false),
('crm',             'CRM & Customers',           'CRM module',              'add-on',   false),
('purchasing',      'Purchasing & Procurement',  'Purchasing module',        'add-on',   false)
ON CONFLICT (code) DO NOTHING;
```

5. Dodaj do `apps/web/drizzle/migrations/022-settings-modules.sql` backfill INSERT dla `organization_modules`:
```sql
INSERT INTO organization_modules (org_id, module_code, is_enabled, tenant_id)
SELECT o.id, m.code, true, o.tenant_id
FROM organizations o
CROSS JOIN modules m
ON CONFLICT (org_id, module_code) DO NOTHING;
```

   - Utwórz Zod schemas w `apps/web/lib/validators/modules.ts`:
   - Export z `apps/web/drizzle/schema/index.ts`:
   - Utwórz integration test `apps/web/drizzle/migrations/__tests__/022-settings-modules.integration.test.ts`:
## Files
**Create:** `apps/web/drizzle/schema/settings-modules.ts`, `apps/web/lib/validators/modules.ts`, `apps/web/drizzle/migrations/__tests__/022-settings-modules.integration.test.ts`
**Modify:** `apps/web/drizzle/schema/index.ts` — dodaj export settings-modules
**Generated:** `apps/web/drizzle/migrations/022-settings-modules.sql`

## Done when
- `pnpm drizzle-kit generate` PASS — migration SQL wygenerowany bez błędów
- `vitest apps/web/drizzle/migrations/__tests__/022-settings-modules.integration.test.ts` PASS — 15 modules, org_modules backfill, RLS enforcement
- `pnpm test:migrations` green

- `pnpm test:smoke` green
## Rollback
`pnpm drizzle-kit drop --migration 022-settings-modules` lub `DROP TABLE feature_flags_core; DROP TABLE organization_modules; DROP TABLE modules;`
````
### Test gate (planning summary)
- **Integration:** `vitest apps/web/drizzle/migrations/__tests__/022-settings-modules.integration.test.ts` — 15 modules seeded, org_modules backfill = orgs × 15, RLS cross-tenant block
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop --migration 022-settings-modules`
## T-02SETa-017 — Module toggle middleware (`checkModuleEnabled`)

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 02-SET-a Module toggles middleware (§10.1 V-SET-40)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-016 — modules schema]
- **Downstream (will consume this):** [T-02SETa-024, all E-2 module-gated handlers]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003]

### GIVEN / WHEN / THEN
**GIVEN** `organization_modules` table populated with 15 module rows per org
**WHEN** any route handler or Server Action calls `checkModuleEnabled(tenantId, moduleCode)`
**THEN** if `organization_modules.is_enabled = true` → resolves `true`; if `is_enabled = false` → throws `ModuleDisabledError` with `moduleCode` property; HTTP layer returns 403 `{ error: 'MODULE_DISABLED', moduleCode }`; per-request Map cache avoids repeated DB hits for same tenantId+moduleCode in same request lifecycle

### ACP Prompt
````
# Task T-02SETa-017 — Module toggle middleware (checkModuleEnabled)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-modules.ts` → cały plik — Drizzle definicje `organization_modules`, `feature_flags_core`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/` → wzorzec istniejącego middleware RBAC

## Twoje zadanie
Utwórz middleware `checkModuleEnabled` z per-request cache + HOF wrapper dla route handlers.

**Acceptance criteria:**
- `checkModuleEnabled(tenantId, moduleCode)` → resolves `true` jeśli moduł enabled, throws `ModuleDisabledError` jeśli disabled
- Per-request Map cache: `Map<string, boolean>` keyed by `${tenantId}:${moduleCode}` — zero repeated DB queries w jednym request
- `withModuleCheck(moduleCode)` HOF — wraps route handler, returns 403 JSON jeśli disabled
- Unit tests PASS (disabled → error, enabled → resolves, cache hit confirmed)
- Integration test: toggle `organization_modules.is_enabled = false` → middleware blocks

## Implementacja

1. Utwórz `apps/web/lib/modules/check-module-enabled.ts`:
```ts
import { db } from '@/drizzle/db'
import { organizationModules } from '@/drizzle/schema/settings-modules'
import { and, eq } from 'drizzle-orm'

export class ModuleDisabledError extends Error {
  constructor(public readonly moduleCode: string) {
    super(`MODULE_DISABLED:${moduleCode}`)
    this.name = 'ModuleDisabledError'
  }
}

// Per-request cache (AsyncLocalStorage or module-level Map reset per request)
const requestCache = new Map<string, boolean>()

export async function checkModuleEnabled(
  tenantId: string,
  moduleCode: string
): Promise<boolean> {
  const cacheKey = `${tenantId}:${moduleCode}`
  if (requestCache.has(cacheKey)) return requestCache.get(cacheKey)!

  const row = await db.query.organizationModules.findFirst({
    where: and(
      eq(organizationModules.tenant_id, tenantId),
      eq(organizationModules.module_code, moduleCode)
    ),
    columns: { is_enabled: true },
  })

  const enabled = row?.is_enabled ?? false
  requestCache.set(cacheKey, enabled)

  if (!enabled) throw new ModuleDisabledError(moduleCode)
  return true
}

export function clearModuleCache() {
  requestCache.clear()
}
```

2. Utwórz `apps/web/lib/modules/with-module-check.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { checkModuleEnabled, ModuleDisabledError } from './check-module-enabled'

export function withModuleCheck(moduleCode: string) {
  return function <T>(
    handler: (req: NextRequest, ctx: T) => Promise<NextResponse>
  ) {
    return async (req: NextRequest, ctx: T): Promise<NextResponse> => {
      const tenantId = req.headers.get('x-tenant-id') ?? ''
      try {
        await checkModuleEnabled(tenantId, moduleCode)
        return handler(req, ctx)
      } catch (err) {
        if (err instanceof ModuleDisabledError) {
          return NextResponse.json(
            { error: 'MODULE_DISABLED', moduleCode: err.moduleCode },
            { status: 403 }
          )
        }
        throw err
      }
    }
  }
}
```

3. Export z `apps/web/lib/modules/index.ts`:
```ts
export { checkModuleEnabled, clearModuleCache, ModuleDisabledError } from './check-module-enabled'
export { withModuleCheck } from './with-module-check'
```

**Usage pattern w Server Actions:**
```ts
// apps/web/lib/modules/check-module-enabled.ts
// Usage in Server Actions:
const enabled = await checkModuleEnabled(ctx.tenantId, 'npd')
if (!enabled) throw new Error('MODULE_DISABLED:npd')
```

4. Utwórz `apps/web/lib/modules/__tests__/check-module-enabled.test.ts`:
Testy jednostkowe:
- mock DB → `is_enabled: false` → throws `ModuleDisabledError` z `moduleCode`
- mock DB → `is_enabled: true` → resolves `true`
- drugi call z tym samym key → cache hit (DB wywołane tylko raz)
- `clearModuleCache()` → reset Map → DB query znowu wykonane

5. Utwórz `apps/web/lib/modules/__tests__/check-module-enabled.integration.test.ts`:
Z `supabaseLocalDb` fixture (zero DB mocks):
- toggle `organization_modules.is_enabled = false` dla org → `checkModuleEnabled` throws
- flip z powrotem na `true` → resolves

## Files
**Create:** `apps/web/lib/modules/check-module-enabled.ts`, `apps/web/lib/modules/with-module-check.ts`, `apps/web/lib/modules/index.ts`, `apps/web/lib/modules/__tests__/check-module-enabled.test.ts`, `apps/web/lib/modules/__tests__/check-module-enabled.integration.test.ts`

## Done when
- `vitest apps/web/lib/modules/__tests__/check-module-enabled.test.ts` PASS — disabled → ModuleDisabledError, enabled → resolves, cache hit (DB mock called once)
- `vitest apps/web/lib/modules/__tests__/check-module-enabled.integration.test.ts` PASS — real DB toggle → middleware blocks
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`rm -rf apps/web/lib/modules/`
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/modules/__tests__/check-module-enabled.test.ts` — disabled → ModuleDisabledError, enabled → resolves, cache hit verified
- **Integration:** `vitest apps/web/lib/modules/__tests__/check-module-enabled.integration.test.ts` — DB toggle → block/pass
- **CI gate:** `pnpm test:unit` green

### Rollback
`rm -rf apps/web/lib/modules/`
## T-02SETa-018 — Server Actions: toggleModule + toggleFeatureFlag

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 50 min
**Parent feature:** 02-SET-a Module toggles CRUD + Feature flags (§10.1, §10.2)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-016 — modules schema, T-02SETa-E01 — permissions enum, T-02SETa-E02 — events enum]
- **Downstream (will consume this):** [T-02SETa-019, T-02SETa-024]
- **Parallel (can run concurrently):** [T-02SETa-002, T-02SETa-003, T-02SETa-013]

### GIVEN / WHEN / THEN
**GIVEN** `organization_modules` and `feature_flags_core` tables exist; `SETTINGS_MODULES_TOGGLE` and `SETTINGS_FLAGS_UPDATE` permissions exist in enum
**WHEN** org owner calls `toggleModule(orgId, moduleCode, enabled, force?)` or `toggleFeatureFlag(tenantId, flagKey, isEnabled)`
**THEN** `organization_modules.is_enabled` or `feature_flags_core.is_enabled` updated in DB; V-SET-40 dependency chain check: disabling module A when module B depends on A and B is still enabled → returns `{ type: 'DEPENDENCY_CHAIN_WARNING', affectedModules: string[] }` unless `force=true`; `insertAuditLog()` called; `insertOutboxEvent()` called with correct event type; RBAC guard enforced; V-SET-42 check on `integration.d365.enabled` flip

### ACP Prompt
````
# Task T-02SETa-018 — Server Actions: toggleModule + toggleFeatureFlag

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-modules.ts` → Drizzle schema dla `organization_modules`, `feature_flags_core`, `modules`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → znajdź `SETTINGS_MODULES_TOGGLE`, `SETTINGS_FLAGS_UPDATE` permission strings
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/outbox/events.enum.ts` → znajdź `SETTINGS_MODULE_ENABLED`, `SETTINGS_MODULE_DISABLED`, `SETTINGS_FLAG_UPDATED` event types
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/` → wzorzec istniejących Server Actions (audit + outbox pattern)

## Twoje zadanie
Utwórz Server Actions dla module toggles + feature flags. Wszystkie concrete values INLINE poniżej.

**Permission strings:**
```ts
SETTINGS_MODULES_TOGGLE = 'settings:modules:toggle'
SETTINGS_FLAGS_UPDATE = 'settings:flags:update'
```

**Event types:**
```ts
SETTINGS_MODULE_ENABLED = 'settings.module.enabled'
SETTINGS_MODULE_DISABLED = 'settings.module.disabled'
SETTINGS_FLAG_UPDATED = 'settings.feature_flag.updated'
```

**Module dependency check:** Moduły nie mają currently `depends_on` FK w schemacie — sprawdź zależności przez hard-coded mapę w akcji (lub lekki JSONB `conditions` w `feature_flags_core`). Zaimplementuj dependency map:
```ts
const MODULE_DEPENDENCIES: Record<string, string[]> = {
  // moduleCode → list of module codes that DEPEND ON this module
  'npd':        ['planning'],
  'warehouse':  ['shipping'],
  'production': ['quality', 'oee'],
  'quality':    [],
  'finance':    [],
  'settings_advanced': [],
  // ... pozostałe bez dependantów
}
```

## Implementacja

1. Utwórz `apps/web/app/actions/settings/module-actions.ts`:
```ts
"use server"
import { db } from '@/drizzle/db'
import { organizationModules, featureFlagsCore, modules } from '@/drizzle/schema/settings-modules'
import { and, eq, inArray } from 'drizzle-orm'
import { Permission } from '@/lib/rbac/permissions.enum'
import { EventType } from '@/lib/outbox/events.enum'
import { insertAuditLog } from '@/lib/audit/insert-audit-log'
import { insertOutboxEvent } from '@/lib/outbox/insert-outbox-event'
import { requirePermission } from '@/lib/rbac/require-permission'
import { moduleToggleSchema, featureFlagSchema } from '@/lib/validators/modules'

const MODULE_DEPENDENCIES: Record<string, string[]> = {
  npd: ['planning'],
  warehouse: ['shipping'],
  production: ['quality', 'oee'],
  quality: [], finance: [], shipping: [],
  reporting: [], maintenance: [], multi_site: [],
  oee: [], settings_advanced: [], scanner: [],
  planning: [], crm: [], purchasing: [],
}

export async function toggleModule(
  orgId: string,
  moduleCode: string,
  enabled: boolean,
  force = false
): Promise<{ success: boolean } | { type: 'DEPENDENCY_CHAIN_WARNING'; affectedModules: string[] }> {
  const ctx = await requirePermission(Permission.SETTINGS_MODULES_TOGGLE)

  const parsed = moduleToggleSchema.parse({ orgId, moduleCode, enabled, force })

  // V-SET-40: dependency chain check when disabling
  if (!enabled && !force) {
    const dependants = MODULE_DEPENDENCIES[moduleCode] ?? []
    if (dependants.length > 0) {
      const enabledDependants = await db.query.organizationModules.findMany({
        where: and(
          eq(organizationModules.org_id, orgId),
          eq(organizationModules.is_enabled, true),
          inArray(organizationModules.module_code, dependants)
        ),
        columns: { module_code: true },
      })
      if (enabledDependants.length > 0) {
        return {
          type: 'DEPENDENCY_CHAIN_WARNING',
          affectedModules: enabledDependants.map(r => r.module_code),
        }
      }
    }
  }

  await db.update(organizationModules)
    .set({ is_enabled: enabled, enabled_at: new Date(), enabled_by: ctx.userId })
    .where(and(eq(organizationModules.org_id, orgId), eq(organizationModules.module_code, moduleCode)))

  const eventType = enabled ? EventType.SETTINGS_MODULE_ENABLED : EventType.SETTINGS_MODULE_DISABLED

  await insertAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: eventType,
    resourceType: 'module',
    resourceId: moduleCode,
  })
  await insertOutboxEvent(ctx.tenantId, eventType, 'module', moduleCode, { orgId, moduleCode, enabled })

  return { success: true }
}

export async function toggleFeatureFlag(
  tenantId: string,
  flagKey: string,
  isEnabled: boolean,
  rolloutPercentage?: number
): Promise<{ success: boolean }> {
  const ctx = await requirePermission(Permission.SETTINGS_FLAGS_UPDATE)

  const parsed = featureFlagSchema.parse({ tenantId, flagKey, isEnabled, rolloutPercentage })

  // V-SET-42: integration.d365.enabled requires 5 d365_constants populated
  if (flagKey === 'integration.d365.enabled' && isEnabled) {
    const { referenceData } = await import('@/drizzle/schema/settings-reference')
    const d365Count = await db.query.referenceData.findMany({
      where: and(
        eq(referenceData.table_code, 'd365_constants'),
        eq(referenceData.tenant_id, tenantId)
      ),
      columns: { id: true },
    })
    if (d365Count.length < 5) {
      throw new Error('V-SET-42: integration.d365.enabled requires 5 d365_constants rows populated')
    }
  }

  await db.insert(featureFlagsCore)
    .values({ flag_key: flagKey, tenant_id: tenantId, is_enabled: isEnabled, rollout_percentage: rolloutPercentage })
    .onConflictDoUpdate({
      target: [featureFlagsCore.flag_key, featureFlagsCore.tenant_id],
      set: { is_enabled: isEnabled, rollout_percentage: rolloutPercentage },
    })

  await insertAuditLog({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: EventType.SETTINGS_FLAG_UPDATED,
    resourceType: 'feature_flag',
    resourceId: flagKey,
  })
  await insertOutboxEvent(ctx.tenantId, EventType.SETTINGS_FLAG_UPDATED, 'feature_flag', flagKey, { flagKey, isEnabled })

  return { success: true }
}
```

2. Utwórz testy `apps/web/app/actions/settings/__tests__/module-actions.test.ts`:
- RBAC guard: brak `SETTINGS_MODULES_TOGGLE` → throws Unauthorized
- `toggleModule` disabled + dependants enabled + force=false → returns `DEPENDENCY_CHAIN_WARNING`
- `toggleModule` disabled + force=true → proceeds, audit called, outbox called
- `toggleFeatureFlag` `integration.d365.enabled=true` z < 5 constants → throws V-SET-42

3. Utwórz integration test `apps/web/app/actions/settings/__tests__/module-actions.integration.test.ts`:
Z `supabaseLocalDb` fixture — toggle → DB updated + audit_log row + outbox_events row

## Files
**Create:** `apps/web/app/actions/settings/module-actions.ts`, `apps/web/app/actions/settings/__tests__/module-actions.test.ts`, `apps/web/app/actions/settings/__tests__/module-actions.integration.test.ts`

## Done when
- `vitest apps/web/app/actions/settings/__tests__/module-actions.test.ts` PASS — RBAC guard, dependency chain warning, V-SET-42 enforcement
- `vitest apps/web/app/actions/settings/__tests__/module-actions.integration.test.ts` PASS — toggle → DB updated + audit + outbox
- `pnpm test:unit` green

- `pnpm test:smoke` green
## Rollback
`rm apps/web/app/actions/settings/module-actions.ts`
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/module-actions.test.ts` — RBAC, dependency chain, V-SET-42
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/module-actions.integration.test.ts` — DB update + audit + outbox
- **CI gate:** `pnpm test:unit` green

### Rollback
`rm apps/web/app/actions/settings/module-actions.ts`
## T-02SETa-019 — UI: ModuleTogglesGrid + FeatureFlagsForm

**Type:** T3-ui
**Context budget:** ~65k tokens
**Est time:** 80 min
**Parent feature:** 02-SET-a Module toggles UI (§10.3)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** none — no prototype exists

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-018 — module toggle actions, T-02SETa-020 — i18n scaffold]
- **Downstream (will consume this):** [T-02SETa-024]
- **Parallel (can run concurrently):** [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-014]

### GIVEN / WHEN / THEN
**GIVEN** `toggleModule` and `toggleFeatureFlag` Server Actions exist; 15 modules seeded; next-intl scaffold in place
**WHEN** owner navigates to `/settings/modules`
**THEN** `<ModuleTogglesGrid />` renders 15 modules grouped by category (core/advanced/add-on) as Card grid with category badge, module display_name, Toggle switch; disabled state: switch greyed; dependency chain warning: AlertDialog lists affected modules + "Disable all" + "Cancel"; `<FeatureFlagsForm />` renders 4 core flags (maintenance_mode, integration.d365.enabled, beta_features, debug_mode) as labeled Switch rows; V-SET-42 tooltip on d365 flag; loading via Skeleton; all labels via next-intl keys `settings.modules.*`

### ACP Prompt
````
# Task T-02SETa-019 — UI: ModuleTogglesGrid + FeatureFlagsForm

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/module-actions.ts` → `toggleModule`, `toggleFeatureFlag` function signatures
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/messages/en.json` → znajdź sekcję `settings.modules` — dostępne i18n klucze
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/components/settings/` → wzorzec istniejących settings komponentów

## Twoje zadanie
Zbuduj `<ModuleTogglesGrid />` i `<FeatureFlagsForm />` dla `/settings/modules`.

## Prototype reference
Plik: `design/Monopilot Design System/settings/` — brak bezpośredniego prototypu dla module toggles grid.
Translation checklist:
- [ ] Use shadcn Switch component for toggle — NOT custom HTML
- [ ] Wire toggleModule Server Action with useTransition
- [ ] Wire toggleFeatureFlag Server Action with useTransition
- [ ] Replace hardcoded labels → next-intl `useTranslations('settings.modules')`

**shadcn/Radix imports wymagane:**
```ts
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
```

**next-intl keys (w `apps/web/messages/en.json` sekcja `settings.modules`):**
```json
{
  "settings": {
    "modules": {
      "title": "Module Management",
      "category_core": "Core",
      "category_advanced": "Advanced",
      "category_addon": "Add-On",
      "toggle_enable": "Enable",
      "toggle_disable": "Disable",
      "dependency_warning_title": "Dependency Warning",
      "dependency_warning_desc": "Disabling this module will also affect: {{modules}}",
      "disable_all": "Disable All",
      "cancel": "Cancel",
      "flags_title": "Feature Flags",
      "flag_maintenance_mode": "Maintenance Mode",
      "flag_d365_integration": "D365 Integration",
      "flag_beta_features": "Beta Features",
      "flag_debug_mode": "Debug Mode",
      "flag_d365_tooltip": "Requires 5 D365 constants populated before enabling"
    }
  }
}
```

## Implementacja

1. Utwórz `apps/web/components/settings/modules/ModuleTogglesGrid.tsx`:
```tsx
"use client"
import { useTransition, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toggleModule } from '@/app/actions/settings/module-actions'
// ... shadcn imports above

type Module = {
  code: string
  display_name: string
  category: 'core' | 'advanced' | 'add-on'
  is_enabled: boolean
}

type Props = { modules: Module[]; orgId: string }

export function ModuleTogglesGrid({ modules, orgId }: Props) {
  const t = useTranslations('settings.modules')
  const [isPending, startTransition] = useTransition()
  const [pendingToggle, setPendingToggle] = useState<{ moduleCode: string; enabled: boolean } | null>(null)
  const [dependencyWarning, setDependencyWarning] = useState<{ moduleCode: string; affectedModules: string[] } | null>(null)

  const categories = ['core', 'advanced', 'add-on'] as const
  const grouped = categories.map(cat => ({
    category: cat,
    modules: modules.filter(m => m.category === cat),
  }))

  async function handleToggle(moduleCode: string, enabled: boolean, force = false) {
    startTransition(async () => {
      const result = await toggleModule(orgId, moduleCode, enabled, force)
      if ('type' in result && result.type === 'DEPENDENCY_CHAIN_WARNING') {
        setDependencyWarning({ moduleCode, affectedModules: result.affectedModules })
      }
    })
  }

  return (
    <div className="space-y-6">
      {grouped.map(({ category, modules: catModules }) => (
        <div key={category}>
          <Badge variant="outline" className="mb-3">{t(`category_${category.replace('-', '')}`)}</Badge>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catModules.map(mod => (
              <Card key={mod.code}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{mod.display_name}</CardTitle>
                  <Switch
                    checked={mod.is_enabled}
                    disabled={isPending}
                    onCheckedChange={(val) => handleToggle(mod.code, val)}
                    aria-label={`${val => val ? t('toggle_enable') : t('toggle_disable')} ${mod.display_name}`}
                  />
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {dependencyWarning && (
        <AlertDialog open onOpenChange={() => setDependencyWarning(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('dependency_warning_title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('dependency_warning_desc', { modules: dependencyWarning.affectedModules.join(', ') })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  handleToggle(dependencyWarning.moduleCode, false, true)
                  setDependencyWarning(null)
                }}
              >
                {t('disable_all')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
```

2. Utwórz `apps/web/components/settings/modules/FeatureFlagsForm.tsx`:
- 4 Switch rows: `maintenance_mode`, `integration.d365.enabled`, `beta_features`, `debug_mode`
- d365 flag ma Tooltip z `flag_d365_tooltip` message
- Każdy switch: `useTransition` + `toggleFeatureFlag` action
- Loading state: `<Skeleton className="h-10 w-full" />`
- Error state: `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`

3. Utwórz `apps/web/app/(settings)/modules/page.tsx`:
Server Component — fetches modules list via Drizzle, passes to `<ModuleTogglesGrid />` and `<FeatureFlagsForm />`

4. Utwórz unit test `apps/web/components/settings/modules/__tests__/ModuleTogglesGrid.test.tsx`:
- render z `is_enabled: false` na module z dependantami → after toggle click → AlertDialog shows `affectedModules`
- render z `is_enabled: false` na standalone module → toggle → no AlertDialog

5. Dodaj i18n klucze do `apps/web/messages/en.json` i `apps/web/messages/pl.json`
PL wartości: `"__TODO_PL__"`

## Files
**Create:** `apps/web/components/settings/modules/ModuleTogglesGrid.tsx`, `apps/web/components/settings/modules/FeatureFlagsForm.tsx`, `apps/web/app/(settings)/modules/page.tsx`, `apps/web/components/settings/modules/__tests__/ModuleTogglesGrid.test.tsx`
**Modify:** `apps/web/messages/en.json` — dodaj `settings.modules.*` keys; `apps/web/messages/pl.json` — dodaj placeholder keys

## Done when
- `vitest apps/web/components/settings/modules/__tests__/ModuleTogglesGrid.test.tsx` PASS — AlertDialog shown on dependent module disable
- `playwright apps/web/e2e/settings/modules.spec.ts` PASS — owner toggles off independent module → re-enable works
- `pnpm test:smoke` green

## Rollback
`rm -rf apps/web/components/settings/modules/`; revert message files
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/modules/__tests__/ModuleTogglesGrid.test.tsx` — AlertDialog on dependent disable
- **E2E:** `playwright apps/web/e2e/settings/modules.spec.ts` — toggle flow
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/components/settings/modules/`; revert message files
## T-02SETa-020 — i18n scaffolding: next-intl config + EN full keys + PL placeholders

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a i18n scaffolding (§14.2)
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00a-005 — monorepo scaffold]
- **Downstream (will consume this):** [T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-010, T-02SETa-014, T-02SETa-019, all T3 tasks]
- **Parallel (can run concurrently):** [T-02SETa-001, T-02SETa-011, T-02SETa-016]

### GIVEN / WHEN / THEN
**GIVEN** Next.js monorepo scaffold exists; `next-intl` package available
**WHEN** i18n scaffold task is applied
**THEN** `apps/web/i18n.ts` defines locales `['en', 'pl']` with defaultLocale `'en'`; next-intl plugin added to `apps/web/next.config.ts`; `apps/web/middleware.ts` extended with intl middleware; message files `apps/web/messages/en.json` and `apps/web/messages/pl.json` exist with all E-1 key namespaces; EN values are production-ready English strings; PL values are `"__TODO_PL__"` placeholders; `pnpm lint:i18n` detects missing keys; `useTranslations('settings.orgs')` compiles without error

### ACP Prompt
````
# Task T-02SETa-020 — i18n scaffolding: next-intl config + EN full keys + PL placeholders

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/next.config.ts` → cały plik — current Next.js config to modify
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/middleware.ts` → current middleware to extend
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → sprawdź czy next-intl zainstalowany

## Twoje zadanie
Skonfiguruj next-intl dla monopilot-kira z pełnymi EN kluczami i PL placeholderami dla E-1 scope.

## Implementacja

1. Utwórz `apps/web/i18n.ts`:
```ts
import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`@/messages/${locale}.json`)).default
}))
```

2. Zmodyfikuj `apps/web/next.config.ts`:
Dodaj:
```ts
import createNextIntlPlugin from 'next-intl/plugin'
const withNextIntl = createNextIntlPlugin()
export default withNextIntl(nextConfig)
```

3. Zmodyfikuj `apps/web/middleware.ts` — dodaj do istniejącego middleware:
```ts
import createIntlMiddleware from 'next-intl/middleware'

const intlMiddleware = createIntlMiddleware({
  locales: ['en', 'pl'],
  defaultLocale: 'en'
})

// Combine with existing middleware chain
```

4. Utwórz `apps/web/messages/en.json` z PEŁNYMI EN kluczami dla wszystkich E-1 namespaces:
```json
{
  "settings": {
    "nav": {
      "organizations": "Organizations",
      "users": "Users",
      "roles": "Roles & Permissions",
      "security": "Security",
      "reference": "Reference Data",
      "modules": "Modules",
      "flags": "Feature Flags"
    },
    "orgs": {
      "title": "Organization Settings",
      "name": "Organization Name",
      "slug": "Slug",
      "logo": "Logo",
      "timezone": "Timezone",
      "locale": "Default Locale",
      "save": "Save Changes",
      "saved": "Changes saved",
      "error": "Failed to save changes"
    },
    "users": {
      "title": "Users",
      "invite": "Invite User",
      "email": "Email",
      "name": "Name",
      "role": "Role",
      "status": "Status",
      "active": "Active",
      "inactive": "Inactive",
      "invited": "Invited",
      "remove": "Remove",
      "confirm_remove": "Are you sure you want to remove this user?"
    },
    "roles": {
      "title": "Roles & Permissions",
      "create": "Create Role",
      "name": "Role Name",
      "description": "Description",
      "permissions": "Permissions",
      "save": "Save Role",
      "delete": "Delete Role",
      "confirm_delete": "Are you sure you want to delete this role?"
    },
    "security": {
      "title": "Security",
      "password_policy": "Password Policy",
      "min_length": "Minimum Length",
      "require_uppercase": "Require Uppercase",
      "require_numbers": "Require Numbers",
      "require_symbols": "Require Symbols",
      "history_count": "Password History",
      "session_timeout": "Session Timeout (minutes)",
      "mfa": "Multi-Factor Authentication",
      "mfa_optional": "Optional",
      "mfa_required_admins": "Required for Admins",
      "mfa_required_all": "Required for All",
      "save": "Save Security Settings"
    },
    "reference": {
      "title": "Reference Data",
      "add_row": "Add Row",
      "edit_row": "Edit Row",
      "delete_row": "Delete Row",
      "confirm_delete": "Are you sure you want to delete this row?",
      "code": "Code",
      "name": "Name",
      "description": "Description",
      "is_active": "Active",
      "display_order": "Display Order",
      "save": "Save",
      "cancel": "Cancel"
    },
    "modules": {
      "title": "Module Management",
      "category_core": "Core",
      "category_advanced": "Advanced",
      "category_addon": "Add-On",
      "toggle_enable": "Enable",
      "toggle_disable": "Disable",
      "dependency_warning_title": "Dependency Warning",
      "dependency_warning_desc": "Disabling this module will also affect: {modules}",
      "disable_all": "Disable All",
      "cancel": "Cancel",
      "flags_title": "Feature Flags",
      "flag_maintenance_mode": "Maintenance Mode",
      "flag_d365_integration": "D365 Integration",
      "flag_beta_features": "Beta Features",
      "flag_debug_mode": "Debug Mode",
      "flag_d365_tooltip": "Requires 5 D365 constants populated before enabling"
    }
  },
  "npd": {
    "nav": {
      "items": "Products",
      "bom": "Bill of Materials",
      "recipes": "Recipes",
      "approvals": "Approvals"
    },
    "items": {
      "title": "Products",
      "create": "New Product",
      "code": "Product Code",
      "name": "Product Name",
      "type": "Type",
      "status": "Status"
    }
  },
  "common": {
    "actions": {
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "edit": "Edit",
      "create": "Create",
      "close": "Close",
      "confirm": "Confirm",
      "back": "Back",
      "next": "Next",
      "loading": "Loading..."
    },
    "status": {
      "active": "Active",
      "inactive": "Inactive",
      "pending": "Pending",
      "draft": "Draft",
      "published": "Published"
    },
    "errors": {
      "required": "This field is required",
      "invalid_email": "Invalid email address",
      "too_short": "Too short",
      "too_long": "Too long",
      "generic": "An error occurred. Please try again."
    }
  }
}
```

5. Utwórz `apps/web/messages/pl.json` — wszystkie klucze identyczne jak EN, wartości = `"__TODO_PL__"`:
Wygeneruj programatycznie — każda wartość string zastąpiona przez `"__TODO_PL__"` (zachowaj strukturę JSON).

   - Utwórz `apps/web/scripts/lint-i18n.ts`:
   - Utwórz unit test `apps/web/lib/i18n/__tests__/i18n.test.ts`:
## Files
**Create:** `apps/web/i18n.ts`, `apps/web/messages/en.json`, `apps/web/messages/pl.json`, `apps/web/scripts/lint-i18n.ts`, `apps/web/lib/i18n/__tests__/i18n.test.ts`
**Modify:** `apps/web/next.config.ts` — add next-intl plugin; `apps/web/middleware.ts` — add intl middleware; `apps/web/package.json` — add `lint:i18n` script

## Done when
- `vitest apps/web/lib/i18n/__tests__/i18n.test.ts` PASS — EN loads, PL has all keys
- `pnpm lint:i18n` green — no missing keys reported
- `pnpm build` PASS — next-intl plugin loaded without errors

- `pnpm test:smoke` green
## Rollback
Remove next-intl plugin from `apps/web/next.config.ts`; remove intlMiddleware from `apps/web/middleware.ts`; delete message files and `i18n.ts`
````
### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/i18n/__tests__/i18n.test.ts` — EN translations load, PL has all EN keys
- **CI gate:** `pnpm lint:i18n` green — all EN keys present in PL file

### Rollback
`git revert HEAD --no-edit`

## T-02SETa-021 — Seed: 15 modules + organization_modules backfill

**Type:** T5-seed
**Context budget:** ~30k tokens
**Est time:** 30 min
**Parent feature:** 02-SET-a Module toggles seed
**Agent:** any
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-016 — modules schema]
- **Downstream (will consume this):** [T-02SETa-024]
- **Parallel (can run concurrently):** [T-02SETa-012, T-02SETa-027]

### GIVEN / WHEN / THEN
**GIVEN** `modules` and `organization_modules` tables exist post T-02SETa-016 migration
**WHEN** `pnpm seed:settings-modules` runs
**THEN** exactly 15 rows in `modules` with correct codes (npd, warehouse, production, quality, finance, shipping, reporting, maintenance, multi_site, oee, settings_advanced, scanner, planning, crm, purchasing); each test org in `organization_modules` has `org_id × 15` rows backfilled; snapshot `settings-modules-baseline` registered; seed script idempotent (re-run safe with ON CONFLICT DO NOTHING)

### ACP Prompt
````
# Task T-02SETa-021 — Seed: 15 modules + organization_modules backfill

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-modules.ts` → definicje tabel `modules` i `organizationModules`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-identity.ts` → tabela `organizations` używana do backfill `organization_modules`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/seed/index.ts` → wzorzec rejestracji seedów i kolejność wykonywania
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → istniejące skrypty seed / smoke

## Twoje zadanie
Utwórz typed Drizzle seed dla 15 modułów systemowych i backfill `organization_modules` dla każdej istniejącej organizacji.
Seed ma być typu T5-seed, używać patternu `seed/<feature>-seed.ts`, mieć factory functions do testów oraz być bezpieczny przy ponownym uruchomieniu.
Musisz zasiać dokładnie te kody modułów:
`npd`, `warehouse`, `production`, `quality`, `finance`, `shipping`, `reporting`, `maintenance`, `multi_site`, `oee`, `settings_advanced`, `scanner`, `planning`, `crm`, `purchasing`

## Implementacja
1. Utwórz `apps/web/seed/settings-modules-seed.ts` z typed stałą `MODULES_DATA` dla wszystkich 15 modułów oraz helperem typu `createModuleInsert(overrides?: Partial<typeof modules.$inferInsert>)`.
   Każdy rekord ma zawierać co najmniej `code`, `displayName`/`display_name`, `description`, `category`, `isCore`/`is_core` zgodnie ze schemą z `apps/web/drizzle/schema/settings-modules.ts`.
2. W `apps/web/seed/settings-modules-seed.ts` zaimplementuj `seedSettingsModules()` używające Drizzle typed insert do tabeli `modules` z idempotencją (`onConflictDoNothing()` albo równoważny mechanizm po unikalnym `code`).
   Dodaj komentarz baseline w tym pliku albo w rejestracji seeda: `// Snapshot: settings-modules-baseline`.
3. W `apps/web/seed/settings-modules-seed.ts` wykonaj backfill `organization_modules`: pobierz wszystkie organizacje z `apps/web/drizzle/schema/settings-identity.ts`, zbuduj relacje `org_id × 15 modules` i wstaw je typed insertem bez raw SQL.
   Backfill ma być re-run safe i nie może tworzyć duplikatów dla tej samej pary organizacja+moduł.
4. Zmodyfikuj `apps/web/seed/index.ts`, aby zarejestrować `seedSettingsModules()` w pipeline seedów, oraz zmodyfikuj `apps/web/package.json`, dodając skrypt:
   `"seed:settings-modules": "tsx apps/web/seed/settings-modules-seed.ts"`
5. Utwórz `apps/web/seed/__tests__/settings-modules-seed.test.ts` i dodaj testy: po jednym run count `modules` = 15, po drugim run nadal 15, `organization_modules` = liczba organizacji testowych × 15, a rekord z kodem `settings_advanced` istnieje.

## Files
**Create:** `apps/web/seed/settings-modules-seed.ts`
**Create:** `apps/web/seed/__tests__/settings-modules-seed.test.ts`
**Modify:** `apps/web/seed/index.ts`
**Modify:** `apps/web/package.json`

## Done when
- `vitest apps/web/seed/__tests__/settings-modules-seed.test.ts` PASS — 15 modułów obecnych, backfill count poprawny, re-run idempotentny
- `pnpm seed:settings-modules` exits 0
- `pnpm test:smoke` green

## Rollback
`pnpm supabase db reset`
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/seed/__tests__/settings-modules-seed.test.ts` — 15 modules, org_modules backfill counts correct
- **CI gate:** `pnpm seed:settings-modules` green

### Rollback
`DELETE FROM organization_modules; DELETE FROM modules;`
## T-02SETa-022 — UI: reference tables ref_row_edit_modal reuse validation + E2E

**Type:** T4-wiring+test
**Context budget:** ~50k tokens
**Est time:** 60 min
**Parent feature:** 02-SET-a Reference CRUD validation (§8.6 SET-052)
**Agent:** test-specialist
**Status:** pending

**Prototype ref:** `ref_row_edit_modal` — `design/Monopilot Design System/settings/modals.jsx` lines 535-572
  - component_type: modal
  - ui_pattern: crud-form-with-validation
  - shadcn_equivalent: Dialog, Form, Input, Switch, Button
  - estimated_translation_time_min: 45

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-014 — GenericRefTable + RefRowEditModal]
- **Downstream (will consume this):** [T-02SETa-025]
- **Parallel (can run concurrently):** [T-02SETa-019]

### GIVEN / WHEN / THEN
**GIVEN** `<RefRowEditModal />` and `<GenericRefTable />` implemented; 7 reference tables seeded (dept_columns, pack_sizes, lines_by_pack_size, dieset_by_line_pack, templates, processes, close_confirm)
**WHEN** Playwright E2E runs `e2e/settings/reference-all-tables.spec.ts`
**THEN** each of the 7 tables: create 1 row succeeds → row appears in table; edit row succeeds → table reflects update; delete row shows confirmation → row removed; validation errors displayed inline via FormMessage for required fields; boolean field (`close_confirm`) renders as Switch; dropdown_source field (`dieset_by_line_pack`) renders as Select populated from linked table; `display_order` numeric input available on all modals; `is_active` Switch present on all modals

### ACP Prompt
````
# Task T-02SETa-022 — Reference tables ref_row_edit_modal reuse validation + E2E

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/components/settings/reference/RefRowEditModal.tsx` → cały plik — current modal implementation to validate/fix
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/components/settings/reference/GenericRefTable.tsx` → cały plik — table component
- `design/Monopilot Design System/settings/modals.jsx` linie 535-572 → prototype `ref_row_edit_modal`

## Twoje zadanie
Validate that `RefRowEditModal` handles all 7 reference table schemas correctly. Fix any gaps. Write full Playwright E2E coverage.

**7 tables to cover:**
1. `dept_columns` — text fields, display_order
2. `pack_sizes` — code TEXT + regex validation, display_order
3. `lines_by_pack_size` — text + is_active Switch
4. `dieset_by_line_pack` — dropdown_source → Select from `lines_by_pack_size`
5. `templates` — multi-text field
6. `processes` — text enum (Strip/A, Coat/B, Honey/C, Smoke/E, Slice/F, Tumble/G, Dice/H, Roast/R)
7. `close_confirm` — boolean → Switch

## Implementacja

1. Verify/fix `apps/web/components/settings/reference/RefRowEditModal.tsx` for boolean field support:
Translation checklist from prototype:
- [ ] `window.Modal` → already using `@radix-ui/react-dialog Dialog` (verify)
- [ ] Local `useState` per field → already using `useForm + zodResolver` (verify)
- [ ] Boolean column type → renders as `shadcn Switch` (add if missing)
- [ ] `dropdown_source` column → renders as `<Select>` populated from `mv_reference_lookup` view for source table (add if missing)
- [ ] `display_order` → numeric `<Input type="number">` on all modals
- [ ] `is_active` → `<Switch>` on all modals
- [ ] Hardcoded labels → next-intl keys `settings.reference.*`

2. Fix `apps/web/components/settings/reference/RefRowEditModal.tsx` if boolean rendering missing:
```tsx
// In field renderer — add boolean branch:
case 'boolean':
  return (
    <FormField
      key={field.column_name}
      control={form.control}
      name={field.column_name}
      render={({ field: f }) => (
        <FormItem className="flex items-center justify-between">
          <FormLabel>{t(`reference.${field.column_name}`)}</FormLabel>
          <FormControl>
            <Switch checked={f.value} onCheckedChange={f.onChange} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
```

3. Fix `apps/web/components/settings/reference/RefRowEditModal.tsx` if dropdown_source rendering missing:
```tsx
case 'dropdown_source':
  // Populate from mv_reference_lookup where source_table = field.dropdown_source
  return (
    <FormField
      key={field.column_name}
      control={form.control}
      name={field.column_name}
      render={({ field: f }) => (
        <FormItem>
          <FormLabel>{t(`reference.${field.column_name}`)}</FormLabel>
          <Select onValueChange={f.onChange} defaultValue={f.value}>
            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              {lookupData[field.dropdown_source]?.map(opt => (
                <SelectItem key={opt.code} value={opt.code}>{opt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
```

4. Utwórz Playwright spec `apps/web/e2e/settings/reference-all-tables.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

const TABLES = [
  'dept_columns', 'pack_sizes', 'lines_by_pack_size',
  'dieset_by_line_pack', 'templates', 'processes', 'close_confirm'
]

test.describe('Reference tables CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/reference')
  })

  for (const tableName of TABLES) {
    test(`${tableName}: create row → appears in table`, async ({ page }) => {
      await page.getByRole('tab', { name: tableName }).click()
      await page.getByRole('button', { name: 'Add Row' }).click()
      // Fill first required field
      await page.getByLabel('Code').fill(`test-${tableName}`)
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText(`test-${tableName}`)).toBeVisible()
    })

    test(`${tableName}: validation error on empty required field`, async ({ page }) => {
      await page.getByRole('tab', { name: tableName }).click()
      await page.getByRole('button', { name: 'Add Row' }).click()
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByText('This field is required')).toBeVisible()
    })
  }

  test('close_confirm: boolean field renders as Switch', async ({ page }) => {
    await page.getByRole('tab', { name: 'close_confirm' }).click()
    await page.getByRole('button', { name: 'Add Row' }).click()
    await expect(page.getByRole('switch')).toBeVisible()
  })

  test('dieset_by_line_pack: dropdown_source renders as Select', async ({ page }) => {
    await page.getByRole('tab', { name: 'dieset_by_line_pack' }).click()
    await page.getByRole('button', { name: 'Add Row' }).click()
    await expect(page.getByRole('combobox')).toBeVisible()
  })
})
```

5. Utwórz unit test `apps/web/components/settings/reference/__tests__/RefRowEditModal.test.tsx`:
- boolean column definition → `<Switch>` rendered in modal
- dropdown_source column definition → `<Select>` rendered with lookup options

**Integration test constraint:** Użyj `supabaseLocalDb` fixture (zero DB mocks) dla integration testów.
**RLS test:** `createClient({ userId: testUser.id })` — cross-tenant access blocked.

## Files
**Modify:** `apps/web/components/settings/reference/RefRowEditModal.tsx` — add boolean Switch support + dropdown_source Select support + display_order field
**Create:** `apps/web/e2e/settings/reference-all-tables.spec.ts`, `apps/web/components/settings/reference/__tests__/RefRowEditModal.test.tsx`
**Modify:** `apps/web/messages/en.json`, `apps/web/messages/pl.json` — add any missing reference field labels

## Done when
- `vitest apps/web/components/settings/reference/__tests__/RefRowEditModal.test.tsx` PASS — boolean → Switch, dropdown_source → Select
- `playwright apps/web/e2e/settings/reference-all-tables.spec.ts` PASS — all 7 tables: create row + validation error
- `pnpm test:smoke` green

## Rollback
Revert `apps/web/components/settings/reference/RefRowEditModal.tsx` to pre-task state; delete new spec file
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/reference/__tests__/RefRowEditModal.test.tsx` — boolean → Switch, dropdown_source → Select
- **E2E:** `playwright apps/web/e2e/settings/reference-all-tables.spec.ts` — all 7 tables CRUD + validation
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert HEAD --no-edit`

## T-02SETa-023 — i18n: user language preference + runtime switcher

**Type:** T3-ui
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a i18n user preference (§14.2)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** none — no prototype exists

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-020 — i18n scaffold, T-02SETa-003 — users Server Actions]
- **Downstream (will consume this):** [T-02SETa-028]
- **Parallel (can run concurrently):** [T-02SETa-019, T-02SETa-022]

### GIVEN / WHEN / THEN
**GIVEN** next-intl scaffold in place with `['en', 'pl']` locales; `users.preferred_locale` column exists
**WHEN** logged-in user clicks the language switcher in top navigation
**THEN** `<LanguageSwitcher />` renders `EN` and `PL` options; selecting calls `updateUserLocale(locale)` Server Action → updates `users.preferred_locale` in DB → sets `NEXT_LOCALE` cookie; page re-renders in selected language without full reload (next-intl hot switch via `router.replace()`); preference persists across sessions (read from DB on next login); V-SET-84: unsupported locale code rejected

### ACP Prompt
````
# Task T-02SETa-023 — i18n: user language preference + runtime switcher

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/i18n.ts` → next-intl config, locales list `['en', 'pl']`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-identity.ts` → znajdź `users` table — sprawdź czy `preferred_locale` kolumna istnieje; jeśli nie — dodaj migration
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/layout.tsx` → layout do modyfikacji (add LanguageSwitcher)

## Twoje zadanie
Utwórz `<LanguageSwitcher />` komponent + `updateUserLocale` Server Action + integracja z nawigacją.

## Prototype reference
Plik: `design/Monopilot Design System/settings/` — brak bezpośredniego prototypu; scanner module ma podobny wzorzec w `design/Monopilot Design System/scanner/` (linie 11256-11261).
Translation checklist:
- [ ] shadcn RadioGroup/RadioGroupItem for EN/PL options (nie zwykłe button)
- [ ] Wire `updateUserLocale` Server Action
- [ ] router.replace() po locale change (next-intl pattern)
- [ ] Replace hardcoded labels → next-intl `useTranslations('common.language')`

**Column spec dla `users.preferred_locale`:**
```sql
preferred_locale TEXT DEFAULT 'en' CHECK (preferred_locale IN ('en','pl'))
```
Jeśli kolumna nie istnieje w `users` table schema → utwórz migration `023-user-preferred-locale.sql`.

**Server Action spec:**
```ts
// apps/web/app/actions/settings/language-actions.ts
export async function updateUserLocale(locale: string): Promise<void>
// Validates: locale ∈ ['en', 'pl'] (V-SET-84 check)
// Updates: users.preferred_locale = locale WHERE id = ctx.userId
// Sets cookie: cookies().set('NEXT_LOCALE', locale, { path: '/', maxAge: 365 * 24 * 3600 })
```

**i18n klucze do dodania w `apps/web/messages/en.json`:**
```json
{
  "common": {
    "language": {
      "title": "Language",
      "en": "English",
      "pl": "Polish",
      "switch": "Switch Language"
    }
  }
}
```

**shadcn/Radix imports:**
```ts
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
```

## Implementacja

1. Sprawdź i dodaj `preferred_locale` do `apps/web/drizzle/schema/settings-identity.ts` jeśli brak:
Jeśli `apps/web/drizzle/schema/settings-identity.ts` nie ma `preferred_locale` w `users` table → dodaj:
```ts
preferred_locale: text('preferred_locale').default('en'),
```
Uruchom `pnpm drizzle-kit generate` → migration `023-user-preferred-locale.sql`.
Dodaj CHECK constraint do SQL: `CHECK (preferred_locale IN ('en','pl'))`.

2. Utwórz `apps/web/app/actions/settings/language-actions.ts`:
```ts
"use server"
import { db } from '@/drizzle/db'
import { users } from '@/drizzle/schema/settings-identity'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth/require-auth'

const SUPPORTED_LOCALES = ['en', 'pl'] as const
type Locale = typeof SUPPORTED_LOCALES[number]

export async function updateUserLocale(locale: string): Promise<void> {
  // V-SET-84: validate locale
  if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
    throw new Error(`V-SET-84: Unsupported locale "${locale}". Supported: ${SUPPORTED_LOCALES.join(', ')}`)
  }

  const ctx = await requireAuth()

  await db.update(users)
    .set({ preferred_locale: locale })
    .where(eq(users.id, ctx.userId))

  // Set next-intl locale cookie
  cookies().set('NEXT_LOCALE', locale, {
    path: '/',
    maxAge: 365 * 24 * 3600,
    httpOnly: false, // must be readable by client for next-intl
  })
}
```

3. Utwórz `apps/web/components/common/LanguageSwitcher.tsx`:
```tsx
"use client"
import { useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { updateUserLocale } from '@/app/actions/settings/language-actions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'pl', label: 'PL' },
]

export function LanguageSwitcher() {
  const t = useTranslations('common.language')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  async function handleLocaleChange(newLocale: string) {
    startTransition(async () => {
      await updateUserLocale(newLocale)
      // next-intl hot switch — replace path segment
      router.replace(pathname)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isPending}>
          {locale.toUpperCase()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {LOCALES.map(l => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => handleLocaleChange(l.code)}
            className={locale === l.code ? 'font-semibold' : ''}
          >
            {l.label} — {t(l.code)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

4. Dodaj `<LanguageSwitcher />` do `apps/web/app/layout.tsx` (lub głównego nav komponentu):
W nav header, obok user menu.

5. Utwórz testy w `apps/web/app/actions/settings/__tests__/language-actions.test.ts` i `apps/web/e2e/settings/language-switch.spec.ts`:

`apps/web/app/actions/settings/__tests__/language-actions.test.ts`:
- `updateUserLocale('de')` → throws V-SET-84 error
- `updateUserLocale('en')` → resolves, mock DB called, cookie set
- `updateUserLocale('pl')` → resolves

`apps/web/e2e/settings/language-switch.spec.ts`:
```ts
test('user switches EN→PL → UI labels update', async ({ page }) => {
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'EN' }).click()
  await page.getByRole('menuitem', { name: 'PL' }).click()
  // Check a known translation key changed
  await expect(page.getByText('Organizacje')).toBeVisible() // or any known PL string
})
```

   - Dodaj i18n klucze do `apps/web/messages/en.json` i `apps/web/messages/pl.json`
## Files
**Create:** `apps/web/app/actions/settings/language-actions.ts`, `apps/web/components/common/LanguageSwitcher.tsx`, `apps/web/app/actions/settings/__tests__/language-actions.test.ts`, `apps/web/e2e/settings/language-switch.spec.ts`
**Modify:** `apps/web/app/layout.tsx` (or nav component) — add LanguageSwitcher; `apps/web/drizzle/schema/settings-identity.ts` — add preferred_locale if missing; `apps/web/messages/en.json`, `apps/web/messages/pl.json` — add common.language keys
**Generated (if needed):** `apps/web/drizzle/migrations/023-user-preferred-locale.sql`

## Done when
- `vitest apps/web/app/actions/settings/__tests__/language-actions.test.ts` PASS — V-SET-84 invalid locale rejected, valid locale updates DB + cookie
- `playwright apps/web/e2e/settings/language-switch.spec.ts` PASS — EN→PL switch, UI labels update
- `pnpm test:smoke` green

## Rollback
Remove `<LanguageSwitcher />` from nav; delete `language-actions.ts`; revert schema if migration added
````

### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/language-actions.test.ts` — V-SET-84 invalid rejected, success updates DB + cookie
- **E2E:** `playwright apps/web/e2e/settings/language-switch.spec.ts` — EN→PL switch persists
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert HEAD --no-edit`

## T-02SETa-024 — E2E + Integration: Modules + i18n track wiring

**Type:** T4-wiring+test
**Context budget:** ~70k tokens
**Est time:** 70 min
**Parent feature:** 02-SET-a Modules/i18n full flow
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-019 — ModuleTogglesGrid, T-02SETa-023 — LanguageSwitcher, T-02SETa-021 — 15 modules seeded]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETa-025, T-02SETa-026]

### GIVEN / WHEN / THEN
**GIVEN** Module toggles grid + feature flags form + language switcher all implemented; 15 modules seeded; i18n scaffold complete
**WHEN** Playwright E2E + integration suite runs
**THEN** owner toggles off module `npd` → middleware `checkModuleEnabled` blocks subsequent NPD request with HTTP 403 `{ error: 'MODULE_DISABLED', moduleCode: 'npd' }`; dependency chain AlertDialog shown correctly; feature flag `maintenance_mode=true` blocks non-superadmin writes with 403; i18n completeness: all EN keys present in PL file; language switch EN→PL persists across browser sessions

### ACP Prompt
````
# Task T-02SETa-024 — E2E + Integration: Modules + i18n track wiring

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/modules/check-module-enabled.ts` → `checkModuleEnabled` function signature + `ModuleDisabledError`
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/module-actions.ts` → `toggleModule`, `toggleFeatureFlag` signatures
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/messages/en.json` → klucze do sprawdzenia w i18n completeness teście
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/e2e/` → wzorzec istniejących E2E specs

## Twoje zadanie
Napisz kompletną suitę testową dla S-γ track: module toggle enforcement, feature flag enforcement, i18n completeness.

## Implementacja

**Integration test constraint:** Użyj `supabaseLocalDb` fixture (zero DB mocks).
**RLS test pattern:** `createClient({ userId: testUser.id })` — cross-tenant access blocked.

1. Utwórz `apps/web/e2e/settings/modules.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test.describe('Module toggles flow', () => {
  test.use({ storageState: 'e2e/.auth/owner.json' })

  test('owner toggles off npd module → NPD route returns 403 MODULE_DISABLED', async ({ page, request }) => {
    // Navigate to modules page
    await page.goto('/settings/modules')

    // Toggle off npd
    const npdSwitch = page.getByTestId('module-toggle-npd')
    await npdSwitch.click()

    // Confirm (if no dependants) or force confirm
    // Wait for toggle to complete
    await expect(npdSwitch).not.toBeChecked()

    // Attempt NPD API request
    const response = await request.get('/api/npd/items')
    expect(response.status()).toBe(403)
    const body = await response.json()
    expect(body.error).toBe('MODULE_DISABLED')
    expect(body.moduleCode).toBe('npd')
  })

  test('owner attempts to disable module with active dependants → AlertDialog shown', async ({ page }) => {
    await page.goto('/settings/modules')

    // production has dependants: quality, oee
    const productionSwitch = page.getByTestId('module-toggle-production')
    await productionSwitch.click()

    // Dependency warning should appear
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByText('Dependency Warning')).toBeVisible()

    // Cancel — module stays enabled
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(productionSwitch).toBeChecked()
  })

  test('owner enables module → re-enable works correctly', async ({ page }) => {
    await page.goto('/settings/modules')
    const npdSwitch = page.getByTestId('module-toggle-npd')

    // Disable
    if (await npdSwitch.isChecked()) {
      await npdSwitch.click()
      await page.waitForTimeout(500)
    }
    // Re-enable
    await npdSwitch.click()
    await expect(npdSwitch).toBeChecked()
  })
})
```

2. Utwórz `apps/web/e2e/settings/feature-flags.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test.describe('Feature flags enforcement', () => {
  test.use({ storageState: 'e2e/.auth/owner.json' })

  test('enable maintenance_mode → non-admin write blocked with 403', async ({ page, request }) => {
    await page.goto('/settings/modules')

    // Enable maintenance_mode flag
    const maintenanceSwitch = page.getByTestId('feature-flag-maintenance_mode')
    if (!await maintenanceSwitch.isChecked()) {
      await maintenanceSwitch.click()
      await page.waitForTimeout(300)
    }

    // Attempt a write as non-admin user (use regular user auth)
    const regularUserRequest = await request.newContext({ storageState: 'e2e/.auth/user.json' })
    const response = await regularUserRequest.post('/api/npd/items', {
      data: { name: 'test' }
    })
    expect(response.status()).toBe(403)

    // Disable maintenance_mode
    await maintenanceSwitch.click()
    await page.waitForTimeout(300)
  })

  test('integration.d365.enabled flip without 5 constants → V-SET-42 error shown', async ({ page }) => {
    await page.goto('/settings/modules')
    const d365Switch = page.getByTestId('feature-flag-integration.d365.enabled')
    await d365Switch.click()
    await expect(page.getByText('V-SET-42')).toBeVisible()
  })
})
```

3. Utwórz `apps/web/tests/settings/i18n-completeness.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import enMessages from '../../messages/en.json'
import plMessages from '../../messages/pl.json'

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flattenKeys(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k)
      : [`${prefix ? `${prefix}.` : ''}${k}`]
  )
}

describe('i18n completeness', () => {
  it('all EN keys are present in PL file', () => {
    const enKeys = new Set(flattenKeys(enMessages))
    const plKeys = new Set(flattenKeys(plMessages))
    const missing = [...enKeys].filter(k => !plKeys.has(k))
    expect(missing, `Missing PL keys: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('EN values are non-empty strings (no accidental __TODO__ in EN)', () => {
    const enKeys = flattenKeys(enMessages)
    const todoKeys = enKeys.filter(k => {
      const val = k.split('.').reduce((obj: unknown, part) => (obj as Record<string, unknown>)?.[part], enMessages as unknown)
      return typeof val === 'string' && val.includes('__TODO__')
    })
    expect(todoKeys, `EN has TODO placeholders: ${todoKeys.join(', ')}`).toHaveLength(0)
  })

  it('settings.modules keys present in both EN and PL', () => {
    const moduleKeys = ['title', 'category_core', 'category_advanced', 'flags_title', 'dependency_warning_title']
    for (const key of moduleKeys) {
      const enVal = (enMessages as Record<string, unknown>)?.settings?.modules?.[key]
      expect(enVal, `EN settings.modules.${key} missing`).toBeTruthy()
      const plVal = (plMessages as Record<string, unknown>)?.settings?.modules?.[key]
      expect(plVal, `PL settings.modules.${key} missing`).toBeTruthy()
    }
  })
})
```


## Files
**Create:** `apps/web/e2e/settings/modules.spec.ts`, `apps/web/e2e/settings/feature-flags.spec.ts`, `apps/web/tests/settings/i18n-completeness.test.ts`

## Done when
- `playwright apps/web/e2e/settings/modules.spec.ts` PASS — npd disable → 403 MODULE_DISABLED, dependency AlertDialog, re-enable works
- `playwright apps/web/e2e/settings/feature-flags.spec.ts` PASS — maintenance mode → blocks writes, V-SET-42 error shown
- `vitest apps/web/tests/settings/i18n-completeness.test.ts` PASS — all EN keys in PL, no TODO in EN
- `pnpm test:smoke` green

## Rollback
Delete test files: `rm apps/web/e2e/settings/modules.spec.ts apps/web/e2e/settings/feature-flags.spec.ts apps/web/tests/settings/i18n-completeness.test.ts`
````

### Test gate (planning summary)
- **E2E:** `playwright apps/web/e2e/settings/modules.spec.ts` — module disable enforcement + dependency AlertDialog
- **E2E:** `playwright apps/web/e2e/settings/feature-flags.spec.ts` — maintenance mode enforcement
- **Integration:** `vitest apps/web/tests/settings/i18n-completeness.test.ts` — all keys present
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git revert HEAD --no-edit`

## T-02SETa-028 — E2E: full Settings-a acceptance flow (ADR-032 carveout complete)

**Type:** T4-wiring+test
**Context budget:** ~90k tokens
**Est time:** 90 min
**Parent feature:** 02-SET-a full carveout acceptance gate
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-024 — Modules+i18n E2E, T-02SETa-025 — Reference E2E, T-02SETa-026 — Identity E2E]
- **Downstream (will consume this):** [Phase E-2 NPD-a unlock gate]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** All three tracks complete (S-α Identity, S-β Reference, S-γ Toggles+i18n); Forza seed applied; full E-1 migration stack applied
**WHEN** Playwright runs `apps/web/e2e/settings/settings-acceptance.spec.ts`
**THEN** full acceptance flow succeeds: owner creates org → invites user with NPD Manager role → role assigned → NPD Manager logs in → RLS enforces org scope (cross-org query returns 0 rows) → `pack_sizes` dropdown has ≥5 Forza rows → `templates` has ≥4 rows → `processes` has 8 rows → `dieset_by_line_pack` has ≥10 rows → `organization_modules.is_enabled=true` for `npd` → `permissions.enum.ts` exports all required settings permission strings → `audit_log` has entries for org.created, user.invited, role.assigned → `outbox_events` has `org.created`, `user.invited`, `role.assigned` entries → CI gate green — **Phase E-2 NPD-a unlock**

### ACP Prompt
````
# Task T-02SETa-028 — E2E: full Settings-a acceptance flow (ADR-032 carveout complete)

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/e2e/` → wzorzec istniejących E2E specs + auth setup
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → sprawdź czy wszystkie settings permissions istnieją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/` → schemas dla audit_log, outbox_events

## Twoje zadanie
Napisz full acceptance E2E spec dla Settings-a ADR-032 carveout. Ta spec jest Phase E-2 NPD-a unlock gate.

**Required permissions to verify in `permissions.enum.ts`:**
```ts
SETTINGS_ORGS_VIEW = 'settings:orgs:view'
SETTINGS_ORGS_UPDATE = 'settings:orgs:update'
SETTINGS_USERS_VIEW = 'settings:users:view'
SETTINGS_USERS_INVITE = 'settings:users:invite'
SETTINGS_ROLES_VIEW = 'settings:roles:view'
SETTINGS_ROLES_MANAGE = 'settings:roles:manage'
SETTINGS_MODULES_VIEW = 'settings:modules:view'
SETTINGS_MODULES_TOGGLE = 'settings:modules:toggle'
SETTINGS_FLAGS_VIEW = 'settings:flags:view'
SETTINGS_FLAGS_UPDATE = 'settings:flags:update'
```

**Forza seed row counts (minimum required):**
- `pack_sizes`: ≥5 rows
- `templates`: ≥4 rows
- `processes`: exactly 8 rows (Strip/A, Coat/B, Honey/C, Smoke/E, Slice/F, Tumble/G, Dice/H, Roast/R)
- `dieset_by_line_pack`: ≥10 rows
- `dept_columns`: 58 rows (schema metadata)
- `modules` (enabled for npd org): `organization_modules.is_enabled = true` for `npd`

## Implementacja

**Integration test constraint:** Użyj `supabaseLocalDb` fixture (zero DB mocks).
**RLS test pattern:** `createClient({ userId: testUser.id })` — cross-tenant access blocked.

1. Utwórz `apps/web/e2e/settings/settings-acceptance.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { db } from '@/drizzle/db'
// ... imports

test.describe('Settings-a ADR-032 carveout acceptance', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    // Ensure Forza seed applied
  })

  test('1. Owner creates organization', async ({ page }) => {
    await page.goto('/settings/organizations')
    await page.getByRole('button', { name: 'Create Organization' }).click()
    await page.getByLabel('Organization Name').fill('Forza Acceptance Test Org')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Forza Acceptance Test Org')).toBeVisible()
  })

  test('2. Owner invites user with NPD Manager role', async ({ page }) => {
    await page.goto('/settings/users')
    await page.getByRole('button', { name: 'Invite User' }).click()
    await page.getByLabel('Email').fill('npd-manager-test@forza.test')
    await page.getByLabel('Role').selectOption('NPD Manager')
    await page.getByRole('button', { name: 'Send Invite' }).click()
    await expect(page.getByText('npd-manager-test@forza.test')).toBeVisible()
  })

  test('3. NPD Manager logs in → RLS enforces org scope', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/npd-manager.json' })
    const page = await context.newPage()

    await page.goto('/api/orgs')
    const response = await page.request.get('/api/orgs/all-tenants')
    const data = await response.json()
    // Cross-org query must return 0 rows (RLS enforcement)
    expect(data.filter((o: { tenant_id: string }) => o.tenant_id !== 'test-tenant-id')).toHaveLength(0)
    await context.close()
  })

  test('4. Reference data: Forza seed counts verified', async ({ request }) => {
    const checks = [
      { table: 'pack_sizes', min: 5 },
      { table: 'templates', min: 4 },
      { table: 'processes', exact: 8 },
      { table: 'dieset_by_line_pack', min: 10 },
    ]
    for (const check of checks) {
      const response = await request.get(`/api/settings/reference/${check.table}`)
      const data = await response.json()
      if (check.exact !== undefined) {
        expect(data.rows).toHaveLength(check.exact)
      } else {
        expect(data.rows.length).toBeGreaterThanOrEqual(check.min!)
      }
    }
  })

  test('5. NPD module is enabled for test org', async ({ request }) => {
    const response = await request.get('/api/settings/modules')
    const data = await response.json()
    const npmModule = data.modules.find((m: { code: string }) => m.code === 'npd')
    expect(npmModule).toBeDefined()
    expect(npmModule.is_enabled).toBe(true)
  })

  test('6. Language switch EN→PL persists across session', async ({ page }) => {
    await page.goto('/dashboard')
    await page.getByRole('button', { name: 'EN' }).click()
    await page.getByRole('menuitem', { name: 'PL' }).click()
    await page.reload()
    // After reload, UI should still be in PL (cookie persisted)
    await expect(page.getByRole('button', { name: 'PL' })).toBeVisible()
  })

  test('7. Audit log has entries for all mutations', async ({ request }) => {
    const response = await request.get('/api/settings/audit-log?types=org.created,user.invited,role.assigned')
    const data = await response.json()
    expect(data.entries.some((e: { action: string }) => e.action === 'org.created')).toBe(true)
    expect(data.entries.some((e: { action: string }) => e.action === 'user.invited')).toBe(true)
  })
})
```

2. Utwórz `apps/web/tests/settings/carveout-acceptance.integration.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { supabaseLocalDb } from '@/tests/fixtures/supabase-local-db'
import { Permission } from '@/lib/rbac/permissions.enum'

describe('Settings-a carveout acceptance — DB state assertions', () => {
  beforeAll(async () => {
    // Apply all E-1 migrations + Forza seed
  })

  it('permissions.enum.ts exports all required settings permissions', () => {
    // Static import check
    const required = [
      'SETTINGS_ORGS_VIEW', 'SETTINGS_ORGS_UPDATE',
      'SETTINGS_USERS_VIEW', 'SETTINGS_USERS_INVITE',
      'SETTINGS_ROLES_VIEW', 'SETTINGS_ROLES_MANAGE',
      'SETTINGS_MODULES_VIEW', 'SETTINGS_MODULES_TOGGLE',
      'SETTINGS_FLAGS_VIEW', 'SETTINGS_FLAGS_UPDATE',
    ] as const

    for (const perm of required) {
      expect(Permission[perm], `Missing permission: ${perm}`).toBeDefined()
      expect(typeof Permission[perm]).toBe('string')
    }
  })

  it('all 15 modules seeded in modules table', async () => {
    const result = await supabaseLocalDb.from('modules').select('code')
    expect(result.data).toHaveLength(15)
  })

  it('pack_sizes has ≥5 Forza rows', async () => {
    const result = await supabaseLocalDb.from('reference_data')
      .select('id').eq('table_code', 'pack_sizes')
    expect(result.data!.length).toBeGreaterThanOrEqual(5)
  })

  it('processes has exactly 8 rows', async () => {
    const result = await supabaseLocalDb.from('reference_data')
      .select('id').eq('table_code', 'processes')
    expect(result.data).toHaveLength(8)
  })

  it('outbox_events has org.created entry after org creation', async () => {
    const result = await supabaseLocalDb.from('outbox_events')
      .select('event_type').eq('event_type', 'org.created')
    expect(result.data!.length).toBeGreaterThan(0)
  })
})
```

3. Dodaj do `apps/web/package.json` skrypt `test:settings-acceptance` jako Phase E-2 gate:
W `apps/web/package.json`:
```json
"test:settings-acceptance": "playwright test e2e/settings/settings-acceptance.spec.ts"
```

Skomentuj w CI config: `# Phase E-2 NPD-a unlock gate — must be green before NPD-a dispatch`

## Files
**Create:** `apps/web/e2e/settings/settings-acceptance.spec.ts`, `apps/web/tests/settings/carveout-acceptance.integration.test.ts`
**Modify:** `apps/web/package.json` — add `test:settings-acceptance` script

## Done when
- `playwright apps/web/e2e/settings/settings-acceptance.spec.ts` PASS — full 7-step acceptance flow
- `vitest apps/web/tests/settings/carveout-acceptance.integration.test.ts` PASS — all DB state assertions
- `pnpm test:smoke` green — **Phase E-2 NPD-a dispatch unblocked**

## Rollback
Delete test files; re-open Phase E-2 dispatch blocking condition
````

### Test gate (planning summary)
- **E2E:** `playwright apps/web/e2e/settings/settings-acceptance.spec.ts` — full 7-step carveout acceptance
- **Integration:** `vitest apps/web/tests/settings/carveout-acceptance.integration.test.ts` — DB state assertions (permissions, row counts, outbox events)
- **CI gate:** `pnpm test:smoke` green — **Phase E-2 NPD-a unlock gate**

### Rollback
`git revert HEAD --no-edit`

## Dependency table

| ID | Type | Upstream (hard block) | Parallel |
|---|---|---|---|
| T-02SETa-016 | T1 | T-00b-000 | T-02SETa-001, T-02SETa-011 |
| T-02SETa-017 | T2 | T-02SETa-016 | T-02SETa-002, T-02SETa-003 |
| T-02SETa-018 | T2 | T-02SETa-016, T-02SETa-E01, T-02SETa-E02 | T-02SETa-002, T-02SETa-003, T-02SETa-013 |
| T-02SETa-019 | T3 | T-02SETa-018, T-02SETa-020 | T-02SETa-007, T-02SETa-008, T-02SETa-009, T-02SETa-014 |
| T-02SETa-020 | T2 | T-00a-005 | T-02SETa-001, T-02SETa-011, T-02SETa-016 |
| T-02SETa-021 | T5 | T-02SETa-016 | T-02SETa-012, T-02SETa-027 |
| T-02SETa-022 | T4 | T-02SETa-014 | T-02SETa-019 |
| T-02SETa-023 | T3 | T-02SETa-020, T-02SETa-003 | T-02SETa-019, T-02SETa-022 |
| T-02SETa-024 | T4 | T-02SETa-019, T-02SETa-023, T-02SETa-021 | T-02SETa-025, T-02SETa-026 |
| T-02SETa-028 | T4 | T-02SETa-024, T-02SETa-025, T-02SETa-026 | — |

---

## Parallel dispatch plan

### Wave 0 — i18n scaffold (parallel with S-α Wave 0 enums, independent)
- **Agent:** `T-02SETa-020` — i18n scaffolding (depends only on T-00a-005 monorepo)

### Wave 1 — Schema (after T-00b-000 foundation; parallel with S-α Wave 1)
- **Agent 3:** `T-02SETa-016` — modules schema (parallel with T-02SETa-001 + T-02SETa-011)

### Wave 2 — API layer (after Wave 1; up to 2 agents parallel with S-α Wave 2)
- **Agent 5a:** `T-02SETa-017` — module middleware
- **Agent 5b:** `T-02SETa-018` — module toggle actions (after T-02SETa-E01, T-02SETa-E02)
- **Agent 8:** `T-02SETa-021` — modules seed (parallel, depends only on T-02SETa-016)

### Wave 3 — UI layer (after Wave 2 respective actions)
- **Agent 4:** `T-02SETa-019` — ModuleTogglesGrid + FeatureFlagsForm (after T-02SETa-018 + T-02SETa-020)

Sequential after T-02SETa-014 (S-β Wave 3):
- `T-02SETa-022` — RefRowEditModal 7-table validation

Sequential after T-02SETa-003 + T-02SETa-020:
- `T-02SETa-023` — LanguageSwitcher

### Wave 4 — Integration & Wiring (after respective UI; parallel with S-α/S-β Wave 4)
- **Agent 3:** `T-02SETa-024` — Modules+i18n E2E (after T-02SETa-019 + T-02SETa-023 + T-02SETa-021)

### Wave 5 — Acceptance gate (sequential, must be last — after all tracks Wave 4)
- `T-02SETa-028` — full Settings-a acceptance E2E — **Phase E-2 NPD-a unlock gate**

---

## PRD coverage (S-γ scope)

```
✅ §10.1 Module toggles (15 modules, org_modules, dependency checker V-SET-40) → T-02SETa-016, T-02SETa-017, T-02SETa-018, T-02SETa-019, T-02SETa-021
✅ §10.2 Feature flags core (feature_flags_core table, V-SET-42 d365 check) → T-02SETa-016, T-02SETa-018, T-02SETa-019
✅ §10.4 Validation V-SET-40, V-SET-41, V-SET-42 → T-02SETa-018
✅ §14.2 i18n scaffolding (next-intl, EN full, PL placeholders, runtime switch) → T-02SETa-020, T-02SETa-023
✅ §14.2 V-SET-84 language code validation → T-02SETa-023
✅ §8.6 Reference table CRUD 7-table E2E validation → T-02SETa-022
⚠️ §10.3 Module toggle UI (PostHog self-host) → PARTIAL — built-in feature_flags_core; PostHog integration deferred
❌ §10.5 Module analytics / usage tracking → NOT COVERED — deferred
```

---

## Task count summary (S-γ only)

| Type | Count | Tasks |
|---|---|---|
| T1-schema | 1 | T-02SETa-016 |
| T2-api | 3 | T-02SETa-017, T-02SETa-018, T-02SETa-020 |
| T3-ui | 2 | T-02SETa-019, T-02SETa-023 |
| T4-wiring+test | 3 | T-02SETa-022, T-02SETa-024, T-02SETa-028 |
| T5-seed | 1 | T-02SETa-021 |

**Total S-γ: 10 tasks | Est time: 30–90 min each | Aggregate: ~560 min (~9.3 agent-hours)**
**Wall clock (parallel, 3 agents): ~2 sessions**
