# E-1 Settings-a Track S-γ — Module Toggles + i18n (v2)

Generated: 2026-04-23
Tasks: T-02SETa-016 through 024, T-02SETa-028
Track: S-γ Toggles + i18n

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
```
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

### 1. Utwórz `apps/web/drizzle/schema/settings-modules.ts`

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

### 2. Uruchom `pnpm drizzle-kit generate`
Wygeneruje `apps/web/drizzle/migrations/022-settings-modules.sql`.

### 3. Dodaj do migration SQL:
- `CHECK (category IN ('core','advanced','add-on'))` na `modules.category`
- `CHECK (rollout_percentage BETWEEN 0 AND 100)` na `feature_flags_core.rollout_percentage`
- RLS: `ALTER TABLE organization_modules ENABLE ROW LEVEL SECURITY;`
- RLS: `ALTER TABLE feature_flags_core ENABLE ROW LEVEL SECURITY;`
- RLS policy na `organization_modules`: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
- RLS policy na `feature_flags_core`: `USING (tenant_id = current_setting('app.tenant_id')::uuid)`

### 4. Seed 15 modułów w migration SQL (INSERT INTO modules):
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

### 5. Backfill `organization_modules` w migration SQL:
```sql
INSERT INTO organization_modules (org_id, module_code, is_enabled, tenant_id)
SELECT o.id, m.code, true, o.tenant_id
FROM organizations o
CROSS JOIN modules m
ON CONFLICT (org_id, module_code) DO NOTHING;
```

### 6. Utwórz Zod schemas w `apps/web/lib/validators/modules.ts`:
```ts
import { z } from 'zod'
export const moduleToggleSchema = z.object({
  orgId: z.string().uuid(),
  moduleCode: z.string().min(1),
  enabled: z.boolean(),
  force: z.boolean().optional().default(false),
})
export const featureFlagSchema = z.object({
  tenantId: z.string().uuid(),
  flagKey: z.string().min(1),
  isEnabled: z.boolean(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  conditions: z.record(z.unknown()).optional(),
})
```

### 7. Export z `apps/web/drizzle/schema/index.ts`:
Dodaj: `export * from './settings-modules'`

### 8. Utwórz integration test `apps/web/drizzle/migrations/__tests__/022-settings-modules.integration.test.ts`:
- Sprawdza: 15 rows w `modules`, `organization_modules` rows = orgs × 15, RLS blokuje cross-tenant access

## Files
**Create:** `apps/web/drizzle/schema/settings-modules.ts`, `apps/web/lib/validators/modules.ts`, `apps/web/drizzle/migrations/__tests__/022-settings-modules.integration.test.ts`
**Modify:** `apps/web/drizzle/schema/index.ts` — dodaj export settings-modules
**Generated:** `apps/web/drizzle/migrations/022-settings-modules.sql`

## Done when
- `pnpm drizzle-kit generate` PASS — migration SQL wygenerowany bez błędów
- `vitest apps/web/drizzle/migrations/__tests__/022-settings-modules.integration.test.ts` PASS — 15 modules, org_modules backfill, RLS enforcement
- `pnpm test:migrations` green

## Rollback
`pnpm drizzle-kit drop --migration 022-settings-modules` lub `DROP TABLE feature_flags_core; DROP TABLE organization_modules; DROP TABLE modules;`
```

### Test gate (planning summary)
- **Integration:** `vitest apps/web/drizzle/migrations/__tests__/022-settings-modules.integration.test.ts` — 15 modules seeded, org_modules backfill = orgs × 15, RLS cross-tenant block
- **CI gate:** `pnpm test:migrations` green

### Rollback
`pnpm drizzle-kit drop --migration 022-settings-modules`

---

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
```
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

### 1. Utwórz `apps/web/lib/modules/check-module-enabled.ts`:
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

### 2. Utwórz `apps/web/lib/modules/with-module-check.ts`:
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

### 3. Export z `apps/web/lib/modules/index.ts`:
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

### 4. Utwórz `apps/web/lib/modules/__tests__/check-module-enabled.test.ts`:
Testy jednostkowe:
- mock DB → `is_enabled: false` → throws `ModuleDisabledError` z `moduleCode`
- mock DB → `is_enabled: true` → resolves `true`
- drugi call z tym samym key → cache hit (DB wywołane tylko raz)
- `clearModuleCache()` → reset Map → DB query znowu wykonane

### 5. Utwórz `apps/web/lib/modules/__tests__/check-module-enabled.integration.test.ts`:
Z `supabaseLocalDb` fixture (zero DB mocks):
- toggle `organization_modules.is_enabled = false` dla org → `checkModuleEnabled` throws
- flip z powrotem na `true` → resolves

## Files
**Create:** `apps/web/lib/modules/check-module-enabled.ts`, `apps/web/lib/modules/with-module-check.ts`, `apps/web/lib/modules/index.ts`, `apps/web/lib/modules/__tests__/check-module-enabled.test.ts`, `apps/web/lib/modules/__tests__/check-module-enabled.integration.test.ts`

## Done when
- `vitest apps/web/lib/modules/__tests__/check-module-enabled.test.ts` PASS — disabled → ModuleDisabledError, enabled → resolves, cache hit (DB mock called once)
- `vitest apps/web/lib/modules/__tests__/check-module-enabled.integration.test.ts` PASS — real DB toggle → middleware blocks
- `pnpm test:unit` green

## Rollback
`rm -rf apps/web/lib/modules/`
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/modules/__tests__/check-module-enabled.test.ts` — disabled → ModuleDisabledError, enabled → resolves, cache hit verified
- **Integration:** `vitest apps/web/lib/modules/__tests__/check-module-enabled.integration.test.ts` — DB toggle → block/pass
- **CI gate:** `pnpm test:unit` green

### Rollback
`rm -rf apps/web/lib/modules/`

---
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
```
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

### 1. Utwórz `apps/web/app/actions/settings/module-actions.ts`:
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

### 2. Utwórz testy `apps/web/app/actions/settings/__tests__/module-actions.test.ts`:
- RBAC guard: brak `SETTINGS_MODULES_TOGGLE` → throws Unauthorized
- `toggleModule` disabled + dependants enabled + force=false → returns `DEPENDENCY_CHAIN_WARNING`
- `toggleModule` disabled + force=true → proceeds, audit called, outbox called
- `toggleFeatureFlag` `integration.d365.enabled=true` z < 5 constants → throws V-SET-42

### 3. Utwórz integration test `apps/web/app/actions/settings/__tests__/module-actions.integration.test.ts`:
Z `supabaseLocalDb` fixture — toggle → DB updated + audit_log row + outbox_events row

## Files
**Create:** `apps/web/app/actions/settings/module-actions.ts`, `apps/web/app/actions/settings/__tests__/module-actions.test.ts`, `apps/web/app/actions/settings/__tests__/module-actions.integration.test.ts`

## Done when
- `vitest apps/web/app/actions/settings/__tests__/module-actions.test.ts` PASS — RBAC guard, dependency chain warning, V-SET-42 enforcement
- `vitest apps/web/app/actions/settings/__tests__/module-actions.integration.test.ts` PASS — toggle → DB updated + audit + outbox
- `pnpm test:unit` green

## Rollback
`rm apps/web/app/actions/settings/module-actions.ts`
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/module-actions.test.ts` — RBAC, dependency chain, V-SET-42
- **Integration:** `vitest apps/web/app/actions/settings/__tests__/module-actions.integration.test.ts` — DB update + audit + outbox
- **CI gate:** `pnpm test:unit` green

### Rollback
`rm apps/web/app/actions/settings/module-actions.ts`

---

## T-02SETa-019 — UI: ModuleTogglesGrid + FeatureFlagsForm

**Type:** T3-ui
**Context budget:** ~65k tokens
**Est time:** 80 min
**Parent feature:** 02-SET-a Module toggles UI (§10.3)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** none — no prototype exists for this component

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
```
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

### 1. Utwórz `apps/web/components/settings/modules/ModuleTogglesGrid.tsx`:
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

### 2. Utwórz `apps/web/components/settings/modules/FeatureFlagsForm.tsx`:
- 4 Switch rows: `maintenance_mode`, `integration.d365.enabled`, `beta_features`, `debug_mode`
- d365 flag ma Tooltip z `flag_d365_tooltip` message
- Każdy switch: `useTransition` + `toggleFeatureFlag` action
- Loading state: `<Skeleton className="h-10 w-full" />`
- Error state: `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`

### 3. Utwórz `apps/web/app/(settings)/modules/page.tsx`:
Server Component — fetches modules list via Drizzle, passes to `<ModuleTogglesGrid />` and `<FeatureFlagsForm />`

### 4. Utwórz unit test `apps/web/components/settings/modules/__tests__/ModuleTogglesGrid.test.tsx`:
- render z `is_enabled: false` na module z dependantami → after toggle click → AlertDialog shows `affectedModules`
- render z `is_enabled: false` na standalone module → toggle → no AlertDialog

### 5. Dodaj i18n klucze do `apps/web/messages/en.json` i `apps/web/messages/pl.json`
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
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/modules/__tests__/ModuleTogglesGrid.test.tsx` — AlertDialog on dependent disable
- **E2E:** `playwright apps/web/e2e/settings/modules.spec.ts` — toggle flow
- **CI gate:** `pnpm test:smoke` green

### Rollback
`rm -rf apps/web/components/settings/modules/`; revert message files

---
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
```
# Task T-02SETa-020 — i18n scaffolding: next-intl config + EN full keys + PL placeholders

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/next.config.ts` → cały plik — current Next.js config to modify
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/middleware.ts` → current middleware to extend
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/package.json` → sprawdź czy next-intl zainstalowany

## Twoje zadanie
Skonfiguruj next-intl dla monopilot-kira z pełnymi EN kluczami i PL placeholderami dla E-1 scope.

## Implementacja

### 1. Utwórz `apps/web/i18n.ts`:
```ts
import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async ({ locale }) => ({
  messages: (await import(`@/messages/${locale}.json`)).default
}))
```

### 2. Zmodyfikuj `apps/web/next.config.ts`:
Dodaj:
```ts
import createNextIntlPlugin from 'next-intl/plugin'
const withNextIntl = createNextIntlPlugin()
export default withNextIntl(nextConfig)
```

### 3. Zmodyfikuj `apps/web/middleware.ts` — dodaj do istniejącego middleware:
```ts
import createIntlMiddleware from 'next-intl/middleware'

const intlMiddleware = createIntlMiddleware({
  locales: ['en', 'pl'],
  defaultLocale: 'en'
})

// Combine with existing middleware chain
```

### 4. Utwórz `apps/web/messages/en.json` z PEŁNYMI EN kluczami dla wszystkich E-1 namespaces:
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

### 5. Utwórz `apps/web/messages/pl.json` — wszystkie klucze identyczne jak EN, wartości = `"__TODO_PL__"`:
Wygeneruj programatycznie — każda wartość string zastąpiona przez `"__TODO_PL__"` (zachowaj strukturę JSON).

### 6. Utwórz `apps/web/scripts/lint-i18n.ts`:
```ts
import enMessages from '../messages/en.json'
import plMessages from '../messages/pl.json'

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? flattenKeys(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k)
      : [`${prefix ? `${prefix}.` : ''}${k}`]
  )
}

const enKeys = new Set(flattenKeys(enMessages))
const plKeys = new Set(flattenKeys(plMessages))
const missing = [...enKeys].filter(k => !plKeys.has(k))

if (missing.length > 0) {
  console.error('Missing PL keys:', missing)
  process.exit(1)
}
console.log(`i18n OK: ${enKeys.size} keys, all present in PL`)
```

Dodaj do `apps/web/package.json`: `"lint:i18n": "tsx scripts/lint-i18n.ts"`

### 7. Utwórz unit test `apps/web/lib/i18n/__tests__/i18n.test.ts`:
- EN messages load, `settings.orgs.title` = non-empty string
- PL file has all EN keys (no missing keys)
- PL values that are `__TODO_PL__` — acceptable (test doesn't fail on placeholder values)

## Files
**Create:** `apps/web/i18n.ts`, `apps/web/messages/en.json`, `apps/web/messages/pl.json`, `apps/web/scripts/lint-i18n.ts`, `apps/web/lib/i18n/__tests__/i18n.test.ts`
**Modify:** `apps/web/next.config.ts` — add next-intl plugin; `apps/web/middleware.ts` — add intl middleware; `apps/web/package.json` — add `lint:i18n` script

## Done when
- `vitest apps/web/lib/i18n/__tests__/i18n.test.ts` PASS — EN loads, PL has all keys
- `pnpm lint:i18n` green — no missing keys reported
- `pnpm build` PASS — next-intl plugin loaded without errors

## Rollback
Remove next-intl plugin from `apps/web/next.config.ts`; remove intlMiddleware from `apps/web/middleware.ts`; delete message files and `i18n.ts`
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/lib/i18n/__tests__/i18n.test.ts` — EN translations load, PL has all EN keys
- **CI gate:** `pnpm lint:i18n` green — all EN keys present in PL file

### Rollback
Remove next-intl plugin from `next.config.ts`; delete message files and `i18n.ts`

---

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
```
# Task T-02SETa-021 — Seed: 15 modules + organization_modules backfill

## Context — przeczytaj przed implementacją
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/settings-modules.ts` → `modules`, `organizationModules` Drizzle tables
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/seed/index.ts` → wzorzec rejestracji seed scripts

## Twoje zadanie
Utwórz typed Drizzle seed script dla 15 modułów + organization_modules backfill.

**15 system modules do zaseedowania:**
```
npd, warehouse, production, quality, finance, shipping, reporting, maintenance, multi_site, oee, settings_advanced, scanner, planning, crm, purchasing
```

## Implementacja

### 1. Utwórz `apps/web/seed/settings-modules-seed.ts`:
```ts
import { db } from '@/drizzle/db'
import { modules, organizationModules } from '@/drizzle/schema/settings-modules'
import { organizations } from '@/drizzle/schema/settings-identity'
import { sql } from 'drizzle-orm'

const MODULES_DATA = [
  { code: 'npd',              display_name: 'New Product Development', description: 'NPD module',               category: 'core'     as const, is_core: false },
  { code: 'warehouse',        display_name: 'Warehouse Management',    description: 'Warehouse module',          category: 'core'     as const, is_core: false },
  { code: 'production',       display_name: 'Production Management',   description: 'Production module',         category: 'core'     as const, is_core: false },
  { code: 'quality',          display_name: 'Quality Management',      description: 'QA module',                category: 'core'     as const, is_core: false },
  { code: 'finance',          display_name: 'Finance & Costing',       description: 'Finance module',            category: 'core'     as const, is_core: false },
  { code: 'shipping',         display_name: 'Shipping & Dispatch',     description: 'Shipping module',           category: 'advanced' as const, is_core: false },
  { code: 'reporting',        display_name: 'Reporting & BI',          description: 'Reporting module',          category: 'advanced' as const, is_core: false },
  { code: 'maintenance',      display_name: 'Maintenance Management',  description: 'Maintenance module',        category: 'advanced' as const, is_core: false },
  { code: 'multi_site',       display_name: 'Multi-Site Management',   description: 'Multi-site module',         category: 'add-on'   as const, is_core: false },
  { code: 'oee',              display_name: 'OEE Analytics',           description: 'OEE module',               category: 'add-on'   as const, is_core: false },
  { code: 'settings_advanced',display_name: 'Advanced Settings',       description: 'Advanced settings module',  category: 'core'     as const, is_core: true  },
  { code: 'scanner',          display_name: 'Scanner Interface',       description: 'Mobile scanner module',     category: 'advanced' as const, is_core: false },
  { code: 'planning',         display_name: 'Production Planning',     description: 'Planning module',           category: 'advanced' as const, is_core: false },
  { code: 'crm',              display_name: 'CRM & Customers',         description: 'CRM module',               category: 'add-on'   as const, is_core: false },
  { code: 'purchasing',       display_name: 'Purchasing & Procurement', description: 'Purchasing module',        category: 'add-on'   as const, is_core: false },
] as const

export async function seedSettingsModules() {
  console.log('Seeding modules...')

  // Idempotent insert
  await db.insert(modules).values(MODULES_DATA).onConflictDoNothing()

  // Backfill organization_modules for all orgs
  const allOrgs = await db.select({ id: organizations.id, tenant_id: organizations.tenant_id }).from(organizations)

  for (const org of allOrgs) {
    const rows = MODULES_DATA.map(m => ({
      org_id: org.id,
      module_code: m.code,
      is_enabled: true,
      tenant_id: org.tenant_id,
    }))
    await db.insert(organizationModules).values(rows).onConflictDoNothing()
  }

  console.log(`Seeded ${MODULES_DATA.length} modules, backfilled ${allOrgs.length} orgs`)
}

// Factory for tests
export const createModuleRow = (overrides?: Partial<typeof MODULES_DATA[0]>) =>
  db.insert(modules).values({ ...MODULES_DATA[0], ...overrides }).returning()
```

### 2. Zarejestruj w `apps/web/seed/index.ts`:
```ts
import { seedSettingsModules } from './settings-modules-seed'
// add to seed run order
await seedSettingsModules()
```

### 3. Dodaj do `apps/web/package.json`:
```json
"seed:settings-modules": "tsx seed/settings-modules-seed.ts"
```

### 4. Named snapshot — dodaj do seed baseline:
Skomentuj w `seed/index.ts`: `// Snapshot: settings-modules-baseline`

### 5. Utwórz unit test `apps/web/seed/__tests__/settings-modules-seed.test.ts`:
Z `supabaseLocalDb` fixture:
- `seedSettingsModules()` → `modules` count = 15
- Re-run (idempotent) → count wciąż 15 (no duplicates)
- `organization_modules` count = test_orgs_count × 15

## Files
**Create:** `apps/web/seed/settings-modules-seed.ts`, `apps/web/seed/__tests__/settings-modules-seed.test.ts`
**Modify:** `apps/web/seed/index.ts` — register seed; `apps/web/package.json` — add seed:settings-modules script

## Done when
- `vitest apps/web/seed/__tests__/settings-modules-seed.test.ts` PASS — 15 modules, org_modules backfill correct count, idempotent re-run safe
- `pnpm seed:settings-modules` exits 0

## Rollback
`DELETE FROM organization_modules; DELETE FROM modules;` or `supabase db reset`
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/seed/__tests__/settings-modules-seed.test.ts` — 15 modules, org_modules backfill counts correct
- **CI gate:** `pnpm seed:settings-modules` green

### Rollback
`DELETE FROM organization_modules; DELETE FROM modules;`

---
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
```
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

### 1. Verify/fix `RefRowEditModal.tsx` for boolean field support:
Translation checklist from prototype:
- [ ] `window.Modal` → already using `@radix-ui/react-dialog Dialog` (verify)
- [ ] Local `useState` per field → already using `useForm + zodResolver` (verify)
- [ ] Boolean column type → renders as `shadcn Switch` (add if missing)
- [ ] `dropdown_source` column → renders as `<Select>` populated from `mv_reference_lookup` view for source table (add if missing)
- [ ] `display_order` → numeric `<Input type="number">` on all modals
- [ ] `is_active` → `<Switch>` on all modals
- [ ] Hardcoded labels → next-intl keys `settings.reference.*`

### 2. Fix `RefRowEditModal.tsx` if boolean rendering missing:
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

### 3. Fix `RefRowEditModal.tsx` if dropdown_source rendering missing:
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

### 4. Utwórz Playwright spec `apps/web/e2e/settings/reference-all-tables.spec.ts`:
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

### 5. Utwórz unit test `apps/web/components/settings/reference/__tests__/RefRowEditModal.test.tsx`:
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
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/components/settings/reference/__tests__/RefRowEditModal.test.tsx` — boolean → Switch, dropdown_source → Select
- **E2E:** `playwright apps/web/e2e/settings/reference-all-tables.spec.ts` — all 7 tables CRUD + validation
- **CI gate:** `pnpm test:smoke` green

### Rollback
Revert `RefRowEditModal.tsx`; delete E2E spec

---

## T-02SETa-023 — i18n: user language preference + runtime switcher

**Type:** T3-ui
**Context budget:** ~40k tokens
**Est time:** 45 min
**Parent feature:** 02-SET-a i18n user preference (§14.2)
**Agent:** frontend-specialist
**Status:** pending

**Prototype ref:** none — no prototype exists for this component

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
```
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

### 1. Sprawdź i dodaj `preferred_locale` do users schema jeśli brak:
Jeśli `apps/web/drizzle/schema/settings-identity.ts` nie ma `preferred_locale` w `users` table → dodaj:
```ts
preferred_locale: text('preferred_locale').default('en'),
```
Uruchom `pnpm drizzle-kit generate` → migration `023-user-preferred-locale.sql`.
Dodaj CHECK constraint do SQL: `CHECK (preferred_locale IN ('en','pl'))`.

### 2. Utwórz `apps/web/app/actions/settings/language-actions.ts`:
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

### 3. Utwórz `apps/web/components/common/LanguageSwitcher.tsx`:
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

### 4. Dodaj `<LanguageSwitcher />` do `apps/web/app/layout.tsx` (lub głównego nav komponentu):
W nav header, obok user menu.

### 5. Utwórz testy:

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

### 6. Dodaj i18n klucze do `apps/web/messages/en.json` i `apps/web/messages/pl.json`

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
```

### Test gate (planning summary)
- **Unit:** `vitest apps/web/app/actions/settings/__tests__/language-actions.test.ts` — V-SET-84 invalid rejected, success updates DB + cookie
- **E2E:** `playwright apps/web/e2e/settings/language-switch.spec.ts` — EN→PL switch persists
- **CI gate:** `pnpm test:smoke` green

### Rollback
Remove LanguageSwitcher from nav; delete `language-actions.ts`

---
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
```
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

### 1. Utwórz `apps/web/e2e/settings/modules.spec.ts`:
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

### 2. Utwórz `apps/web/e2e/settings/feature-flags.spec.ts`:
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

### 3. Utwórz `apps/web/tests/settings/i18n-completeness.test.ts`:
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

### 4. Uruchom `pnpm test:smoke` — wszystkie testy muszą przejść.

## Files
**Create:** `apps/web/e2e/settings/modules.spec.ts`, `apps/web/e2e/settings/feature-flags.spec.ts`, `apps/web/tests/settings/i18n-completeness.test.ts`

## Done when
- `playwright apps/web/e2e/settings/modules.spec.ts` PASS — npd disable → 403 MODULE_DISABLED, dependency AlertDialog, re-enable works
- `playwright apps/web/e2e/settings/feature-flags.spec.ts` PASS — maintenance mode → blocks writes, V-SET-42 error shown
- `vitest apps/web/tests/settings/i18n-completeness.test.ts` PASS — all EN keys in PL, no TODO in EN
- `pnpm test:smoke` green

## Rollback
Delete test files: `rm apps/web/e2e/settings/modules.spec.ts apps/web/e2e/settings/feature-flags.spec.ts apps/web/tests/settings/i18n-completeness.test.ts`
```

### Test gate (planning summary)
- **E2E:** `playwright apps/web/e2e/settings/modules.spec.ts` — module disable enforcement + dependency AlertDialog
- **E2E:** `playwright apps/web/e2e/settings/feature-flags.spec.ts` — maintenance mode enforcement
- **Integration:** `vitest apps/web/tests/settings/i18n-completeness.test.ts` — all keys present
- **CI gate:** `pnpm test:smoke` green

### Rollback
Delete E2E and test files

---
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
**GIVEN** All three tracks complete (S-α Identity, S-β Reference, S-γ Toggles+i18n); Apex seed applied; full E-1 migration stack applied
**WHEN** Playwright runs `apps/web/e2e/settings/settings-acceptance.spec.ts`
**THEN** full acceptance flow succeeds: owner creates org → invites user with NPD Manager role → role assigned → NPD Manager logs in → RLS enforces org scope (cross-org query returns 0 rows) → `pack_sizes` dropdown has ≥5 Apex rows → `templates` has ≥4 rows → `processes` has 8 rows → `dieset_by_line_pack` has ≥10 rows → `organization_modules.is_enabled=true` for `npd` → `permissions.enum.ts` exports all required settings permission strings → `audit_log` has entries for org.created, user.invited, role.assigned → `outbox_events` has `org.created`, `user.invited`, `role.assigned` entries → CI gate green — **Phase E-2 NPD-a unlock**

### ACP Prompt
```
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

**Apex seed row counts (minimum required):**
- `pack_sizes`: ≥5 rows
- `templates`: ≥4 rows
- `processes`: exactly 8 rows (Strip/A, Coat/B, Honey/C, Smoke/E, Slice/F, Tumble/G, Dice/H, Roast/R)
- `dieset_by_line_pack`: ≥10 rows
- `dept_columns`: 58 rows (schema metadata)
- `modules` (enabled for npd org): `organization_modules.is_enabled = true` for `npd`

## Implementacja

**Integration test constraint:** Użyj `supabaseLocalDb` fixture (zero DB mocks).
**RLS test pattern:** `createClient({ userId: testUser.id })` — cross-tenant access blocked.

### 1. Utwórz `apps/web/e2e/settings/settings-acceptance.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { db } from '@/drizzle/db'
// ... imports

test.describe('Settings-a ADR-032 carveout acceptance', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    // Ensure Apex seed applied
  })

  test('1. Owner creates organization', async ({ page }) => {
    await page.goto('/settings/organizations')
    await page.getByRole('button', { name: 'Create Organization' }).click()
    await page.getByLabel('Organization Name').fill('Apex Acceptance Test Org')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page.getByText('Apex Acceptance Test Org')).toBeVisible()
  })

  test('2. Owner invites user with NPD Manager role', async ({ page }) => {
    await page.goto('/settings/users')
    await page.getByRole('button', { name: 'Invite User' }).click()
    await page.getByLabel('Email').fill('npd-manager-test@apex.test')
    await page.getByLabel('Role').selectOption('NPD Manager')
    await page.getByRole('button', { name: 'Send Invite' }).click()
    await expect(page.getByText('npd-manager-test@apex.test')).toBeVisible()
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

  test('4. Reference data: Apex seed counts verified', async ({ request }) => {
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

### 2. Utwórz `apps/web/tests/settings/carveout-acceptance.integration.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { supabaseLocalDb } from '@/tests/fixtures/supabase-local-db'
import { Permission } from '@/lib/rbac/permissions.enum'

describe('Settings-a carveout acceptance — DB state assertions', () => {
  beforeAll(async () => {
    // Apply all E-1 migrations + Apex seed
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

  it('pack_sizes has ≥5 Apex rows', async () => {
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

### 3. Dodaj do CI config jako Phase E-2 gate:
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
```

### Test gate (planning summary)
- **E2E:** `playwright apps/web/e2e/settings/settings-acceptance.spec.ts` — full 7-step carveout acceptance
- **Integration:** `vitest apps/web/tests/settings/carveout-acceptance.integration.test.ts` — DB state assertions (permissions, row counts, outbox events)
- **CI gate:** `pnpm test:smoke` green — **Phase E-2 NPD-a unlock gate**

### Rollback
Delete test files; re-open Phase E-2 dispatch blocking condition

---

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
