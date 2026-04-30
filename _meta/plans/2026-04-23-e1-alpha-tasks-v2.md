# E-1 Settings-a Track S-α — Identity (v2)

Generated: 2026-04-23
Tasks: T-02SETa-E01, E02, 001-006, 026, 027
Track: S-α Identity

---

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
```
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
2. Append the SETTINGS block (14 entries with JSDoc, delimited by section comment) inside the `Permission` enum
3. Append `ALL_SETTINGS_PERMISSIONS` exported array after the enum declaration (below any existing `ALL_*` exports)
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

## Rollback
`git checkout apps/web/lib/rbac/permissions.enum.ts apps/web/lib/rbac/permissions.test.ts`
```

---

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
```
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
2. Append the SETTINGS block (8 entries, JSDoc, section comment delimiter) inside the `EventType` enum
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

## Rollback
`git checkout apps/web/lib/outbox/events.enum.ts apps/web/lib/outbox/events.test.ts`
```

---
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
```
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

## Rollback
`pnpm drizzle-kit drop --migration 020-settings-identity` następnie `supabase db reset`
```

---

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
```
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
2. `createOrg`: walidacja Zod `createOrgSchema`, insert do `organizations`, audit + outbox z `EventType.SETTINGS_ORG_CREATED`
3. `updateOrg`: walidacja Zod `updateOrgSchema` (partial), update where id + tenantId, audit + outbox z `EventType.SETTINGS_ORG_UPDATED`
4. `deleteOrg`: soft delete `status = 'archived'`, audit + outbox z `EventType.SETTINGS_ORG_DELETED`
5. Utwórz `apps/web/app/actions/settings/__tests__/org-actions.test.ts` (unit, mock Drizzle + auth) + `org-actions.integration.test.ts` (real supabaseLocalDb fixture, zero DB mocks)

## Files
**Create:** `apps/web/app/actions/settings/org-actions.ts`
**Create:** `apps/web/app/actions/settings/__tests__/org-actions.test.ts`
**Create:** `apps/web/app/actions/settings/__tests__/org-actions.integration.test.ts`

## Done when
- `vitest apps/web/app/actions/settings/__tests__/org-actions.test.ts` PASS — RBAC reject, Zod reject, success emits audit + outbox
- `vitest apps/web/app/actions/settings/__tests__/org-actions.integration.test.ts` PASS — createOrg → DB row + audit_log + outbox_events
- `pnpm test:unit` green

## Rollback
`git rm apps/web/app/actions/settings/org-actions.ts` i pliki testów
```

---
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
```
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
3. `inviteUser`: Supabase auth invite → insert users row → audit + outbox
4. `deactivateUser`: sprawdź last-owner guard (query roles.is_system_role=true AND name='owner' count) → soft delete → audit + outbox
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

## Rollback
`git rm apps/web/app/actions/settings/user-actions.ts` i pliki testów
```

---

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
```
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
2. Dodaj immutability guard i permission validation jak opisano
3. Dodaj Zod schemas `createRoleSchema`, `updateRoleSchema` do `apps/web/lib/validators/settings-identity.ts`
4. `deleteRole`: sprawdź że `is_system_role=false`, potem usuń role_permissions rows, potem usuń roles row
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

## Rollback
`git rm apps/web/app/actions/settings/role-actions.ts` i pliki testów
```

---
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
```
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
3. Zaimplementuj upsert używając Drizzle `onConflictDoUpdate` (nie raw SQL)
4. Wywołaj `insertAuditLog` + `insertOutboxEvent` po upsert
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

## Rollback
`git rm apps/web/app/actions/settings/security-actions.ts` i pliki testów
```

---

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
```
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
2. `withPermission`: pobierz sesję → query `users JOIN roles ON users.role_id = roles.id` → sprawdź `role.permissions.includes(requiredPermission)` → throw lub execute handler
3. `setCurrentOrgId`: Drizzle `db.execute(sql\`SET LOCAL app.current_org_id = ${orgId}\`)`
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

## Rollback
`git rm apps/web/lib/rbac/with-permission.ts` i pliki testów
```

---
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
- **Upstream (must be done first):** [T-02SETa-002 — org actions], [T-02SETa-003 — user actions], [T-02SETa-004 — role actions], [T-02SETa-005 — security action], [T-02SETa-006 — RBAC middleware], [T-02SETa-027 — seed]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** Orgs/Users/Roles/Security server actions all implemented; seed factories available; local Supabase running; `withPermission` guard in place
**WHEN** Playwright E2E suite runs full admin identity flow on local Supabase
**THEN** (1) owner creates org → user appears in list; (2) owner invites user → user has `status='invited'` in DB; (3) owner assigns role → role_permissions rows updated; (4) owner updates security policy → `org_security_policies` row upserted; (5) RLS: user from orgA cannot query orgB `organizations` row; (6) `audit_log` table contains mutation rows; (7) `outbox_events` table contains `settings.org.created`, `settings.user.invited`, `settings.role.created`

### Test gate
- **E2E:** `playwright apps/web/e2e/settings/identity.spec.ts` — full owner onboard flow, all 4 entity types
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/identity.integration.test.ts` — audit + outbox rows verified after full mutation sequence
- **E2E cross-org:** `playwright apps/web/e2e/settings/rls-enforcement.spec.ts` — orgA user cannot read orgB data (0 rows)
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/e2e/settings/identity.spec.ts apps/web/e2e/settings/rls-enforcement.spec.ts apps/web/app/actions/settings/__tests__/identity.integration.test.ts` — no schema/code changes

### ACP Prompt
```
# Task T-02SETa-026 — E2E + Integration: Identity track wiring

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/actions/settings/` → lista wszystkich action plików (org-actions.ts, user-actions.ts, role-actions.ts, security-actions.ts)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/seed/settings-identity-seed.ts` → dostępne factory functions: createOrg, createUser
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/e2e/` → istniejące E2E spec pliki, auth fixtures

## Twoje zadanie
Napisz pełny E2E + integration test suite dla Settings Identity track.

**Test 1: E2E — identity full flow** (`apps/web/e2e/settings/identity.spec.ts`)
Playwright flow (użyj `test.use({ storageState: 'e2e/.auth/owner.json' })`):
1. Navigate do `/settings/organizations` → Sprawdź że owner widzi listę orgs
2. Kliknij "Add Organization" → wypełnij `name="Test Org E2E"`, `slug="test-org-e2e"` → Submit
3. Assert że nowa org pojawia się w liście
4. Navigate do `/settings/users` → kliknij "Invite User" → wypełnij email=`e2e-test@example.com`, role=`viewer` → Submit
5. Assert że user pojawia się w liście z badge `invited`
6. Navigate do `/settings/security` → zmień `min_password_length` na 12 → Submit
7. Assert success toast/confirmation pojawia się

**Test 2: E2E — RLS cross-org isolation** (`apps/web/e2e/settings/rls-enforcement.spec.ts`)
1. Utwórz dwie org przez seed factories: `orgA`, `orgB`
2. Zaloguj się jako user należący do `orgA`
3. Spróbuj bezpośrednio query `GET /api/settings/organizations?orgId={orgB.id}` (lub odpowiedni endpoint)
4. Assert HTTP 403 lub pusta tablica (0 wyników)

**Test 3: Integration — audit + outbox** (`apps/web/app/actions/settings/__tests__/identity.integration.test.ts`)
Używaj `supabaseLocalDb` fixture (zero DB mocks):
1. Wywołaj `createOrg({ name: 'IntegOrg', slug: 'integ-org', ... })` z poprawnym kontekstem
2. Assert `audit_log` WHERE `resource_type='organization' AND action='org.created'` ma 1 wiersz
3. Assert `outbox_events` WHERE `event_type='settings.org.created'` ma 1 wiersz
4. Wywołaj `inviteUser({ email: 'integ@example.com', roleId: viewerRoleId })` 
5. Assert `audit_log` WHERE `action='user.invited'` ma 1 wiersz
6. Assert `outbox_events` WHERE `event_type='settings.user.invited'` ma 1 wiersz

## Implementacja
1. Utwórz `apps/web/e2e/settings/identity.spec.ts` — Playwright test używając auth fixture owner
2. Utwórz `apps/web/e2e/settings/rls-enforcement.spec.ts` — cross-org isolation test
3. Utwórz `apps/web/app/actions/settings/__tests__/identity.integration.test.ts` — Vitest integration test z `supabaseLocalDb` fixture
4. Dodaj do `playwright.config.ts` projects definicję dla `settings` jeśli nie istnieje
5. Sprawdź że `pnpm test:smoke` uruchamia nowe specs — dodaj do CI smoke gate jeśli nie skonfigurowany

## Files
**Create:** `apps/web/e2e/settings/identity.spec.ts`
**Create:** `apps/web/e2e/settings/rls-enforcement.spec.ts`
**Create:** `apps/web/app/actions/settings/__tests__/identity.integration.test.ts`

## Done when
- `playwright apps/web/e2e/settings/identity.spec.ts` PASS — owner full onboard flow 7 kroków
- `playwright apps/web/e2e/settings/rls-enforcement.spec.ts` PASS — orgA user dostaje 0 wyników dla orgB
- `vitest apps/web/app/actions/settings/__tests__/identity.integration.test.ts` PASS — audit_log + outbox_events rows po każdej mutacji
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/e2e/settings/identity.spec.ts apps/web/e2e/settings/rls-enforcement.spec.ts apps/web/app/actions/settings/__tests__/identity.integration.test.ts`
```

---

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
- **Upstream (must be done first):** [T-02SETa-001 — schema]
- **Downstream (will consume this):** [T-02SETa-026 — E2E wiring, all T4 tasks in E-1]
- **Parallel (can run concurrently):** [T-02SETa-E01, T-02SETa-E02]

### GIVEN / WHEN / THEN
**GIVEN** Identity schema migrated (organizations, users, roles, role_permissions, org_security_policies tables exist)
**WHEN** `pnpm seed:settings-identity` runs on fresh local Supabase
**THEN** 10 system roles inserted with correct permissions arrays; `createOrg(overrides?)` factory returns typed org row with default `org_security_policies` row; `createUser(orgId, overrides?)` factory returns typed user row with `status='active'`; named snapshot `settings-identity-baseline` available for E2E DB reset via `supabase db dump`

### Test gate
- **Unit:** `vitest apps/web/seed/__tests__/settings-identity-seed.test.ts` — seed runs without error, 10 roles inserted, owner role has `settings:orgs:create` in permissions, createOrg factory returns row with required fields, createUser factory returns row with `status='active'`
- **CI gate:** `pnpm seed:settings-identity` green on fresh DB (added to CI seed check step)

### Rollback
`supabase db reset` restores pre-seed state

### ACP Prompt
```
# Task T-02SETa-027 — Seed: 10 system roles + org factory + user factory

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-identity.ts` → typy Drizzle dla tabel roles, role_permissions, organizations, users, org_security_policies
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → Permission enum strings (sprawdź ALL_SETTINGS_PERMISSIONS)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/seed/` → istniejące seed pliki, seed/index.ts struktura

## Twoje zadanie
Utwórz seed file z 10 system rolami i factory functions.

**10 system roles z permissions** (utwórz Drizzle typed insert):
```ts
const SYSTEM_ROLES = [
  { name: 'owner', description: 'Full organization owner', is_system_role: true,
    permissions: ['settings:orgs:view','settings:orgs:create','settings:orgs:update','settings:orgs:delete',
                  'settings:users:view','settings:users:invite','settings:users:update','settings:users:deactivate',
                  'settings:roles:view','settings:roles:create','settings:roles:update','settings:roles:delete',
                  'settings:security:view','settings:security:update'] },
  { name: 'admin', description: 'Organization administrator', is_system_role: true,
    permissions: ['settings:orgs:view','settings:orgs:update',
                  'settings:users:view','settings:users:invite','settings:users:update','settings:users:deactivate',
                  'settings:roles:view','settings:security:view'] },
  { name: 'member', description: 'Standard member', is_system_role: true,
    permissions: ['settings:orgs:view','settings:users:view','settings:roles:view'] },
  { name: 'viewer', description: 'Read-only viewer', is_system_role: true,
    permissions: ['settings:orgs:view','settings:users:view','settings:roles:view'] },
  { name: 'billing', description: 'Billing manager', is_system_role: true,
    permissions: ['settings:orgs:view','settings:users:view'] },
  { name: 'devops', description: 'DevOps / infrastructure', is_system_role: true,
    permissions: ['settings:orgs:view','settings:security:view','settings:security:update'] },
  { name: 'hr', description: 'HR manager', is_system_role: true,
    permissions: ['settings:users:view','settings:users:invite','settings:users:update','settings:users:deactivate'] },
  { name: 'sales', description: 'Sales team', is_system_role: true,
    permissions: ['settings:orgs:view','settings:users:view'] },
  { name: 'ops', description: 'Operations lead', is_system_role: true,
    permissions: ['settings:orgs:view','settings:users:view','settings:roles:view'] },
  { name: 'readonly', description: 'Read-only access', is_system_role: true,
    permissions: ['settings:orgs:view','settings:users:view','settings:roles:view','settings:security:view'] },
]
```

**Factory functions** (Drizzle typed insert, return inserted row):
```ts
export const createOrg = async (overrides?: Partial<typeof organizations.$inferInsert>) => {
  const org = await db.insert(organizations).values({
    slug: `test-org-${Date.now()}`,
    name: 'Test Organization',
    status: 'active',
    settings: {},
    tenant_id: TEST_TENANT_ID,
    schema_version: 1,
    ...overrides,
  }).returning()
  // also insert default org_security_policies row
  await db.insert(orgSecurityPolicies).values({
    org_id: org[0].id,
    tenant_id: org[0].tenant_id,
    min_password_length: 8,
    require_mfa: false,
    session_timeout_min: 480,
    sso_enabled: false,
    schema_version: 1,
  }).onConflictDoNothing()
  return org[0]
}

export const createUser = async (orgId: string, overrides?: Partial<typeof users.$inferInsert>) => {
  return db.insert(users).values({
    email: `test-${Date.now()}@example.com`,
    display_name: 'Test User',
    status: 'active',
    tenant_id: TEST_TENANT_ID,
    schema_version: 1,
    ...overrides,
  }).returning().then(r => r[0])
}
```

## Implementacja
1. Utwórz `apps/web/seed/settings-identity-seed.ts` z SYSTEM_ROLES constant + seed function `seedSettingsIdentity()` używając Drizzle typed insert
2. Dla każdej roli: insert do `roles` → potem insert permissions do `role_permissions` (loop over permissions array)
3. Eksportuj `createOrg(overrides?)` factory z default `org_security_policies` row upsert
4. Eksportuj `createUser(orgId, overrides?)` factory z status='active' default
5. Zaktualizuj `apps/web/seed/index.ts` — dodaj `import { seedSettingsIdentity } from './settings-identity-seed'` i wywołanie w głównej seed function; dodaj npm script `"seed:settings-identity": "tsx seed/settings-identity-seed.ts"` do `package.json`

## Files
**Create:** `apps/web/seed/settings-identity-seed.ts`
**Create:** `apps/web/seed/__tests__/settings-identity-seed.test.ts`
**Modify:** `apps/web/seed/index.ts` — dodaj import + wywołanie seedSettingsIdentity
**Modify:** `apps/web/package.json` — dodaj script `seed:settings-identity`

## Done when
- `vitest apps/web/seed/__tests__/settings-identity-seed.test.ts` PASS — 10 ról seeded, owner rola ma `settings:orgs:create` w permissions, createOrg() zwraca row z `slug` i `status='active'`, createUser(orgId) zwraca row z `status='active'`
- `pnpm seed:settings-identity` exits 0 na fresh DB
- `pnpm test:unit` green

## Rollback
`supabase db reset` — przywraca stan pre-seed
```

---
---

## Dependency table

| ID | Upstream | Parallel |
|---|---|---|
| T-02SETa-E01 | [T-00b-E01] | [T-02SETa-E02] |
| T-02SETa-E02 | [T-00b-E02] | [T-02SETa-E01] |
| T-02SETa-001 | [T-00b-000, T-02SETa-E01] | [] |
| T-02SETa-002 | [T-02SETa-001, T-02SETa-E01, T-02SETa-E02, T-02SETa-006] | [T-02SETa-003, T-02SETa-004, T-02SETa-005] |
| T-02SETa-003 | [T-02SETa-001, T-02SETa-E01, T-02SETa-E02, T-02SETa-006] | [T-02SETa-002, T-02SETa-004, T-02SETa-005] |
| T-02SETa-004 | [T-02SETa-001, T-02SETa-E01, T-02SETa-E02, T-02SETa-006] | [T-02SETa-002, T-02SETa-003, T-02SETa-005] |
| T-02SETa-005 | [T-02SETa-001, T-02SETa-E01, T-02SETa-E02, T-02SETa-006] | [T-02SETa-002, T-02SETa-003, T-02SETa-004] |
| T-02SETa-006 | [T-02SETa-001, T-02SETa-E01] | [] |
| T-02SETa-026 | [T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005, T-02SETa-006, T-02SETa-027] | [] |
| T-02SETa-027 | [T-02SETa-001] | [T-02SETa-E01, T-02SETa-E02] |

---

## Parallel dispatch plan

**Wave 0 (enum locks — block everything):**
T-02SETa-E01, T-02SETa-E02 (parallel with each other)

**Wave 1 (after Wave 0 + T-00b-000 baseline):**
T-02SETa-001 (schema — sequential, no parallel), T-02SETa-027 (seed — after 001)

**Wave 2 (after Wave 1):**
T-02SETa-006 (RBAC middleware — must be before 002-005)

**Wave 3 (after Wave 2 — all 4 parallel):**
T-02SETa-002, T-02SETa-003, T-02SETa-004, T-02SETa-005

**Wave 4 (after Wave 3):**
T-02SETa-026 (E2E wiring — sequential, consumes all above)

---

## PRD coverage

```
PRD coverage (Track S-α only):
✅ §3 Personas & RBAC — 10 system roles seeded (T-027), permission model (T-E01, T-006)
✅ §5.1 Core identity — organizations, users, roles tables (T-001)
✅ §5.1 Organizations CRUD — createOrg/updateOrg/deleteOrg (T-002)
✅ §5.1 Users CRUD — inviteUser/updateUser/deactivateUser (T-003)
✅ §5.1 Roles CRUD — createRole/updateRole/deleteRole + immutability guard (T-004)
✅ §5.7 org_security_policies — updateOrgSecurityPolicy upsert (T-005)
✅ §5.7 RBAC middleware — withPermission HOF + setCurrentOrgId (T-006)
⚠️ §5.1 Onboarding wizard — deferred to 02-SET-b per ADR-032 (organizations.onboarding_state col present)
⚠️ §5.7 MFA enrollment UI — deferred to 02-SET-e per ADR-032 (require_mfa col present, UI not built)
⚠️ §5.7 SSO/SAML — deferred to 02-SET-e per ADR-032 (sso_enabled col present, integration not built)
❌ §3 Custom roles per org (is_system=false) — deferred to Phase 3 per ADR-032
```

---

## Task count summary

| Type | Count | Tasks | Est time |
|---|---|---|---|
| T1-schema | 3 | E01, E02, 001 | 110 min |
| T2-api | 4 | 002, 003, 004, 005, 006 | 315 min |
| T4-wiring+test | 1 | 026 | 90 min |
| T5-seed | 1 | 027 | 30 min |
| **Total** | **10** | | **545 min (~9h)** |

Context budget total: ~460k tokens
