# Settings b/c/d/e — Atomic Task Decomposition

Generated: 2026-04-25
PRD source: `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` v3.4
Prerequisite: `2026-04-23-e1-settings-a-v2.md` (30 tasks, validated HARD FAIL=0)
Covers: 02SETb (§9 Tenant L2), 02SETc (§6 Schema Wizard), 02SETd (§7 Rules + §8 Ref CRUD), 02SETe (§12 Infra + §11 D365 + §13 Email + §14 Security + Onboarding)

---

## Wave 0 — Enum lock (settings b-e permissions)

## T-02SETb-E01 — permissions.enum.ts Settings b-e extension

**Type:** T1-schema
**Context budget:** ~20k tokens
**Est time:** 20 min
**Parent feature:** 02-SETTINGS §3 Permission model
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 80
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETa-E01 — Settings-a permissions lock]
- **Downstream (will consume this):** [T-02SETb-002, T-02SETc-002, T-02SETd-003, T-02SETe-003]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** `apps/web/lib/rbac/permissions.enum.ts` has Foundation + Settings-a permissions from T-02SETa-E01
**WHEN** the Settings b-e permission group is appended
**THEN** 18 additional permission strings exist covering tenant variations, schema wizard, rules, reference CRUD, infrastructure, D365, email config, security

### ACP Prompt
```
# Task T-02SETb-E01 — permissions.enum.ts Settings b-e extension

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/rbac/permissions.enum.ts` → cały plik

## Twoje zadanie
Append a SETTINGS_B_E permission group to `apps/web/lib/rbac/permissions.enum.ts`.
ADD (never replace) a clearly delimited block after the existing SETTINGS section:

```ts
// ─── SETTINGS B-E ───────────────────────────────────────────────────────────
/** Tenant L2 variations */
SETTINGS_TENANT_VARS_VIEW = 'settings:tenant_vars:view',
SETTINGS_TENANT_VARS_EDIT = 'settings:tenant_vars:edit',
SETTINGS_TENANT_MIGRATIONS_MANAGE = 'settings:tenant_migrations:manage',
/** Schema admin wizard */
SETTINGS_SCHEMA_VIEW = 'settings:schema:view',
SETTINGS_SCHEMA_EDIT = 'settings:schema:edit',
SETTINGS_SCHEMA_PROMOTE_L1 = 'settings:schema:promote_l1',
/** Rule registry (read-only) */
SETTINGS_RULES_VIEW = 'settings:rules:view',
/** Reference tables CRUD */
SETTINGS_REFERENCE_VIEW = 'settings:reference:view',
SETTINGS_REFERENCE_EDIT = 'settings:reference:edit',
SETTINGS_REFERENCE_IMPORT = 'settings:reference:import',
/** Infrastructure */
SETTINGS_INFRA_VIEW = 'settings:infra:view',
SETTINGS_INFRA_EDIT = 'settings:infra:edit',
/** D365 integration */
SETTINGS_D365_VIEW = 'settings:d365:view',
SETTINGS_D365_EDIT = 'settings:d365:edit',
SETTINGS_D365_TOGGLE = 'settings:d365:toggle',
/** Email config */
SETTINGS_EMAIL_VIEW = 'settings:email:view',
SETTINGS_EMAIL_EDIT = 'settings:email:edit',
/** Onboarding */
SETTINGS_ONBOARDING_COMPLETE = 'settings:onboarding:complete',
```

Also export `ALL_SETTINGS_BE_PERMISSIONS: Permission[]` array with all 18 strings.

## Implementacja
1. Modify `apps/web/lib/rbac/permissions.enum.ts` — append the block above after the SETTINGS-A section
2. Add `export const ALL_SETTINGS_BE_PERMISSIONS: Permission[]` after the enum

## Files
**Modify:** `apps/web/lib/rbac/permissions.enum.ts`

## Done when
- `vitest apps/web/lib/rbac/permissions.test.ts` PASS — all 18 b-e strings present, no dupes, regex `^settings:[a-z_]+:[a-z_]+$`
- `pnpm test:smoke` green

## Rollback
`git checkout apps/web/lib/rbac/permissions.enum.ts`
```

### Test gate
- **Unit:** `vitest apps/web/lib/rbac/permissions.test.ts` — 18 new strings, no dupes
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git checkout apps/web/lib/rbac/permissions.enum.ts`

---

## §1 — 02SETb: Multi-tenant L2 Config (§9)

## T-02SETb-001 — T1: tenant_variations + tenant_migrations schema

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 02-SETTINGS §9 Multi-tenant L2 Config [ADR-031]
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000 — baseline migration, T-02SETa-001 — organizations schema]
- **Downstream (will consume this):** [T-02SETb-002, T-02SETb-003, T-02SETb-004]
- **Parallel (can run concurrently):** [T-02SETc-001, T-02SETd-001]

### GIVEN / WHEN / THEN
**GIVEN** Foundation baseline migration exists with `organizations` table
**WHEN** the Drizzle schema for `tenant_variations` and `tenant_migrations` is generated and migrated
**THEN** two new tables exist with correct constraints, RLS enabled, and R13 columns

### ACP Prompt
```
# Task T-02SETb-001 — tenant_variations + tenant_migrations schema

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → znajdź sekcję `## §9` — Multi-tenant L2 Config spec
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/drizzle/schema/` → existing schema files for patterns

## Twoje zadanie
Create Drizzle schema for `tenant_variations` and `tenant_migrations`. Both tables need R13 audit columns and RLS.

## Implementacja
1. Utwórz `apps/web/drizzle/schema/settings-tenant-l2.ts`:
```ts
// tenant_variations — one row per org, stores L2 overrides
export const tenantVariations = pgTable('tenant_variations', {
  orgId: uuid('org_id').primaryKey().references(() => organizations.id),
  deptOverrides: jsonb('dept_overrides').default('{}'),    // [{action:'split'|'merge'|'add', source, targets, column_mapping}]
  ruleVariantOverrides: jsonb('rule_variant_overrides').default('{}'),  // {rule_code: 'v1'|'v2'}
  featureFlags: jsonb('feature_flags').default('{}'),
  schemaExtensionsCount: integer('schema_extensions_count').default(0),
  upgradedAt: timestamp('upgraded_at', { withTimezone: true }),
  upgradedFromVersion: text('upgraded_from_version'),
  upgradedToVersion: text('upgraded_to_version'),
  // R13:
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  createdByUser: uuid('created_by_user'),
  appVersion: text('app_version'),
  schemaVersion: integer('schema_version').notNull().default(1),
})

// tenant_migrations — upgrade orchestration log
export const tenantMigrations = pgTable('tenant_migrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  component: text('component').notNull(),          // 'rule_engine'|'schema'|'feature_v2'
  currentVersion: text('current_version').notNull(),
  targetVersion: text('target_version').notNull(),
  status: text('status').notNull().default('scheduled'),  // 'scheduled'|'canary'|'progressive'|'completed'|'rolled_back'
  canaryPct: integer('canary_pct').default(0),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  scheduledBy: uuid('scheduled_by').references(() => users.id),
  // R13:
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  createdByUser: uuid('created_by_user'),
  createdByDevice: uuid('created_by_device'),
  appVersion: text('app_version'),
  schemaVersion: integer('schema_version').notNull().default(1),
})
```
2. Uruchom `pnpm drizzle-kit generate` → migration SQL w `apps/web/drizzle/migrations/`
3. Dodaj RLS policies do migration SQL: `ALTER TABLE tenant_variations ENABLE ROW LEVEL SECURITY` + `CREATE POLICY tenant_variations_tenant ON tenant_variations USING (org_id = fn_current_org())`; analogicznie dla `tenant_migrations`
4. Uruchom `pnpm drizzle-kit migrate` na local Supabase

## Files
**Create:** `apps/web/drizzle/schema/settings-tenant-l2.ts`
**Modify:** `apps/web/drizzle/schema/index.ts` — re-export new tables

## Done when
- `vitest apps/web/drizzle/schema/settings-tenant-l2.test.ts` PASS — tables exist, RLS active, status enum constraint
- `pnpm test:smoke` green

## Rollback
`pnpm drizzle-kit drop --name settings-tenant-l2`
```

### Test gate
- **Integration:** `vitest apps/web/drizzle/schema/settings-tenant-l2.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm drizzle-kit drop --name settings-tenant-l2`

---

## T-02SETb-002 — T2: updateTenantVariations + dept resolver actions

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 02-SETTINGS §9.1, §9.2
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETb-001, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETb-005]
- **Parallel (can run concurrently):** [T-02SETb-003]

### GIVEN / WHEN / THEN
**GIVEN** `tenant_variations` table exists with RLS
**WHEN** admin updates dept overrides or rule variant overrides via Server Action
**THEN** `tenant_variations` row is upserted, audit_log entry inserted, `deptResolver` utility resolves L1→L2 dept code mapping

### ACP Prompt
```
# Task T-02SETb-002 — updateTenantVariations + dept resolver

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §9` — dept_overrides schema, rule_variant_overrides format
- `apps/web/drizzle/schema/settings-tenant-l2.ts` → tenantVariations schema

## Twoje zadanie
Create Server Actions and utility for tenant L2 variation management.

## Implementacja
1. Utwórz `apps/web/lib/settings/tenant-variations.actions.ts` (`'use server'`):
   - `updateDeptOverrides(orgId: string, overrides: DeptOverride[]): Promise<void>` — RBAC guard `Permission.SETTINGS_TENANT_VARS_EDIT`, upsert tenant_variations.dept_overrides, insertAuditLog action='tenant_variation_apply'
   - `updateRuleVariantOverrides(orgId: string, overrides: Record<string, string>): Promise<void>` — same guard
   - Zod schemas: `DeptOverrideSchema = z.object({ action: z.enum(['split','merge','add']), source: z.string().optional(), targets: z.array(z.string()).optional(), code: z.string().optional(), name_pl: z.string().optional(), display_order: z.number().optional(), column_mapping: z.record(z.string()).optional() })`

2. Utwórz `apps/web/lib/settings/dept-resolver.ts`:
   - `deptResolver(tenantId: string, deptCode: string): Promise<string>` — reads tenant_variations.dept_overrides JSONB, applies split/merge/add transformations, returns effective dept code
   - `getAllEffectiveDepts(tenantId: string): Promise<DeptConfig[]>` — returns full dept list with L2 overrides applied
   - Baseline 7 Apex depts: `['core', 'technical', 'packaging', 'mrp', 'planning', 'production', 'price']`

3. Utwórz `apps/web/lib/settings/rule-variant-resolver.ts`:
   - `ruleVariantResolver(tenantId: string, ruleCode: string): Promise<string>` — reads rule_variant_overrides, returns 'v1'|'v2' (default 'v1')

## Files
**Create:** `apps/web/lib/settings/tenant-variations.actions.ts`, `apps/web/lib/settings/dept-resolver.ts`, `apps/web/lib/settings/rule-variant-resolver.ts`

## Done when
- `vitest apps/web/lib/settings/dept-resolver.test.ts` PASS — split/merge/add correctly transform baseline 7 depts
- `vitest apps/web/lib/settings/tenant-variations.actions.test.ts` PASS — RBAC guard rejects non-admin, audit entry inserted
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/tenant-variations.actions.ts apps/web/lib/settings/dept-resolver.ts apps/web/lib/settings/rule-variant-resolver.ts`
```

### Test gate
- **Unit:** `vitest apps/web/lib/settings/dept-resolver.test.ts`
- **Integration:** `vitest apps/web/lib/settings/tenant-variations.actions.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/tenant-variations.actions.ts`

---

## T-02SETb-003 — T2: upgrade orchestration actions (canary/progressive/rollback)

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 60 min
**Parent feature:** 02-SETTINGS §9.4 Upgrade orchestration [ADR-031]
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETb-001, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETb-006]
- **Parallel (can run concurrently):** [T-02SETb-002]

### GIVEN / WHEN / THEN
**GIVEN** `tenant_migrations` table exists
**WHEN** admin creates a migration (canary start) and advances it through canary→progressive→completed
**THEN** `tenant_migrations.status` transitions correctly with audit entries, rollback creates new row with swapped versions

### ACP Prompt
```
# Task T-02SETb-003 — upgrade orchestration actions

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §9.4` — upgrade orchestration flow
- `apps/web/drizzle/schema/settings-tenant-l2.ts` → tenantMigrations schema

## Twoje zadanie
Create Server Actions for the "Migrate to v2" upgrade orchestration flow (6-step: scheduled→canary→progressive→completed + rollback path).

## Implementacja
1. Utwórz `apps/web/lib/settings/tenant-migrations.actions.ts` (`'use server'`):
   - `createTenantMigration(input: { orgId, component, currentVersion, targetVersion }): Promise<string>` — RBAC guard `Permission.SETTINGS_TENANT_MIGRATIONS_MANAGE`, insert tenant_migrations (status='scheduled'), insertOutboxEvent(EventType.TENANT_MIGRATION_SCHEDULED, 'tenant_migration', id, payload), return migration id
   - `advanceMigration(migrationId: string, action: 'start_canary'|'advance_progressive'|'complete'|'rollback'): Promise<void>` — state machine: scheduled→canary(canary_pct=10), canary→progressive(canary_pct=50), progressive→completed(canary_pct=100, upgraded_at=now()), any→rolled_back (creates new row with swapped versions); insertAuditLog per transition
   - `getMigrationPreview(migrationId: string): Promise<MigrationDiff>` — returns JSON diff between current_version and target_version for display in UI
   
2. Status transition guard:
```ts
const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['canary', 'rolled_back'],
  canary: ['progressive', 'rolled_back'],
  progressive: ['completed', 'rolled_back'],
}
```

## Files
**Create:** `apps/web/lib/settings/tenant-migrations.actions.ts`

## Done when
- `vitest apps/web/lib/settings/tenant-migrations.actions.test.ts` PASS — state machine transitions correct, invalid transitions rejected
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/tenant-migrations.actions.ts`
```

### Test gate
- **Unit:** `vitest apps/web/lib/settings/tenant-migrations.actions.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/tenant-migrations.actions.ts`

---

## T-02SETb-004 — T3: TenantVariationsDashboard + DeptTaxonomyEditor

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~60k tokens
**Est time:** 90 min
**Parent feature:** 02-SETTINGS §9.7 UI surfaces (SET-060, SET-061)
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETb-002]
- **Downstream (will consume this):** [T-02SETb-006]
- **Parallel (can run concurrently):** [T-02SETb-005]

### GIVEN / WHEN / THEN
**GIVEN** `updateDeptOverrides` and `getAllEffectiveDepts` actions exist
**WHEN** admin visits /settings/tenant-variations and edits dept taxonomy
**THEN** current L2 overrides displayed, dept split/merge/add operations saved via Server Action, audit entry created

### ACP Prompt
```
# Task T-02SETb-004 — TenantVariationsDashboard + DeptTaxonomyEditor

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §9.1`, `## §9.2`, `## §9.7`

## Twoje zadanie
Build SET-060 (Tenant Variations Dashboard) and SET-061 (Dept Taxonomy Editor) React components.

## Implementacja
1. Utwórz `apps/web/app/(settings)/settings/tenant-variations/page.tsx` — server component, fetch tenantVariations + call getAllEffectiveDepts, render TenantVariationsDashboard
2. Utwórz `apps/web/components/settings/TenantVariationsDashboard.tsx` — client component:
   - Shows active L2 overrides as badge list (dept splits/merges/adds)
   - "Edit Dept Taxonomy" button → opens DeptTaxonomyEditor dialog
   - "Edit Rule Variants" button → opens RuleVariantSelector dialog (stub)
3. Utwórz `apps/web/components/settings/DeptTaxonomyEditor.tsx` — Radix Dialog + RHF:
   - `import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'`
   - `import { useForm } from 'react-hook-form'` + `zodResolver`
   - Baseline 7 depts list: `['core', 'technical', 'packaging', 'mrp', 'planning', 'production', 'price']`
   - Operations: Split (source dept + 2 target names) / Add (code + name_pl + display_order)
   - On submit: call `updateDeptOverrides` Server Action
   - Loading: `<Skeleton className="h-4 w-full" />`; Error: `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`

## Prototype reference
Plik: none
Translation checklist:
- [ ] Replace window.Modal → Dialog + DialogContent
- [ ] Convert to useForm + zodResolver
- [ ] Wire updateDeptOverrides Server Action
- [ ] Add loading/error states per shadcn patterns

## Files
**Create:** `apps/web/app/(settings)/settings/tenant-variations/page.tsx`, `apps/web/components/settings/TenantVariationsDashboard.tsx`, `apps/web/components/settings/DeptTaxonomyEditor.tsx`

## Done when
- `vitest apps/web/components/settings/TenantVariationsDashboard.test.tsx` PASS — renders 7 baseline depts, dialog opens on click
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/app/(settings)/settings/tenant-variations/ apps/web/components/settings/TenantVariationsDashboard.tsx apps/web/components/settings/DeptTaxonomyEditor.tsx`
```

### Test gate
- **Unit:** `vitest apps/web/components/settings/TenantVariationsDashboard.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/components/settings/TenantVariationsDashboard.tsx`

---

## T-02SETb-005 — T3: RuleVariantSelector + UpgradeOrchestration UI

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~55k tokens
**Est time:** 80 min
**Parent feature:** 02-SETTINGS §9.3, §9.4, §9.7 (SET-062, SET-063, SET-064)
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETb-003, T-02SETb-004]
- **Downstream (will consume this):** [T-02SETb-006]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** upgrade orchestration actions exist
**WHEN** admin views /settings/upgrades and advances a migration through canary/progressive/complete
**THEN** migration status badge updates, canary_pct shown, rollback button available on active migrations

### ACP Prompt
```
# Task T-02SETb-005 — RuleVariantSelector + UpgradeOrchestration UI

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §9.3`, `## §9.4`, `## §9.7`
- `apps/web/lib/settings/tenant-migrations.actions.ts` → advanceMigration, getMigrationPreview

## Twoje zadanie
Build SET-062 (Rule Variant Selector), SET-063 (Upgrade Orchestration), SET-064 (Migration History).

## Implementacja
1. Utwórz `apps/web/app/(settings)/settings/upgrades/page.tsx` — server component, fetch tenant_migrations list
2. Utwórz `apps/web/components/settings/UpgradeOrchestration.tsx`:
   - Migration cards with status badge: `Badge` variant per status: scheduled=secondary, canary=yellow, progressive=blue, completed=green, rolled_back=destructive
   - Advance button calls `advanceMigration` with appropriate action
   - Canary progress: `<Progress value={canaryPct} className="h-2" />` (shadcn Progress)
   - Rollback: confirm dialog before calling `advanceMigration(id, 'rollback')`
   - "Preview diff" button calls `getMigrationPreview` and renders JSON in Collapsible
3. Utwórz `apps/web/components/settings/RuleVariantSelector.tsx`:
   - Select per rule_code → 'v1'|'v2' (Radix Select)
   - Wire `updateRuleVariantOverrides` Server Action on change
   - shadcn imports: `Badge, Button, Progress, Collapsible, CollapsibleContent, CollapsibleTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue`

## Prototype reference
Plik: none
Translation checklist:
- [ ] Wire advanceMigration Server Action
- [ ] Replace window.confirm → Dialog + DialogContent
- [ ] Add Progress component for canary_pct
- [ ] Add Collapsible for JSON diff preview

## Files
**Create:** `apps/web/app/(settings)/settings/upgrades/page.tsx`, `apps/web/components/settings/UpgradeOrchestration.tsx`, `apps/web/components/settings/RuleVariantSelector.tsx`

## Done when
- `vitest apps/web/components/settings/UpgradeOrchestration.test.tsx` PASS — status badges correct, advance button calls action
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/app/(settings)/settings/upgrades/ apps/web/components/settings/UpgradeOrchestration.tsx apps/web/components/settings/RuleVariantSelector.tsx`
```

### Test gate
- **Unit:** `vitest apps/web/components/settings/UpgradeOrchestration.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/components/settings/UpgradeOrchestration.tsx`

---

## T-02SETb-006 — T4: integration test — tenant L2 lifecycle

**Type:** T4-wiring+test
**Context budget:** ~55k tokens
**Est time:** 60 min
**Parent feature:** 02-SETTINGS §9 [ADR-031]
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETb-003, T-02SETb-005]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** tenant_variations + tenant_migrations tables exist with RLS
**WHEN** dept split/merge and upgrade orchestration actions executed against local Supabase
**THEN** dept resolver correctly returns L2-mapped depts, migration state machine transitions validated, RLS isolates per tenant

### ACP Prompt
```
# Task T-02SETb-006 — integration test: tenant L2 lifecycle

## Context
- `apps/web/lib/settings/dept-resolver.ts` → deptResolver function
- `apps/web/lib/settings/tenant-migrations.actions.ts` → createTenantMigration, advanceMigration

## Twoje zadanie
Integration tests against real Supabase local DB (zero mocks). Tests cover dept split/merge resolution and migration state machine.

## Implementacja
1. Utwórz `apps/web/lib/settings/tenant-l2.integration.test.ts`:
   - Setup: create 2 test tenants, seed tenant_variations for tenant A (dept split: technical → food-safety + quality-lab)
   - Test 1: `deptResolver(tenantA.id, 'technical')` → should map to 'food-safety' (first target)
   - Test 2: `deptResolver(tenantB.id, 'technical')` → should return 'technical' (no override)
   - Test 3: migration state machine — create scheduled→canary(canary_pct=10)→progressive(50)→completed(100), assert upgradedAt set
   - Test 4: rollback from canary → rolled_back status, new inverse migration row created
   - Test 5: RLS — tenant B cannot read tenant A's tenant_variations (use supabaseLocalDb with tenantB session)

## Files
**Create:** `apps/web/lib/settings/tenant-l2.integration.test.ts`

## Done when
- `vitest apps/web/lib/settings/tenant-l2.integration.test.ts` PASS — all 5 tests pass against real DB
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/tenant-l2.integration.test.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/tenant-l2.integration.test.ts` — 5 scenarios, real Supabase local
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/tenant-l2.integration.test.ts`

---

## §2 — 02SETc: Schema Admin Wizard (§6)

## T-02SETc-001 — T1: reference_schemas + schema_migrations Drizzle schema

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 02-SETTINGS §6 Schema Admin Wizard [ADR-028]
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000, T-02SETa-001]
- **Downstream (will consume this):** [T-02SETc-002, T-02SETc-003, T-02SETc-004, T-02SETc-005]
- **Parallel (can run concurrently):** [T-02SETb-001, T-02SETd-001]

### GIVEN / WHEN / THEN
**GIVEN** Foundation baseline migration and organizations table exist
**WHEN** `reference_schemas` and `schema_migrations` Drizzle schema generated and migrated
**THEN** both tables exist with all columns from PRD §5.2, UNIQUE constraints, RLS enabled

### ACP Prompt
```
# Task T-02SETc-001 — reference_schemas + schema_migrations schema

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §5.2` — exact column specs

## Twoje zadanie
Create Drizzle schema for schema wizard tables.

## Implementacja
1. Utwórz `apps/web/drizzle/schema/settings-schema-wizard.ts`:
```ts
export const referenceSchemas = pgTable('reference_schemas', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id),   // NULL = universal L1
  tableCode: text('table_code').notNull(),    // 'main_table'|'bom'|'reference.<code>'
  columnCode: text('column_code').notNull(),
  deptCode: text('dept_code'),
  dataType: text('data_type').notNull(),      // 'text'|'number'|'date'|'enum'|'formula'|'relation'
  tier: text('tier').notNull(),               // 'L1'|'L2'|'L3'|'L4'
  storage: text('storage').notNull(),         // 'native'|'ext_jsonb'|'private_jsonb'
  dropdownSource: text('dropdown_source'),
  blockingRule: text('blocking_rule'),        // ''|'core_done'|'pack_size_filled'|'line_filled'|'core_production_done'
  requiredForDone: boolean('required_for_done').notNull().default(false),
  validationJson: jsonb('validation_json').default('{}'),
  presentationJson: jsonb('presentation_json').default('{}'),
  schemaVersion: integer('schema_version').notNull().default(1),
  deprecatedAt: timestamp('deprecated_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // R13:
  tenantId: uuid('tenant_id').references(() => organizations.id),
  createdByUser: uuid('created_by_user'),
  createdByDevice: uuid('created_by_device'),
  appVersion: text('app_version'),
  externalId: text('external_id'),
}, (t) => ({ uniq: unique().on(t.orgId, t.tableCode, t.columnCode) }))

export const schemaMigrations = pgTable('schema_migrations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id),
  tableCode: text('table_code').notNull(),
  columnCode: text('column_code'),
  action: text('action').notNull(),      // 'add'|'edit'|'deprecate'|'promote_l2_to_l1'
  tierBefore: text('tier_before'),
  tierAfter: text('tier_after'),
  migrationScript: text('migration_script'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  status: text('status').notNull().default('pending'),  // 'pending'|'approved'|'running'|'completed'|'failed'|'rolled_back'
  resultNotes: text('result_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
})
```
2. `pnpm drizzle-kit generate` → migration SQL
3. Add RLS to migration SQL for both tables (org_id = fn_current_org())
4. `pnpm drizzle-kit migrate`

## Files
**Create:** `apps/web/drizzle/schema/settings-schema-wizard.ts`
**Modify:** `apps/web/drizzle/schema/index.ts`

## Done when
- `vitest apps/web/drizzle/schema/settings-schema-wizard.test.ts` PASS — tables exist, unique constraint, RLS active
- `pnpm test:smoke` green

## Rollback
`pnpm drizzle-kit drop --name settings-schema-wizard`
```

### Test gate
- **Integration:** `vitest apps/web/drizzle/schema/settings-schema-wizard.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm drizzle-kit drop --name settings-schema-wizard`

---

## T-02SETc-002 — T2: column CRUD + draft/publish Server Actions

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 75 min
**Parent feature:** 02-SETTINGS §6.1, §6.4
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETc-001, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETc-005, T-02SETc-006]
- **Parallel (can run concurrently):** [T-02SETc-003]

### GIVEN / WHEN / THEN
**GIVEN** `reference_schemas` table exists
**WHEN** admin creates/edits/deprecates a column and publishes the draft
**THEN** `reference_schemas` row upserted, `schema_version` incremented, `schema_migrations` record created (status=completed for L2/L3, pending for L1), audit_log entry inserted

### ACP Prompt
```
# Task T-02SETc-002 — column CRUD + draft/publish Server Actions

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §6.1`, `## §6.4` — 8-step flow + draft/publish model
- `apps/web/drizzle/schema/settings-schema-wizard.ts`

## Twoje zadanie
Server Actions for the Schema Admin Wizard CRUD and draft/publish flow.

## Implementacja
1. Utwórz `apps/web/lib/settings/schema-wizard.actions.ts` (`'use server'`):
   - `upsertColumn(input: ColumnInput): Promise<string>` — RBAC `Permission.SETTINGS_SCHEMA_EDIT`, validate dataType ∈ ['text','number','date','enum','formula','relation'], upsert reference_schemas, insert schema_migrations (action='add'|'edit', tier='L2'|'L3', status='completed'), insertAuditLog, return column id
   - `deprecateColumn(colId: string): Promise<void>` — sets deprecated_at=now(), schema_migrations action='deprecate' status='completed'
   - `publishColumnDraft(orgId: string, tableCode: string): Promise<void>` — increments schema_version on all pending rows for this (orgId, tableCode), triggers Zod cache invalidation (call revalidateTag('zod-schema-${orgId}-${tableCode}'))
   - Concurrent edit guard: read current schema_version, reject if mismatch (V-SET-04)

2. Zod input schema:
```ts
const ColumnInputSchema = z.object({
  orgId: z.string().uuid(),
  tableCode: z.string(),
  columnCode: z.string().min(1).max(50),
  deptCode: z.string().optional(),
  dataType: z.enum(['text','number','date','enum','formula','relation']),
  tier: z.enum(['L2','L3']),  // L1 promotion is separate flow
  storage: z.enum(['native','ext_jsonb','private_jsonb']),
  dropdownSource: z.string().optional(),
  blockingRule: z.enum(['','core_done','pack_size_filled','line_filled','core_production_done']),
  requiredForDone: z.boolean(),
  validationJson: z.record(z.unknown()).optional(),
  presentationJson: z.record(z.unknown()).optional(),
})
```

## Files
**Create:** `apps/web/lib/settings/schema-wizard.actions.ts`

## Done when
- `vitest apps/web/lib/settings/schema-wizard.actions.test.ts` PASS — upsert creates record, version increments on publish, concurrent edit rejected
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/schema-wizard.actions.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/schema-wizard.actions.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/schema-wizard.actions.ts`

---

## T-02SETc-003 — T2: L1 promotion flow + Zod runtime gen endpoint

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 02-SETTINGS §6.3, §6.5
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETc-001, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETc-005, T-02SETc-007]
- **Parallel (can run concurrently):** [T-02SETc-002]

### GIVEN / WHEN / THEN
**GIVEN** `reference_schemas` and `schema_migrations` tables exist
**WHEN** admin requests L1 promotion OR client fetches Zod schema for a table
**THEN** L1 promotion creates schema_migrations (status='pending', requires superadmin approval); Zod endpoint returns compiled ZodObject from reference_schemas columns, cached per (org_id, schema_version)

### ACP Prompt
```
# Task T-02SETc-003 — L1 promotion + Zod runtime gen endpoint

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §6.3`, `## §6.5` — L1 promotion flow + Zod gen endpoint

## Twoje zadanie
L1 promotion Server Action and Zod runtime generation API endpoint.

## Implementacja
1. Dodaj do `apps/web/lib/settings/schema-wizard.actions.ts`:
   - `requestL1Promotion(colId: string, migrationScript: string): Promise<void>` — RBAC `Permission.SETTINGS_SCHEMA_PROMOTE_L1`, insert schema_migrations (action='promote_l2_to_l1', status='pending', migration_script), insertOutboxEvent(EventType.SCHEMA_L1_PROMOTION_REQUESTED), insertAuditLog
   - `approveL1Promotion(migrationId: string): Promise<void>` — RBAC `Permission.SETTINGS_SCHEMA_PROMOTE_L1` + superadmin check, update status='approved', approvedBy/At, insertAuditLog

2. Utwórz `apps/web/app/api/settings/schema/zod/[tableCode]/route.ts`:
   - `GET handler`: reads reference_schemas for (orgId from session, tableCode), compiles ZodObject:
     - 'text' → z.string()
     - 'number' → z.number()
     - 'boolean' → z.boolean()
     - 'date' → z.string().datetime()
     - 'enum' → z.enum([...validationJson.enum_values])
     - 'jsonb' → z.record(z.unknown())
     - Apply validation_json.required (wrap in z.optional if false), regex, range
   - Cache: `unstable_cache(fn, [orgId, tableCode], { tags: ['zod-schema-${orgId}-${tableCode}'], revalidate: 300 })`
   - Returns: compiled ZodObject as JSON schema string

## Files
**Modify:** `apps/web/lib/settings/schema-wizard.actions.ts`
**Create:** `apps/web/app/api/settings/schema/zod/[tableCode]/route.ts`

## Done when
- `vitest apps/web/app/api/settings/schema/zod/zod-endpoint.test.ts` PASS — text/number/enum fields compile correctly, cache invalidated on publishColumnDraft
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/app/api/settings/schema/zod/[tableCode]/route.ts`
```

### Test gate
- **Integration:** `vitest apps/web/app/api/settings/schema/zod/zod-endpoint.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/app/api/settings/schema/zod/[tableCode]/route.ts`

---

## T-02SETc-004 — T3: SchemaBrowser (SET-030) + SchemaDiffViewer (SET-032)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~60k tokens
**Est time:** 90 min
**Parent feature:** 02-SETTINGS §6.6 UI surfaces (SET-030, SET-032, SET-033)
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETc-002]
- **Downstream (will consume this):** [T-02SETc-006]
- **Parallel (can run concurrently):** [T-02SETc-005]

### GIVEN / WHEN / THEN
**GIVEN** reference_schemas rows exist for tenant
**WHEN** admin visits /settings/schema-browser
**THEN** columns listed per table grouped by dept, tier badge shown (L1/L2/L3/L4), version diff accessible

### ACP Prompt
```
# Task T-02SETc-004 — SchemaBrowser + SchemaDiffViewer

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §6.6` — SET-030, SET-032, SET-033 specs

## Twoje zadanie
Build Schema Browser (SET-030) listing all columns per table with tier badges and version diff.

## Implementacja
1. Utwórz `apps/web/app/(settings)/settings/schema/page.tsx` — server component, fetch reference_schemas grouped by tableCode
2. Utwórz `apps/web/components/settings/SchemaBrowser.tsx`:
   - Collapsible sections per tableCode (Radix Collapsible)
   - Each row: columnCode, dataType, tier Badge (L1=default, L2=secondary, L3=outline, L4=destructive), dept badge, requiredForDone indicator
   - "Edit" button → ColumnEditWizard dialog (stub, links to T-02SETc-005)
   - "Deprecate" button → confirm + call deprecateColumn action
   - "Request L1 Promotion" button (visible only for L3 cols, only for owner/superadmin)
3. Utwórz `apps/web/components/settings/SchemaDiffViewer.tsx`:
   - Compare N vs N-1 schema_version per column
   - Side-by-side JSON diff using `diff` npm package
   - Opened from SchemaBrowser "History" link
4. Utwórz `apps/web/components/settings/SchemaMigrationsQueue.tsx` (SET-033):
   - List schema_migrations WHERE status='pending' (L1 promotion queue)
   - "Approve" button for superadmin → calls approveL1Promotion

Imports: `Badge, Button, Collapsible, CollapsibleContent, CollapsibleTrigger, Skeleton, Alert, AlertDescription`

## Prototype reference
Plik: none
Translation checklist:
- [ ] Collapsible sections per table
- [ ] Wire deprecateColumn + approveL1Promotion Server Actions
- [ ] Tier badge color coding
- [ ] JSON diff side-by-side

## Files
**Create:** `apps/web/app/(settings)/settings/schema/page.tsx`, `apps/web/components/settings/SchemaBrowser.tsx`, `apps/web/components/settings/SchemaDiffViewer.tsx`, `apps/web/components/settings/SchemaMigrationsQueue.tsx`

## Done when
- `vitest apps/web/components/settings/SchemaBrowser.test.tsx` PASS — columns render, tier badge matches, L3 shows promotion button
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/app/(settings)/settings/schema/ apps/web/components/settings/SchemaBrowser.tsx`
```

### Test gate
- **Unit:** `vitest apps/web/components/settings/SchemaBrowser.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/components/settings/SchemaBrowser.tsx`

---

## T-02SETc-005 — T3: ColumnEditWizard 8-step (SET-031) + PreviewShadow (SET-034)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~70k tokens
**Est time:** 120 min
**Parent feature:** 02-SETTINGS §6.1, §6.4, §6.6 (SET-031, SET-034)
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETc-002, T-02SETc-003, T-02SETc-004]
- **Downstream (will consume this):** [T-02SETc-006]
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** column CRUD actions exist, Zod runtime gen endpoint exists
**WHEN** admin opens Column Edit Wizard and completes 8 steps
**THEN** column saved as draft → published → schema_version bumped; Preview Shadow shows rendered form with sample data

### ACP Prompt
```
# Task T-02SETc-005 — ColumnEditWizard 8-step + PreviewShadow

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §6.1` — 8-step flow spec, `## §6.4` — draft/publish model

## Twoje zadanie
8-step wizard for adding/editing a schema column, plus shadow preview.

## Implementacja
1. Utwórz `apps/web/components/settings/ColumnEditWizard.tsx` — multi-step Dialog:
   - Step 1: Pick table (Select: main_table | bom | reference.<code>)
   - Step 2: Pick dept (Select from getAllEffectiveDepts)
   - Step 3: Pick data type (RadioGroup: text/number/date/enum/formula/relation)
   - Step 4: Validation rules (multi-select Checkbox: required/unique/regex/range/dropdown_source)
   - Step 5: Blocking rule (Select: ''/core_done/pack_size_filled/line_filled/core_production_done)
   - Step 6: required_for_done (Checkbox)
   - Step 7: Presentation config (section, order, visible_per_role, export_flag) — simple form
   - Step 8: Preview → renders PreviewShadow; "Save Draft" + "Publish" buttons
   - State: `useForm` + `zodResolver` per step; stepper state via `useState` (currentStep 1-8)
   - On "Publish": call `upsertColumn` then `publishColumnDraft`

2. Utwórz `apps/web/components/settings/PreviewShadow.tsx` (SET-034):
   - Fetches Zod schema from `/api/settings/schema/zod/${tableCode}`
   - Renders RHF form with shadcn Form/Input/Select fields driven by schema
   - Sample data (auto-generated fake values per field type)
   - Read-only mode (no submit)

Imports: `Dialog, DialogContent, DialogHeader, Form, FormField, FormLabel, FormControl, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Checkbox, RadioGroup, RadioGroupItem, Button, Skeleton`

## Prototype reference
Plik: none
Translation checklist:
- [ ] 8-step stepper via useState (no external lib)
- [ ] Each step = RHF FormField
- [ ] Wire upsertColumn + publishColumnDraft
- [ ] PreviewShadow fetches Zod endpoint

## Files
**Create:** `apps/web/components/settings/ColumnEditWizard.tsx`, `apps/web/components/settings/PreviewShadow.tsx`

## Done when
- `vitest apps/web/components/settings/ColumnEditWizard.test.tsx` PASS — 8 steps render, submit calls upsertColumn + publishColumnDraft
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/components/settings/ColumnEditWizard.tsx apps/web/components/settings/PreviewShadow.tsx`
```

### Test gate
- **Unit:** `vitest apps/web/components/settings/ColumnEditWizard.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/components/settings/ColumnEditWizard.tsx`

---

## T-02SETc-006 — T4: integration + E2E — schema wizard end-to-end

**Type:** T4-wiring+test
**Context budget:** ~65k tokens
**Est time:** 75 min
**Parent feature:** 02-SETTINGS §6 [ADR-028]
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETc-005]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** schema wizard actions + UI components exist
**WHEN** integration test adds L2 column and publishes it; E2E walks the 8-step wizard
**THEN** reference_schemas row created, schema_version incremented, Zod endpoint returns updated schema with new field, E2E shows new column in SchemaBrowser

### ACP Prompt
```
# Task T-02SETc-006 — integration + E2E: schema wizard end-to-end

## Context
- `apps/web/lib/settings/schema-wizard.actions.ts` → upsertColumn, publishColumnDraft
- `apps/web/app/api/settings/schema/zod/[tableCode]/route.ts` → Zod gen endpoint

## Twoje zadanie
Integration test (real DB) + Playwright E2E for schema wizard complete flow.

## Implementacja
1. Utwórz `apps/web/lib/settings/schema-wizard.integration.test.ts`:
   - Test 1: upsertColumn (L2 text field) → reference_schemas row exists, schema_migrations action='add' status='completed'
   - Test 2: publishColumnDraft → schema_version incremented on all rows for (orgId, tableCode)
   - Test 3: Zod endpoint returns object with new field as z.string()
   - Test 4: deprecateColumn → deprecated_at set, Zod endpoint excludes deprecated col
   - Test 5: concurrent edit rejected — upsertColumn with stale schema_version fails
   - Test 6: RLS — org B cannot read org A's reference_schemas

2. Utwórz `e2e/settings/schema-wizard.spec.ts`:
   - Navigate to /settings/schema-browser
   - Click "Add Column" → wizard opens
   - Complete 8 steps with test data (tableCode=main_table, columnCode=test_col, type=text, tier=L2)
   - Click Publish
   - Assert new column appears in SchemaBrowser list

## Files
**Create:** `apps/web/lib/settings/schema-wizard.integration.test.ts`, `e2e/settings/schema-wizard.spec.ts`

## Done when
- `vitest apps/web/lib/settings/schema-wizard.integration.test.ts` PASS — 6 integration scenarios
- `playwright e2e/settings/schema-wizard.spec.ts` PASS — full wizard flow
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/schema-wizard.integration.test.ts e2e/settings/schema-wizard.spec.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/schema-wizard.integration.test.ts`
- **E2E:** `playwright e2e/settings/schema-wizard.spec.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/schema-wizard.integration.test.ts`

---

## §3 — 02SETd: Rule Registry + Reference CRUD (§7 + §8)

## T-02SETd-001 — T1: rule_definitions + rule_dry_runs + reference_tables schema

**Type:** T1-schema
**Context budget:** ~40k tokens
**Est time:** 50 min
**Parent feature:** 02-SETTINGS §5.3, §5.5
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000, T-02SETa-001]
- **Downstream (will consume this):** [T-02SETd-002, T-02SETd-003, T-02SETd-004, T-02SETd-005]
- **Parallel (can run concurrently):** [T-02SETb-001, T-02SETc-001]

### GIVEN / WHEN / THEN
**GIVEN** Foundation baseline migration exists
**WHEN** Drizzle schema for rule registry and reference tables migrated
**THEN** `rule_definitions`, `rule_dry_runs`, `reference_tables` tables exist with RLS, materialized view trigger for dropdown caches

### ACP Prompt
```
# Task T-02SETd-001 — rule_definitions + rule_dry_runs + reference_tables schema

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §5.3`, `## §5.5` — exact column specs

## Twoje zadanie
Create Drizzle schema for rule registry tables and generic reference_tables storage.

## Implementacja
1. Utwórz `apps/web/drizzle/schema/settings-rules-reference.ts`:
```ts
export const ruleDefinitions = pgTable('rule_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id),   // NULL = universal L1
  ruleCode: text('rule_code').notNull(),
  ruleType: text('rule_type').notNull(),    // 'cascading'|'conditional'|'gate'|'workflow'
  tier: text('tier').notNull().default('L1'),
  definitionJson: jsonb('definition_json').notNull(),
  version: integer('version').notNull().default(1),
  activeFrom: timestamp('active_from', { withTimezone: true }).notNull().defaultNow(),
  activeTo: timestamp('active_to', { withTimezone: true }),
  deployedBy: uuid('deployed_by').references(() => users.id),
  deployRef: text('deploy_ref'),
  // R13:
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (t) => ({ uniq: unique().on(t.orgId, t.ruleCode, t.version) }))

export const ruleDryRuns = pgTable('rule_dry_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id),
  ruleDefinitionId: uuid('rule_definition_id').notNull().references(() => ruleDefinitions.id),
  sampleInputJson: jsonb('sample_input_json').notNull(),
  resultJson: jsonb('result_json').notNull(),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow(),
  ranBy: uuid('ran_by').references(() => users.id),
  schemaVersion: integer('schema_version').notNull().default(1),
})

// Generic metadata-driven storage for 25 Reference config tables
export const referenceTables = pgTable('reference_tables', {
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  tableCode: text('table_code').notNull(),   // 'pack_sizes'|'templates'|'allergens'|'d365_constants'|...
  rowKey: text('row_key').notNull(),
  rowData: jsonb('row_data').notNull(),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (t) => ({ pk: primaryKey({ columns: [t.orgId, t.tableCode, t.rowKey] }) }))
```
2. `pnpm drizzle-kit generate` → migration SQL
3. Add RLS to migration: all 3 tables use `org_id = fn_current_org()`
4. Add materialized view per org+table_code for dropdown caches + trigger `REFRESH MATERIALIZED VIEW CONCURRENTLY`
5. `pnpm drizzle-kit migrate`

## Files
**Create:** `apps/web/drizzle/schema/settings-rules-reference.ts`
**Modify:** `apps/web/drizzle/schema/index.ts`

## Done when
- `vitest apps/web/drizzle/schema/settings-rules-reference.test.ts` PASS — tables exist, unique constraint, RLS active
- `pnpm test:smoke` green

## Rollback
`pnpm drizzle-kit drop --name settings-rules-reference`
```

### Test gate
- **Integration:** `vitest apps/web/drizzle/schema/settings-rules-reference.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm drizzle-kit drop --name settings-rules-reference`

---

## T-02SETd-002 — T2: deployRule migration action + rule registry queries

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 60 min
**Parent feature:** 02-SETTINGS §7.2, §7.3
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETd-001, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETd-004, T-02SETd-005]
- **Parallel (can run concurrently):** [T-02SETd-003]

### GIVEN / WHEN / THEN
**GIVEN** rule_definitions table exists
**WHEN** CI/CD deploy pipeline runs `deployRule` OR admin reads rule registry
**THEN** rule upserted with version=prior+1, previous row gets active_to=now(), audit_log entry, EventType.RULE_DEPLOYED outbox event, admin can list/filter rules

### ACP Prompt
```
# Task T-02SETd-002 — deployRule + rule registry queries

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §7.2`, `## §7.3` — dev deploy workflow + admin capabilities

## Twoje zadanie
Server Actions for rule deployment (CI/CD use) and rule registry read operations.

## Implementacja
1. Utwórz `apps/web/lib/settings/rule-registry.actions.ts` (`'use server'`):
   - `deployRule(input: DeployRuleInput): Promise<void>` — internal action (called by migration, not UI); upserts rule_definitions: finds max(version) for (orgId, ruleCode), sets previous row active_to=now(), inserts new row version=max+1; insertAuditLog action='rule_deploy' new_data=DSL body; insertOutboxEvent(EventType.RULE_DEPLOYED, 'rule_definition', id, {ruleCode, version, deployRef}); validates ruleType ∈ ['cascading','conditional','gate','workflow']
   - `getRuleList(orgId: string, filters?: { ruleType?, active?: boolean }): Promise<RuleListItem[]>` — RBAC `Permission.SETTINGS_RULES_VIEW`, query rule_definitions ORDER BY ruleCode, version DESC
   - `getRuleDetail(ruleId: string): Promise<RuleDetail>` — returns definition_json + version history + dry-run results count
   - `getRuleVersionHistory(orgId: string, ruleCode: string): Promise<RuleDefinition[]>` — all versions for rule, ORDER BY version DESC

2. Zod: `DeployRuleInputSchema = z.object({ orgId: z.string().uuid().optional(), ruleCode: z.string(), ruleType: z.enum(['cascading','conditional','gate','workflow']), tier: z.enum(['L1','L2','L3']), definitionJson: z.record(z.unknown()), deployRef: z.string().optional() })`

## Files
**Create:** `apps/web/lib/settings/rule-registry.actions.ts`

## Done when
- `vitest apps/web/lib/settings/rule-registry.actions.test.ts` PASS — deployRule increments version, prior row active_to set, audit entry exists
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/rule-registry.actions.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/rule-registry.actions.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/rule-registry.actions.ts`

---

## T-02SETd-003 — T2: reference_tables generic CRUD + CSV import/export actions

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 75 min
**Parent feature:** 02-SETTINGS §8.3, §8.4, §8.5
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETd-001, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETd-006, T-02SETd-007]
- **Parallel (can run concurrently):** [T-02SETd-002]

### GIVEN / WHEN / THEN
**GIVEN** reference_tables generic storage exists
**WHEN** admin creates/updates/soft-deletes a row or imports CSV
**THEN** row upserted with version++ + audit_log entry; CSV import returns summary (X inserted, Y updated, Z skipped, W errors); optimistic lock rejects stale version

### ACP Prompt
```
# Task T-02SETd-003 — reference_tables generic CRUD + CSV import/export

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §8.3`, `## §8.4`, `## §8.5` — CRUD ops, version+audit, CSV import/export

## Twoje zadanie
Generic Server Actions for reference_tables CRUD and CSV bulk operations.

## Implementacja
1. Utwórz `apps/web/lib/settings/reference-tables.actions.ts` (`'use server'`):
   - `upsertReferenceRow(input: { orgId, tableCode, rowKey, rowData, expectedVersion? }): Promise<void>` — RBAC `Permission.SETTINGS_REFERENCE_EDIT`; if expectedVersion provided: read current version, reject if mismatch (V-SET-21 optimistic lock); upsert with version++, updatedAt=now(); insertAuditLog action='update' old_data/new_data diff; trigger materialized view refresh revalidateTag
   - `softDeleteReferenceRow(orgId: string, tableCode: string, rowKey: string): Promise<void>` — set is_active=false, insertAuditLog
   - `getReferenceRows(orgId: string, tableCode: string, options?: { includeInactive?, page?, limit? }): Promise<{ rows, total }>` — RBAC `Permission.SETTINGS_REFERENCE_VIEW`
   - `importReferenceCSV(orgId: string, tableCode: string, csvContent: string): Promise<ImportSummary>` — parse CSV headers from first row, validate against reference_schemas for tableCode (V-SET-23); per row: detect Insert/Update/Skip/Error; return `{ inserted: N, updated: N, skipped: N, errors: ErrorRow[] }`; batch upsert on confirm
   - `exportReferenceCSV(orgId: string, tableCode: string): Promise<string>` — active rows → CSV with header from reference_schemas

2. `ImportSummary` type: `{ inserted: number; updated: number; skipped: number; errors: { rowKey: string; issue: string }[] }`

## Files
**Create:** `apps/web/lib/settings/reference-tables.actions.ts`

## Done when
- `vitest apps/web/lib/settings/reference-tables.actions.test.ts` PASS — upsert+version++, optimistic lock rejects, CSV import summary correct
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/reference-tables.actions.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/reference-tables.actions.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/reference-tables.actions.ts`

---

## T-02SETd-004 — T3: Rules Registry UI (SET-040, SET-041, SET-042)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~60k tokens
**Est time:** 90 min
**Parent feature:** 02-SETTINGS §7.2, §7.6
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETd-002]
- **Downstream (will consume this):** [T-02SETd-008]
- **Parallel (can run concurrently):** [T-02SETd-005]

### GIVEN / WHEN / THEN
**GIVEN** rule registry queries exist (getRuleList, getRuleDetail, getRuleVersionHistory)
**WHEN** admin visits /settings/rules
**THEN** rules listed with filter by type/active, detail shows JSON + Mermaid flowchart stub + version history, version diff side-by-side

### ACP Prompt
```
# Task T-02SETd-004 — Rules Registry UI (SET-040, SET-041, SET-042)

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §7.2`, `## §7.6` — admin capabilities + UI surfaces

## Twoje zadanie
Read-only Rule Registry UI (admin cannot edit, only view + audit).

## Implementacja
1. Utwórz `apps/web/app/(settings)/settings/rules/page.tsx` — server component, call getRuleList
2. Utwórz `apps/web/components/settings/RulesRegistry.tsx` (SET-040):
   - Filter bar: ruleType (Select: all/cascading/conditional/gate/workflow), active (Checkbox)
   - Table: ruleCode | ruleType | version | activeFrom | deployRef | DryRun badge
   - Click row → RuleDetail sheet (Radix Sheet)
3. Utwórz `apps/web/components/settings/RuleDetail.tsx` (SET-041):
   - JSON pretty-print of definitionJson (pre/code block)
   - Mermaid flowchart placeholder (renders `flowchart TD` with rule nodes — use mermaid npm package)
   - Version history tab (getRuleVersionHistory)
   - Dry-run results list (rule_dry_runs count + last ran_at)
4. Utwórz `apps/web/components/settings/RuleVersionDiff.tsx` (SET-042):
   - Side-by-side JSON diff (use `diff` npm package, format as JSON patch)
   - Opened from Version History list "Compare" button

Imports: `Badge, Button, Sheet, SheetContent, SheetHeader, SheetTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Checkbox, Skeleton, Alert, AlertDescription`

## Prototype reference
Plik: none
Translation checklist:
- [ ] Sheet for rule detail (not Dialog — full side panel)
- [ ] Mermaid import + render in useEffect
- [ ] Wire getRuleList, getRuleDetail, getRuleVersionHistory
- [ ] Read-only — no edit/delete buttons

## Files
**Create:** `apps/web/app/(settings)/settings/rules/page.tsx`, `apps/web/components/settings/RulesRegistry.tsx`, `apps/web/components/settings/RuleDetail.tsx`, `apps/web/components/settings/RuleVersionDiff.tsx`

## Done when
- `vitest apps/web/components/settings/RulesRegistry.test.tsx` PASS — filter renders correct subset, detail sheet opens
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/app/(settings)/settings/rules/ apps/web/components/settings/RulesRegistry.tsx`
```

### Test gate
- **Unit:** `vitest apps/web/components/settings/RulesRegistry.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/components/settings/RulesRegistry.tsx`

---

## T-02SETd-005 — T3: Reference Tables UI (SET-050 through SET-054)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~65k tokens
**Est time:** 100 min
**Parent feature:** 02-SETTINGS §8.6
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETd-003]
- **Downstream (will consume this):** [T-02SETd-008]
- **Parallel (can run concurrently):** [T-02SETd-004]

### GIVEN / WHEN / THEN
**GIVEN** reference_tables CRUD + CSV import/export actions exist
**WHEN** admin visits /settings/reference and selects a table
**THEN** generic data grid shows rows with schema-driven columns; row edit modal uses RHF+Zod; CSV import shows preview before commit

### ACP Prompt
```
# Task T-02SETd-005 — Reference Tables UI (SET-050..054)

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §8.1`, `## §8.6` — 25 tables list + UI surfaces

## Twoje zadanie
Generic Reference Tables admin UI driven by reference_schemas metadata.

## Implementacja
1. Utwórz `apps/web/app/(settings)/settings/reference/page.tsx` — list all 25 table codes with row count (SET-050: ReferenceTablesIndex)
2. Utwórz `apps/web/app/(settings)/settings/reference/[tableCode]/page.tsx` — server component, fetch rows + reference_schemas for this tableCode
3. Utwórz `apps/web/components/settings/ReferenceTableDetail.tsx` (SET-051):
   - Data grid: columns derived from reference_schemas.columns array (metadata-driven)
   - "Add Row" → ReferenceRowEditModal
   - "Edit" per row → ReferenceRowEditModal with pre-filled data
   - "Deactivate" → calls softDeleteReferenceRow
   - "Export CSV" → calls exportReferenceCSV, triggers download
   - "Import CSV" → opens CSVImportWizard
4. Utwórz `apps/web/components/settings/ReferenceRowEditModal.tsx` (SET-052):
   - Dialog with dynamic RHF form built from reference_schemas.columns
   - Field types: text→Input, number→Input type=number, enum→Select, boolean→Checkbox
   - Zod schema compiled client-side from reference_schemas (same logic as Zod endpoint §6.5)
   - On submit: calls upsertReferenceRow with expectedVersion for optimistic lock
5. Utwórz `apps/web/components/settings/CSVImportWizard.tsx` (SET-053):
   - Step 1: file upload (`<input type="file" accept=".csv">`)
   - Step 2: call importReferenceCSV → preview summary (X inserted, Y updated, Z skipped, W errors)
   - Step 3: confirm commit (re-call with commit=true flag) or cancel
6. Utwórz `apps/web/components/settings/ReferenceAuditTrail.tsx` (SET-054):
   - audit_log filter for table_name='reference_tables' AND record_id LIKE `${tableCode}:%`
   - Shows old_data/new_data diff per entry

Imports: `Dialog, DialogContent, Form, FormField, FormLabel, FormControl, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Checkbox, Button, Badge, Skeleton, Alert, AlertDescription`

## Prototype reference
Plik: none
Translation checklist:
- [ ] Generic form from reference_schemas metadata (not hardcoded per table)
- [ ] Optimistic lock via expectedVersion
- [ ] CSV upload + 3-step import wizard
- [ ] Wire all 5 SET screens

## Files
**Create:** `apps/web/app/(settings)/settings/reference/page.tsx`, `apps/web/app/(settings)/settings/reference/[tableCode]/page.tsx`, `apps/web/components/settings/ReferenceTableDetail.tsx`, `apps/web/components/settings/ReferenceRowEditModal.tsx`, `apps/web/components/settings/CSVImportWizard.tsx`, `apps/web/components/settings/ReferenceAuditTrail.tsx`

## Done when
- `vitest apps/web/components/settings/ReferenceTableDetail.test.tsx` PASS — renders schema-driven columns, edit modal opens
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/app/(settings)/settings/reference/ apps/web/components/settings/ReferenceTableDetail.tsx`
```

### Test gate
- **Unit:** `vitest apps/web/components/settings/ReferenceTableDetail.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/components/settings/ReferenceTableDetail.tsx`

---

## T-02SETd-006 — T4: integration test — rule deploy + reference CRUD

**Type:** T4-wiring+test
**Context budget:** ~60k tokens
**Est time:** 70 min
**Parent feature:** 02-SETTINGS §7, §8
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETd-003, T-02SETd-004, T-02SETd-005]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETd-007]

### GIVEN / WHEN / THEN
**GIVEN** rule registry + reference_tables actions exist with real DB
**WHEN** integration tests run against local Supabase
**THEN** deployRule versioning correct, reference CRUD with optimistic lock, CSV import conflict detection, RLS isolation per tenant

### ACP Prompt
```
# Task T-02SETd-006 — integration test: rule deploy + reference CRUD

## Context
- `apps/web/lib/settings/rule-registry.actions.ts`
- `apps/web/lib/settings/reference-tables.actions.ts`

## Twoje zadanie
Integration tests against real Supabase local DB.

## Implementacja
1. Utwórz `apps/web/lib/settings/rule-registry.integration.test.ts`:
   - Test 1: deployRule v1 → rule_definitions row exists version=1, active_from set
   - Test 2: deployRule v2 same ruleCode → version=2 exists, v1 row has active_to set
   - Test 3: getRuleList filters by ruleType correctly
   - Test 4: RLS — org B cannot read org A's rule_definitions
   
2. Utwórz `apps/web/lib/settings/reference-tables.integration.test.ts`:
   - Test 1: upsertReferenceRow → row exists, version=1
   - Test 2: upsertReferenceRow with expectedVersion=1 → version becomes 2
   - Test 3: upsertReferenceRow with stale expectedVersion=0 → rejected (409)
   - Test 4: softDeleteReferenceRow → is_active=false, getReferenceRows excludes it
   - Test 5: importReferenceCSV with 3 new + 1 existing + 1 invalid → summary {inserted:3, updated:1, errors:1}
   - Test 6: RLS — org B cannot read org A's reference_tables

## Files
**Create:** `apps/web/lib/settings/rule-registry.integration.test.ts`, `apps/web/lib/settings/reference-tables.integration.test.ts`

## Done when
- `vitest apps/web/lib/settings/rule-registry.integration.test.ts` PASS — 4 scenarios
- `vitest apps/web/lib/settings/reference-tables.integration.test.ts` PASS — 6 scenarios
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/rule-registry.integration.test.ts apps/web/lib/settings/reference-tables.integration.test.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/*.integration.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/rule-registry.integration.test.ts`

---

## T-02SETd-007 — T4: E2E — Reference Table CRUD full flow

**Type:** T4-wiring+test
**Context budget:** ~55k tokens
**Est time:** 60 min
**Parent feature:** 02-SETTINGS §8
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETd-005, T-02SETd-006]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** Reference Tables UI exists
**WHEN** E2E test runs full CRUD cycle + CSV import
**THEN** admin can create, edit, deactivate a row; CSV import shows preview summary and commits

### ACP Prompt
```
# Task T-02SETd-007 — E2E: Reference Tables full CRUD

## Context
- `apps/web/app/(settings)/settings/reference/` → reference tables routes

## Twoje zadanie
Playwright E2E covering Reference Tables full CRUD and CSV import flow.

## Implementacja
1. Utwórz `e2e/settings/reference-tables.spec.ts`:
   - Navigate to /settings/reference → Reference Tables Index shows (≥1 table code)
   - Click pack_sizes → ReferenceTableDetail shows
   - "Add Row" → ReferenceRowEditModal opens → fill pack_size=99x99cm, display_order=99 → submit
   - Assert new row visible in grid
   - "Edit" on new row → change display_order=100 → submit
   - "Deactivate" → row disappears from active list
   - "Import CSV" → upload test fixture CSV (3 rows) → preview shows 3 inserted → confirm → grid shows 3 new rows

## Files
**Create:** `e2e/settings/reference-tables.spec.ts`, `e2e/fixtures/pack-sizes-import.csv` (3 test rows)

## Done when
- `playwright e2e/settings/reference-tables.spec.ts` PASS — full CRUD + import flow
- `pnpm test:smoke` green

## Rollback
`git rm e2e/settings/reference-tables.spec.ts e2e/fixtures/pack-sizes-import.csv`
```

### Test gate
- **E2E:** `playwright e2e/settings/reference-tables.spec.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm e2e/settings/reference-tables.spec.ts`

---

## T-02SETd-008 — T5: seed — 25 Reference tables Apex baseline data

**Type:** T5-seed
**Context budget:** ~30k tokens
**Est time:** 40 min
**Parent feature:** 02-SETTINGS §8.1
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETd-001]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** [T-02SETd-006]

### GIVEN / WHEN / THEN
**GIVEN** reference_tables generic storage exists
**WHEN** seed script runs for Apex baseline org
**THEN** 25 Reference tables seeded with Apex-specific rows per §8.1 spec (pack_sizes×5, processes×8, templates×4, dept_columns×58 subset, close_confirm×2, allergens EU-14, d365_constants×5 Apex baseline)

### ACP Prompt
```
# Task T-02SETd-008 — seed: 25 Reference tables Apex baseline

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §8.1` — 25 tables with Apex row counts
- `apps/web/drizzle/schema/settings-rules-reference.ts` → referenceTables schema

## Twoje zadanie
Seed Drizzle typed factory for Apex baseline Reference table data.

## Implementacja
1. Utwórz `apps/web/seed/reference-tables-seed.ts`:
```ts
export async function seedReferenceTables(db: typeof drizzleDb, orgId: string) {
  // pack_sizes (5 rows)
  await db.insert(referenceTables).values([
    { orgId, tableCode: 'pack_sizes', rowKey: '20x30cm', rowData: { pack_size: '20x30cm', display_order: 1, is_active: 'true' } },
    { orgId, tableCode: 'pack_sizes', rowKey: '25x35cm', rowData: { pack_size: '25x35cm', display_order: 2, is_active: 'true' } },
    { orgId, tableCode: 'pack_sizes', rowKey: '18x24cm', rowData: { pack_size: '18x24cm', display_order: 3, is_active: 'true' } },
    { orgId, tableCode: 'pack_sizes', rowKey: '30x40cm', rowData: { pack_size: '30x40cm', display_order: 4, is_active: 'true' } },
    { orgId, tableCode: 'pack_sizes', rowKey: '15x20cm', rowData: { pack_size: '15x20cm', display_order: 5, is_active: 'true' } },
  ]).onConflictDoNothing()

  // processes (8 Apex processes)
  const processes = [
    { code: 'A', name: 'Strip' }, { code: 'B', name: 'Coat' }, { code: 'C', name: 'Honey' },
    { code: 'E', name: 'Smoke' }, { code: 'F', name: 'Slice' }, { code: 'G', name: 'Tumble' },
    { code: 'H', name: 'Dice' }, { code: 'R', name: 'Roast' }
  ]
  await db.insert(referenceTables).values(processes.map((p, i) => ({
    orgId, tableCode: 'processes', rowKey: p.code,
    rowData: { code: p.code, name: p.name, display_order: i+1, is_active: 'true' }
  }))).onConflictDoNothing()

  // close_confirm (2 rows)
  await db.insert(referenceTables).values([
    { orgId, tableCode: 'close_confirm', rowKey: 'yes', rowData: { label: 'Confirm close', is_active: 'true' } },
    { orgId, tableCode: 'close_confirm', rowKey: 'no', rowData: { label: 'Cancel', is_active: 'true' } },
  ]).onConflictDoNothing()

  // d365_constants (5 Apex baseline)
  const d365 = [
    { key: 'PRODUCTIONSITEID', value: 'FNOR' },
    { key: 'APPROVERPERSONNELNUMBER', value: 'FOR100048' },
    { key: 'CONSUMPTIONWAREHOUSEID', value: 'ApexDG' },
    { key: 'PRODUCTGROUPID', value: 'FinGoods' },
    { key: 'COSTINGOPERATIONRESOURCEID', value: 'FProd01' },
  ]
  await db.insert(referenceTables).values(d365.map(c => ({
    orgId, tableCode: 'd365_constants', rowKey: c.key,
    rowData: { key: c.key, value: c.value, is_p1_active: true, is_p2_stub: false }
  }))).onConflictDoNothing()
  
  // templates (4 rows), allergens EU-14, alert_thresholds (2 rows), etc.
  // See PRD §8.1 for remaining table seeding
}

export const createReferenceRow = (overrides?: Partial<typeof referenceTables.$inferInsert>) =>
  db.insert(referenceTables).values({ orgId: TEST_ORG_ID, tableCode: 'pack_sizes', rowKey: uuidv4(), rowData: {}, ...overrides })
```

## Files
**Create:** `apps/web/seed/reference-tables-seed.ts`

## Done when
- `vitest apps/web/seed/reference-tables-seed.test.ts` PASS — all table codes seeded, row counts correct
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/seed/reference-tables-seed.ts`
```

### Test gate
- **Unit:** `vitest apps/web/seed/reference-tables-seed.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/seed/reference-tables-seed.ts`

---

## §4 — 02SETe: Infrastructure + D365 + Email + Onboarding + Security (§12, §11, §13, §14)

## T-02SETe-001 — T1: infrastructure schema (warehouses/locations/machines/lines)

**Type:** T1-schema
**Context budget:** ~35k tokens
**Est time:** 45 min
**Parent feature:** 02-SETTINGS §5.6, §12
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000, T-02SETa-001]
- **Downstream (will consume this):** [T-02SETe-003, T-02SETe-004]
- **Parallel (can run concurrently):** [T-02SETe-002, T-02SETb-001, T-02SETc-001, T-02SETd-001]

### GIVEN / WHEN / THEN
**GIVEN** Foundation baseline exists
**WHEN** infrastructure Drizzle schema migrated
**THEN** warehouses, locations (ltree path), machines, production_lines, line_machines tables exist with RLS and proper constraints

### ACP Prompt
```
# Task T-02SETe-001 — infrastructure schema

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §5.6` — exact SQL schemas

## Twoje zadanie
Drizzle schema for infrastructure: warehouses, locations (with ltree path), machines, production_lines, line_machines.

## Implementacja
1. Utwórz `apps/web/drizzle/schema/settings-infrastructure.ts`:
```ts
export const warehouses = pgTable('warehouses', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  warehouseType: text('warehouse_type').notNull(),  // 'raw'|'wip'|'finished'|'quarantine'|'general'
  isDefault: boolean('is_default').default(false),
  address: jsonb('address'),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (t) => ({ uniq: unique().on(t.orgId, t.code) }))

export const locations = pgTable('locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  warehouseId: uuid('warehouse_id').notNull().references(() => warehouses.id),
  parentId: uuid('parent_id'),   // self-ref, added via FK in migration SQL
  code: text('code').notNull(),
  name: text('name').notNull(),
  locationType: text('location_type').notNull(),  // 'zone'|'aisle'|'rack'|'bin'
  level: integer('level').notNull(),
  path: text('path').notNull(),   // materialized ltree path (e.g. 'WH01.ZA.R3.B12')
  maxCapacity: numeric('max_capacity'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (t) => ({ uniq: unique().on(t.orgId, t.code) }))

export const machines = pgTable('machines', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  machineType: text('machine_type').notNull(),
  status: text('status').notNull().default('active'),  // 'active'|'maintenance'|'offline'
  capacityPerHour: numeric('capacity_per_hour'),
  specs: jsonb('specs').default('{}'),
  locationId: uuid('location_id').references(() => locations.id),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (t) => ({ uniq: unique().on(t.orgId, t.code) }))

export const productionLines = pgTable('production_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('active'),
  defaultLocationId: uuid('default_location_id').references(() => locations.id),
  deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  schemaVersion: integer('schema_version').notNull().default(1),
}, (t) => ({ uniq: unique().on(t.orgId, t.code) }))

export const lineMachines = pgTable('line_machines', {
  lineId: uuid('line_id').notNull().references(() => productionLines.id),
  machineId: uuid('machine_id').notNull().references(() => machines.id),
  sequence: integer('sequence').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.lineId, t.machineId] }) }))
```
2. `pnpm drizzle-kit generate` → migration SQL
3. Add self-ref FK for locations.parent_id, add RLS to warehouses/locations/machines/production_lines
4. `pnpm drizzle-kit migrate`

## Files
**Create:** `apps/web/drizzle/schema/settings-infrastructure.ts`
**Modify:** `apps/web/drizzle/schema/index.ts`

## Done when
- `vitest apps/web/drizzle/schema/settings-infrastructure.test.ts` PASS — tables + constraints + RLS
- `pnpm test:smoke` green

## Rollback
`pnpm drizzle-kit drop --name settings-infrastructure`
```

### Test gate
- **Integration:** `vitest apps/web/drizzle/schema/settings-infrastructure.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm drizzle-kit drop --name settings-infrastructure`

---

## T-02SETe-002 — T1: security + notification schema (org_security_policies, login_attempts, password_history, notification_preferences)

**Type:** T1-schema
**Context budget:** ~30k tokens
**Est time:** 35 min
**Parent feature:** 02-SETTINGS §5.7, §13.3
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-00b-000, T-02SETa-001]
- **Downstream (will consume this):** [T-02SETe-005, T-02SETe-006]
- **Parallel (can run concurrently):** [T-02SETe-001]

### GIVEN / WHEN / THEN
**GIVEN** Foundation baseline and users table exist
**WHEN** security + notification schema migrated
**THEN** `org_security_policies`, `login_attempts`, `password_history`, `notification_preferences` tables exist with proper constraints

### ACP Prompt
```
# Task T-02SETe-002 — security + notification schema

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §5.7`, `## §13.3` — exact SQL schemas

## Twoje zadanie
Drizzle schema for security policies and notification preferences tables.

## Implementacja
1. Utwórz `apps/web/drizzle/schema/settings-security.ts`:
```ts
export const orgSecurityPolicies = pgTable('org_security_policies', {
  orgId: uuid('org_id').primaryKey().references(() => organizations.id),
  passwordMinLength: integer('password_min_length').default(12),
  passwordHistoryCount: integer('password_history_count').default(5),
  sessionTimeoutMinutes: integer('session_timeout_minutes').default(480),
  lockoutThreshold: integer('lockout_threshold').default(5),
  mfaRequirement: text('mfa_requirement').notNull().default('optional'),  // 'disabled'|'optional'|'required_admins'|'required_all'
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const loginAttempts = pgTable('login_attempts', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  email: text('email'),
  ipAddress: inet('ip_address'),
  success: boolean('success').notNull(),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const passwordHistory = pgTable('password_history', {
  userId: uuid('user_id').notNull().references(() => users.id),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.createdAt] }) }))

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id').notNull().references(() => users.id),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  category: text('category').notNull(),  // 'npd'|'production'|'schema'|'integration'
  event: text('event').notNull(),
  channelEmail: boolean('channel_email').default(true),
  channelInApp: boolean('channel_in_app').default(true),
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.orgId, t.category, t.event] }) }))
```
2. `pnpm drizzle-kit generate` + migrate
3. Add RLS to org_security_policies: `org_id = fn_current_org()`

## Files
**Create:** `apps/web/drizzle/schema/settings-security.ts`
**Modify:** `apps/web/drizzle/schema/index.ts`

## Done when
- `vitest apps/web/drizzle/schema/settings-security.test.ts` PASS — tables exist, mfaRequirement constraint
- `pnpm test:smoke` green

## Rollback
`pnpm drizzle-kit drop --name settings-security`
```

### Test gate
- **Integration:** `vitest apps/web/drizzle/schema/settings-security.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`pnpm drizzle-kit drop --name settings-security`

---

## T-02SETe-003 — T2: Warehouse + Location CRUD actions

**Type:** T2-api
**Context budget:** ~45k tokens
**Est time:** 65 min
**Parent feature:** 02-SETTINGS §12
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETe-001, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETe-007]
- **Parallel (can run concurrently):** [T-02SETe-004, T-02SETe-005]

### GIVEN / WHEN / THEN
**GIVEN** warehouses + locations tables with RLS exist
**WHEN** admin creates/updates/deactivates warehouses and locations
**THEN** CRUD actions work with audit, location.path computed as ltree string, deactivation blocked if active WOs reference (soft warning), V-SET-60..V-SET-63 enforced

### ACP Prompt
```
# Task T-02SETe-003 — Warehouse + Location CRUD actions

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §12.2`, `## §12.3` — CRUD UI + V-SET-60..63 validations

## Twoje zadanie
Server Actions for warehouse and location management with path computation and validation.

## Implementacja
1. Utwórz `apps/web/lib/settings/infrastructure.actions.ts` (`'use server'`):
   - `createWarehouse(input: WarehouseInput): Promise<string>` — RBAC `Permission.SETTINGS_INFRA_EDIT`, upsert, insertAuditLog
   - `updateWarehouse(id, input)` + `deactivateWarehouse(id)` (soft delete, check active WOs via future FK — log warning if referenced)
   - `createLocation(input: LocationInput): Promise<string>` — RBAC `Permission.SETTINGS_INFRA_EDIT`; compute path: if no parentId → path=code, else read parent.path + '.' + code; validate level=parentLevel+1 (V-SET-60); validate warehouseId matches parent.warehouseId
   - `updateLocation(id, input)` + `deactivateLocation(id)`
   - `getWarehouseTree(orgId): Promise<WarehouseWithLocations[]>` — warehouses + nested locations for tree UI

2. Validation:
   - V-SET-60: location.level = parent.level + 1, same warehouse_id
   - V-SET-62: production line must have ≥1 machine (checked on line activation, not here)

## Files
**Create:** `apps/web/lib/settings/infrastructure.actions.ts`

## Done when
- `vitest apps/web/lib/settings/infrastructure.actions.test.ts` PASS — path computed correctly, V-SET-60 rejects wrong level, audit entries exist
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/infrastructure.actions.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/infrastructure.actions.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/infrastructure.actions.ts`

---

## T-02SETe-004 — T2: Machine + ProductionLine CRUD + D365 + Onboarding actions

**Type:** T2-api
**Context budget:** ~50k tokens
**Est time:** 70 min
**Parent feature:** 02-SETTINGS §11, §12, §14.3
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETe-001, T-02SETe-002, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETe-007, T-02SETe-008, T-02SETe-009]
- **Parallel (can run concurrently):** [T-02SETe-003, T-02SETe-005]

### GIVEN / WHEN / THEN
**GIVEN** machines/production_lines/reference_tables tables exist
**WHEN** admin manages machines, production lines, D365 config, or onboarding state
**THEN** CRUD actions with audit, D365 toggle validates 5 constants populated (V-SET-50), onboarding state updated in organizations.onboarding_state JSONB

### ACP Prompt
```
# Task T-02SETe-004 — Machine + ProductionLine + D365 + Onboarding actions

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §11.1`, `## §11.4`, `## §12`, `## §14.3`

## Twoje zadanie
Server Actions for machines, production lines, D365 config, and onboarding wizard state.

## Implementacja
1. Dodaj do `apps/web/lib/settings/infrastructure.actions.ts`:
   - `createMachine(input: MachineInput): Promise<string>` — RBAC `Permission.SETTINGS_INFRA_EDIT`, upsert machines, insertAuditLog
   - `createProductionLine(input: LineInput): Promise<string>` — upsert production_lines
   - `assignMachineToLine(lineId, machineId, sequence)` — insert line_machines; check ≥1 machine before line activation (V-SET-62)

2. Utwórz `apps/web/lib/settings/d365.actions.ts` (`'use server'`):
   - `getD365Constants(orgId): Promise<D365Constant[]>` — getReferenceRows(orgId, 'd365_constants') RBAC `Permission.SETTINGS_D365_VIEW`
   - `updateD365Constant(orgId, key, value)` — RBAC `Permission.SETTINGS_D365_EDIT`, calls upsertReferenceRow
   - `toggleD365Integration(orgId, enabled: boolean)` — RBAC `Permission.SETTINGS_D365_TOGGLE`; if enabled=true: validate all 5 constants present (FNOR, FOR100048, ApexDG, FinGoods, FProd01 all non-empty) (V-SET-50); update feature_flags_core (flag_code='integration.d365.enabled'); insertAuditLog

3. Utwórz `apps/web/lib/settings/onboarding.actions.ts` (`'use server'`):
   - `updateOnboardingState(orgId, step: number, completed: boolean)` — RBAC `Permission.SETTINGS_ONBOARDING_COMPLETE`; update organizations.onboarding_state JSONB: push step to completed_steps, update current_step, set last_activity_at=now()
   - `completeOnboarding(orgId)` — set onboarding_completed_at=now(); insertAuditLog

## Files
**Modify:** `apps/web/lib/settings/infrastructure.actions.ts` (machine + line additions)
**Create:** `apps/web/lib/settings/d365.actions.ts`, `apps/web/lib/settings/onboarding.actions.ts`

## Done when
- `vitest apps/web/lib/settings/d365.actions.test.ts` PASS — toggle blocked without 5 constants, audit logged
- `vitest apps/web/lib/settings/onboarding.actions.test.ts` PASS — step state updated correctly, complete sets timestamp
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/d365.actions.ts apps/web/lib/settings/onboarding.actions.ts`
```

### Test gate
- **Unit:** `vitest apps/web/lib/settings/d365.actions.test.ts`
- **Integration:** `vitest apps/web/lib/settings/onboarding.actions.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/d365.actions.ts`

---

## T-02SETe-005 — T2: security policies + MFA enrollment actions

**Type:** T2-api
**Context budget:** ~40k tokens
**Est time:** 55 min
**Parent feature:** 02-SETTINGS §14.1
**Agent:** backend-specialist
**Status:** pending

### ACP Submit
**labels:** ["backend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETe-002, T-02SETb-E01]
- **Downstream (will consume this):** [T-02SETe-010]
- **Parallel (can run concurrently):** [T-02SETe-003, T-02SETe-004]

### GIVEN / WHEN / THEN
**GIVEN** `org_security_policies`, `password_history`, `login_attempts` tables exist
**WHEN** admin updates security policy or user enrolls MFA
**THEN** policy saved with audit, password validated against history (V-SET-81), lockout enforced after 5 failures (V-SET-83)

### ACP Prompt
```
# Task T-02SETe-005 — security policies + MFA actions

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §14.1`, `## §14.5` — policies + V-SET-80..V-SET-84

## Twoje zadanie
Server Actions for security policy management and MFA enrollment.

## Implementacja
1. Utwórz `apps/web/lib/settings/security.actions.ts` (`'use server'`):
   - `updateSecurityPolicy(orgId, input: SecurityPolicyInput): Promise<void>` — RBAC `Permission.SETTINGS_SECURITY_UPDATE`; validate: passwordMinLength ∈ [8,128], sessionTimeout ∈ [15,1440]; upsert org_security_policies; insertAuditLog
   - `getSecurityPolicy(orgId): Promise<OrgSecurityPolicy>` — RBAC `Permission.SETTINGS_SECURITY_VIEW`
   - `recordLoginAttempt(userId, email, ipAddress, success, failureReason?)` — insert login_attempts; if !success: count failures in last 15min, if ≥ lockoutThreshold: insertOutboxEvent(EventType.USER_LOCKED_OUT)
   - `validatePasswordHistory(userId, newPasswordHash): Promise<boolean>` — check password_hash not in last N entries of password_history; if clean: insert new row to password_history
   - `enrollMFATotp(userId): Promise<{ secret, qrCodeUrl }>` — call Supabase Auth MFA enroll API via supabaseAdmin.auth.mfa.enroll({ factorType: 'totp' })

2. Zod: `SecurityPolicyInputSchema = z.object({ passwordMinLength: z.number().int().min(8).max(128), passwordHistoryCount: z.number().int().min(0).max(24), sessionTimeoutMinutes: z.number().int().min(15).max(1440), lockoutThreshold: z.number().int().min(3).max(10), mfaRequirement: z.enum(['disabled','optional','required_admins','required_all']) })`

## Files
**Create:** `apps/web/lib/settings/security.actions.ts`

## Done when
- `vitest apps/web/lib/settings/security.actions.test.ts` PASS — policy update validated, password history check rejects reuse, lockout event emitted after 5 failures
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/security.actions.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/security.actions.test.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/lib/settings/security.actions.ts`

---

## T-02SETe-006 — T3: Infrastructure CRUD UI (SET-012..SET-019)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~65k tokens
**Est time:** 100 min
**Parent feature:** 02-SETTINGS §12.2
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETe-003, T-02SETe-004]
- **Downstream (will consume this):** [T-02SETe-011]
- **Parallel (can run concurrently):** [T-02SETe-007, T-02SETe-008]

### GIVEN / WHEN / THEN
**GIVEN** infrastructure CRUD actions exist
**WHEN** admin visits /settings/infrastructure
**THEN** warehouse list + location tree + machine list + line list all operational with CRUD forms

### ACP Prompt
```
# Task T-02SETe-006 — Infrastructure CRUD UI (SET-012..019)

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §12.2` — SET-012..019 screen list

## Twoje zadanie
Infrastructure management UI: Warehouse, Location, Machine, Production Line CRUD.

## Implementacja
1. Utwórz `apps/web/app/(settings)/settings/infrastructure/page.tsx` — tabs: Warehouses | Machines | Lines
2. Utwórz `apps/web/components/settings/WarehouseList.tsx` (SET-012):
   - Table with code, name, type Badge, active indicator
   - "Add Warehouse" → WarehouseEditForm dialog (RHF, type=Select: raw/wip/finished/quarantine/general)
   - "Deactivate" → confirm + call deactivateWarehouse
3. Utwórz `apps/web/components/settings/LocationTree.tsx` (SET-014, SET-015):
   - Nested Collapsible tree showing locations hierarchy (zone→aisle→rack→bin)
   - "Add Child" → LocationEditForm dialog (parentId pre-filled, level computed)
   - Path shown as breadcrumb
4. Utwórz `apps/web/components/settings/MachineList.tsx` (SET-016, SET-017):
   - Table with status Badge (active=green, maintenance=yellow, offline=red)
   - MachineEditForm: type, location picker (Select showing bin-level locations)
5. Utwórz `apps/web/components/settings/LineList.tsx` (SET-018, SET-019):
   - Line cards with machine sequence badges
   - LineEditForm: machine assignment (MultiSelect or drag sequence list)
   - Validation: ≥1 machine before "Activate" button enabled (V-SET-62)

Imports: `Badge, Button, Dialog, DialogContent, Form, FormField, FormLabel, FormControl, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Collapsible, CollapsibleContent, CollapsibleTrigger, Skeleton`

## Prototype reference
Plik: none
Translation checklist:
- [ ] Nested Collapsible for location tree
- [ ] Status Badge color coding
- [ ] Wire infrastructure.actions
- [ ] V-SET-62 disable Activate if no machines

## Files
**Create:** `apps/web/app/(settings)/settings/infrastructure/page.tsx`, `apps/web/components/settings/WarehouseList.tsx`, `apps/web/components/settings/LocationTree.tsx`, `apps/web/components/settings/MachineList.tsx`, `apps/web/components/settings/LineList.tsx`

## Done when
- `vitest apps/web/components/settings/WarehouseList.test.tsx` PASS — renders warehouses, type badge, deactivate calls action
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/app/(settings)/settings/infrastructure/ apps/web/components/settings/WarehouseList.tsx`
```

### Test gate
- **Unit:** `vitest apps/web/components/settings/WarehouseList.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/components/settings/WarehouseList.tsx`

---

## T-02SETe-007 — T3: OnboardingWizard 6-step (SET-001..007)

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~65k tokens
**Est time:** 100 min
**Parent feature:** 02-SETTINGS §14.3
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETe-004]
- **Downstream (will consume this):** [T-02SETe-011]
- **Parallel (can run concurrently):** [T-02SETe-006, T-02SETe-008]

### GIVEN / WHEN / THEN
**GIVEN** onboarding state actions exist
**WHEN** new org admin visits /onboarding for first time (onboarding_completed_at=null)
**THEN** 6-step wizard shown, resume from current_step, each step completion calls updateOnboardingState, step 6 shows confetti + next-steps cards

### ACP Prompt
```
# Task T-02SETe-007 — OnboardingWizard 6-step

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §14.3` — 6-step spec, onboarding_state JSONB format

## Twoje zadanie
6-step onboarding wizard with resume capability. Target: <15min P50.

## Implementacja
1. Utwórz `apps/web/app/(onboarding)/onboarding/page.tsx`:
   - Server component: read organizations.onboarding_state, redirect to /dashboard if onboarding_completed_at set
   - Pass current_step to OnboardingWizard client component

2. Utwórz `apps/web/components/settings/OnboardingWizard.tsx`:
   - State: `const [step, setStep] = useState(initialStep)` where initialStep from onboarding_state.current_step
   - Step 1 (SET-002): Org Profile — RHF form: name (required), timezone (Select default Europe/Warsaw), locale (Select: pl/en), currency (Select default PLN), logo upload (optional)
   - Step 2 (SET-003): First Warehouse — name, type (Select), code (auto-generated from name slug)
   - Step 3 (SET-004): First Location — zone name, parent=warehouse from step 2
   - Step 4 (SET-005): First Product — "Skip for now" button + soft redirect link to /products/new
   - Step 5 (SET-006): First Work Order — "Skip for now" + soft redirect link to /planning/new
   - Step 6 (SET-007): Completion — confetti (use `canvas-confetti` npm), card grid with links to: Module Toggles, Schema Browser, Rules Registry
   - On each step "Next": call updateOnboardingState(orgId, step, true), setStep(step+1)
   - On step 6: call completeOnboarding(orgId)
   - Progress bar: `<Progress value={(step/6)*100} className="h-1.5" />`

Imports: `Progress, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Card, CardContent, CardHeader, CardTitle, Form, FormField, FormLabel, FormControl, FormMessage, Skeleton`

## Prototype reference
Plik: none
Translation checklist:
- [ ] 6-step stepper via useState(initialStep)
- [ ] Resume from onboarding_state.current_step
- [ ] canvas-confetti on step 6
- [ ] Wire updateOnboardingState + completeOnboarding

## Files
**Create:** `apps/web/app/(onboarding)/onboarding/page.tsx`, `apps/web/components/settings/OnboardingWizard.tsx`

## Done when
- `vitest apps/web/components/settings/OnboardingWizard.test.tsx` PASS — renders step 1 by default, resumes from step 3, completeOnboarding called on step 6
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/app/(onboarding)/onboarding/ apps/web/components/settings/OnboardingWizard.tsx`
```

### Test gate
- **Unit:** `vitest apps/web/components/settings/OnboardingWizard.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm apps/web/components/settings/OnboardingWizard.tsx`

---

## T-02SETe-008 — T3: D365 Admin UI + Security + EmailConfig UI

**Type:** T3-ui
**Prototype ref:** none — no prototype exists for this component
**Context budget:** ~65k tokens
**Est time:** 90 min
**Parent feature:** 02-SETTINGS §11.3, §13.4, §14.4
**Agent:** frontend-specialist
**Status:** pending

### ACP Submit
**labels:** ["frontend-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETe-004, T-02SETe-005]
- **Downstream (will consume this):** [T-02SETe-011]
- **Parallel (can run concurrently):** [T-02SETe-006, T-02SETe-007]

### GIVEN / WHEN / THEN
**GIVEN** D365, security, and email actions exist
**WHEN** admin visits /settings/integrations (D365), /settings/security, /settings/notifications
**THEN** D365 constants editable, integration toggle validates 5 constants (V-SET-50), security policies form functional, notification preferences matrix shown

### ACP Prompt
```
# Task T-02SETe-008 — D365 Admin + Security + EmailConfig UI

## Context
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/02-SETTINGS-PRD.md` → sekcja `## §11.3`, `## §13.4`, `## §14.1`, `## §14.4`

## Twoje zadanie
D365 integration admin UI (SET-080..083), Security policies UI (SET-100, SET-101), EmailConfig editor (SET-090..093).

## Implementacja
1. Utwórz `apps/web/app/(settings)/settings/integrations/d365/page.tsx`:
   - D365 Connection Config (SET-080): base URL, service account inputs + "Test Connection" button
   - D365 Constants Editor (SET-081): table of 5 constants (FNOR, FOR100048, ApexDG, FinGoods, FProd01), each editable inline Input; "Save Constants" calls updateD365Constant per row
   - Integration toggle (SET-082 area): Switch (`integration.d365.enabled`) — disabled if any constant empty; calls toggleD365Integration; shows warning "All 5 constants must be set" if incomplete
   - Sync Audit (SET-083): read-only list of last N audit_log entries for action='d365.sync'

2. Utwórz `apps/web/app/(settings)/settings/security/page.tsx`:
   - Security Policy form (RHF): passwordMinLength, passwordHistoryCount, sessionTimeout, lockoutThreshold, mfaRequirement (RadioGroup: disabled/optional/required_admins/required_all)
   - "Save" calls updateSecurityPolicy
   - User Preferences section (SET-101): language Switch (PL/EN), MFA enroll button calls enrollMFATotp

3. Utwórz `apps/web/app/(settings)/settings/notifications/page.tsx`:
   - EmailConfig editor (SET-090): Reference CRUD wrapper dla 'email_config' table — uses ReferenceTableDetail component
   - Notification Prefs matrix (SET-092): categories × events toggle matrix per user; calls upsertReferenceRow for preferences

Imports: `Switch, RadioGroup, RadioGroupItem, Badge, Button, Input, Select, SelectContent, SelectItem, Form, FormField, FormLabel, FormControl, FormMessage, Alert, AlertDescription, Skeleton`

## Prototype reference
Plik: none
Translation checklist:
- [ ] Switch for integration.d365.enabled with V-SET-50 guard
- [ ] RadioGroup for mfaRequirement
- [ ] Wire D365 + security + notification actions
- [ ] EmailConfig reuses ReferenceTableDetail component

## Files
**Create:** `apps/web/app/(settings)/settings/integrations/d365/page.tsx`, `apps/web/app/(settings)/settings/security/page.tsx`, `apps/web/app/(settings)/settings/notifications/page.tsx`

## Done when
- `vitest apps/web/app/(settings)/settings/integrations/d365/page.test.tsx` PASS — toggle disabled without constants, validates 5 present before enable
- `pnpm test:smoke` green

## Rollback
`git rm -r apps/web/app/(settings)/settings/integrations/ apps/web/app/(settings)/settings/security/`
```

### Test gate
- **Unit:** `vitest apps/web/app/(settings)/settings/integrations/d365/page.test.tsx`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm -r apps/web/app/(settings)/settings/integrations/`

---

## T-02SETe-009 — T4: integration + E2E — infrastructure + onboarding lifecycle

**Type:** T4-wiring+test
**Context budget:** ~65k tokens
**Est time:** 75 min
**Parent feature:** 02-SETTINGS §12, §14.3
**Agent:** test-specialist
**Status:** pending

### ACP Submit
**labels:** ["test-specialist", "monopilot-kira"]
**priority:** 100
**max_attempts:** 3

### Dependencies
- **Upstream (must be done first):** [T-02SETe-007, T-02SETe-008]
- **Downstream (will consume this):** []
- **Parallel (can run concurrently):** []

### GIVEN / WHEN / THEN
**GIVEN** all infrastructure + onboarding + D365 + security actions exist
**WHEN** integration tests run against local Supabase + E2E runs full onboarding wizard
**THEN** location path computed correctly, V-SET-60..63 enforced, onboarding state tracked, E2E completes in <5 simulated clicks

### ACP Prompt
```
# Task T-02SETe-009 — integration + E2E: infrastructure + onboarding

## Context
- `apps/web/lib/settings/infrastructure.actions.ts`
- `apps/web/lib/settings/onboarding.actions.ts`
- `apps/web/lib/settings/d365.actions.ts`

## Twoje zadanie
Integration tests + Playwright E2E for infrastructure and onboarding.

## Implementacja
1. Utwórz `apps/web/lib/settings/infrastructure.integration.test.ts`:
   - Test 1: createWarehouse + createLocation (zone) + createLocation (bin, child of zone) → path='WH01.ZA.B1', level=2
   - Test 2: V-SET-60 — createLocation with wrong parent warehouse → rejected
   - Test 3: createMachine + assignMachineToLine → line has 1 machine
   - Test 4: V-SET-62 — activateLine without machines → rejected (if activation action implemented)
   - Test 5: RLS — org B cannot see org A's warehouses

2. Utwórz `apps/web/lib/settings/d365.integration.test.ts`:
   - Test 1: toggleD365Integration(true) without constants → rejected (V-SET-50)
   - Test 2: seed 5 constants → toggleD365Integration(true) succeeds
   - Test 3: audit_log has entry for toggle action

3. Utwórz `e2e/settings/onboarding.spec.ts`:
   - Login as new org admin (onboarding_completed_at=null)
   - Assert redirected to /onboarding
   - Complete step 1 (org profile), step 2 (warehouse), step 3 (location), skip steps 4+5
   - Assert confetti on step 6, completeOnboarding called
   - Navigate to /dashboard — assert no redirect to onboarding

## Files
**Create:** `apps/web/lib/settings/infrastructure.integration.test.ts`, `apps/web/lib/settings/d365.integration.test.ts`, `e2e/settings/onboarding.spec.ts`

## Done when
- `vitest apps/web/lib/settings/infrastructure.integration.test.ts` PASS — 5 scenarios
- `vitest apps/web/lib/settings/d365.integration.test.ts` PASS — 3 scenarios
- `playwright e2e/settings/onboarding.spec.ts` PASS — wizard completes
- `pnpm test:smoke` green

## Rollback
`git rm apps/web/lib/settings/infrastructure.integration.test.ts apps/web/lib/settings/d365.integration.test.ts e2e/settings/onboarding.spec.ts`
```

### Test gate
- **Integration:** `vitest apps/web/lib/settings/*.integration.test.ts`
- **E2E:** `playwright e2e/settings/onboarding.spec.ts`
- **CI gate:** `pnpm test:smoke` green

### Rollback
`git rm e2e/settings/onboarding.spec.ts`

---

## Dependency Table

| ID | Upstream | Parallel |
|---|---|---|
| T-02SETb-E01 | [T-02SETa-E01] | [] |
| T-02SETb-001 | [T-00b-000, T-02SETa-001] | [T-02SETc-001, T-02SETd-001, T-02SETe-001] |
| T-02SETb-002 | [T-02SETb-001, T-02SETb-E01] | [T-02SETb-003] |
| T-02SETb-003 | [T-02SETb-001, T-02SETb-E01] | [T-02SETb-002] |
| T-02SETb-004 | [T-02SETb-002] | [T-02SETb-005] |
| T-02SETb-005 | [T-02SETb-003, T-02SETb-004] | [] |
| T-02SETb-006 | [T-02SETb-003, T-02SETb-005] | [] |
| T-02SETc-001 | [T-00b-000, T-02SETa-001] | [T-02SETb-001, T-02SETd-001, T-02SETe-001] |
| T-02SETc-002 | [T-02SETc-001, T-02SETb-E01] | [T-02SETc-003] |
| T-02SETc-003 | [T-02SETc-001, T-02SETb-E01] | [T-02SETc-002] |
| T-02SETc-004 | [T-02SETc-002] | [T-02SETc-005] |
| T-02SETc-005 | [T-02SETc-002, T-02SETc-003, T-02SETc-004] | [] |
| T-02SETc-006 | [T-02SETc-005] | [] |
| T-02SETd-001 | [T-00b-000, T-02SETa-001] | [T-02SETb-001, T-02SETc-001, T-02SETe-001] |
| T-02SETd-002 | [T-02SETd-001, T-02SETb-E01] | [T-02SETd-003] |
| T-02SETd-003 | [T-02SETd-001, T-02SETb-E01] | [T-02SETd-002] |
| T-02SETd-004 | [T-02SETd-002] | [T-02SETd-005] |
| T-02SETd-005 | [T-02SETd-003] | [T-02SETd-004] |
| T-02SETd-006 | [T-02SETd-003, T-02SETd-004, T-02SETd-005] | [T-02SETd-007] |
| T-02SETd-007 | [T-02SETd-005, T-02SETd-006] | [] |
| T-02SETd-008 | [T-02SETd-001] | [T-02SETd-006] |
| T-02SETe-001 | [T-00b-000, T-02SETa-001] | [T-02SETb-001, T-02SETc-001, T-02SETd-001, T-02SETe-002] |
| T-02SETe-002 | [T-00b-000, T-02SETa-001] | [T-02SETe-001] |
| T-02SETe-003 | [T-02SETe-001, T-02SETb-E01] | [T-02SETe-004, T-02SETe-005] |
| T-02SETe-004 | [T-02SETe-001, T-02SETe-002, T-02SETb-E01] | [T-02SETe-003, T-02SETe-005] |
| T-02SETe-005 | [T-02SETe-002, T-02SETb-E01] | [T-02SETe-003, T-02SETe-004] |
| T-02SETe-006 | [T-02SETe-003, T-02SETe-004] | [T-02SETe-007, T-02SETe-008] |
| T-02SETe-007 | [T-02SETe-004] | [T-02SETe-006, T-02SETe-008] |
| T-02SETe-008 | [T-02SETe-004, T-02SETe-005] | [T-02SETe-006, T-02SETe-007] |
| T-02SETe-009 | [T-02SETe-007, T-02SETe-008] | [] |

---

## Parallel Dispatch Plan

### Wave 0 — Enum lock (blocks all b-e tasks)
T-02SETb-E01

### Wave 1 — Schema migrations in parallel (4 sub-modules, after T-02SETa done)
T-02SETb-001, T-02SETc-001, T-02SETd-001, T-02SETe-001, T-02SETe-002

### Wave 2 — API actions in parallel (after enum lock + schemas)
T-02SETb-002, T-02SETb-003 (parallel with each other)
T-02SETc-002, T-02SETc-003 (parallel)
T-02SETd-002, T-02SETd-003 (parallel)
T-02SETe-003, T-02SETe-004, T-02SETe-005 (parallel)
T-02SETd-008 (seed, can run after T-02SETd-001)

### Wave 3 — UI components (after their respective API actions)
T-02SETb-004, T-02SETb-005 (sequential: 005 after 004)
T-02SETc-004, T-02SETc-005 (sequential: 005 after 004)
T-02SETd-004, T-02SETd-005 (parallel with each other)
T-02SETe-006, T-02SETe-007, T-02SETe-008 (parallel)

### Wave 4 — Integration + E2E tests (after UI complete)
T-02SETb-006, T-02SETc-006, T-02SETd-006, T-02SETd-007, T-02SETe-009 (parallel)

---

## PRD Coverage

| PRD Section | Covered by | Status |
|---|---|---|
| §5.2 reference_schemas + schema_migrations | T-02SETc-001 | ✅ |
| §5.3 rule_definitions + rule_dry_runs | T-02SETd-001 | ✅ |
| §5.4 tenant_variations + tenant_migrations | T-02SETb-001 | ✅ |
| §5.5 reference_tables generic storage | T-02SETd-001 | ✅ |
| §5.6 Warehouses/Locations/Machines/Lines | T-02SETe-001 | ✅ |
| §5.7 Security + session tables | T-02SETe-002 | ✅ |
| §6.1-§6.4 Schema wizard CRUD + draft/publish | T-02SETc-002 | ✅ |
| §6.3 L1 Promotion flow | T-02SETc-003 | ✅ |
| §6.5 Zod runtime gen endpoint | T-02SETc-003 | ✅ |
| §6.6 SET-030..034 UI | T-02SETc-004, T-02SETc-005 | ✅ |
| §7.2 Rule registry read-only admin | T-02SETd-002, T-02SETd-004 | ✅ |
| §7.3 Dev deploy workflow (deployRule) | T-02SETd-002 | ✅ |
| §7.6 SET-040..042 UI | T-02SETd-004 | ✅ |
| §8.3-§8.5 Reference CRUD + CSV | T-02SETd-003 | ✅ |
| §8.6 SET-050..054 UI | T-02SETd-005 | ✅ |
| §9.1-§9.2 Tenant variations + dept taxonomy | T-02SETb-002, T-02SETb-004 | ✅ |
| §9.3 Rule variant selector | T-02SETb-002, T-02SETb-005 | ✅ |
| §9.4 Upgrade orchestration | T-02SETb-003, T-02SETb-005 | ✅ |
| §9.7 SET-060..064 UI | T-02SETb-004, T-02SETb-005 | ✅ |
| §11.1-§11.4 D365 constants + toggle | T-02SETe-004, T-02SETe-008 | ✅ |
| §12.2 Infrastructure CRUD (SET-012..019) | T-02SETe-006 | ✅ |
| §13 EmailConfig + notification prefs | T-02SETe-008 | ✅ |
| §14.1 Security policies + MFA | T-02SETe-005, T-02SETe-008 | ✅ |
| §14.2 i18n (already in SETa) | — | ✅ (SETa) |
| §14.3 Onboarding wizard | T-02SETe-007, T-02SETe-009 | ✅ |
| §9.5 Data residency enforcement | — | ❌ DEFERRED Phase 3 |
| §9.6 Superadmin cross-tenant analytics | — | ❌ DEFERRED (requires warehouse schema) |
| §11.7 D365 P2 extensions | — | ❌ DEFERRED P2 |
| §13.3 Email delivery log (SET-093) | — | ⚠️ PARTIAL — stub in T-02SETe-008 |
| Rule authoring UI (§7.5 hard-lock) | — | ❌ DEFERRED Q2 per ADR-029 |
| Custom roles per org (§3) | — | ❌ DEFERRED Phase 3 |
| MFA biometric / WebAuthn (§14.1) | — | ❌ DEFERRED Phase 3 |

---

## Task Count Summary

| Type | 02SETb | 02SETc | 02SETd | 02SETe | Total |
|---|---|---|---|---|---|
| T1-schema | 1 | 1 | 1 | 2 | **5** |
| T2-api | 2 | 2 | 2 | 3 | **9** |
| T3-ui | 2 | 2 | 2 | 3 | **9** |
| T4-wiring+test | 1 | 1 | 2 | 1 | **5** |
| T5-seed | 0 | 0 | 1 | 0 | **1** |
| enum-lock | 1 | 0 | 0 | 0 | **1** |
| **Sub-total** | **7** | **6** | **8** | **9** | **30** |

> Note: T-02SETb-E01 counted as enum-lock (covers all b-e permissions in one file).

**Total tasks Settings b-e: 30**
**Prerequisite: 30 tasks from SETa → Grand total Settings: 60 tasks**
**Estimated raw time: ~30 × avg 65 min = ~1,950 min (~32.5 hours)**
**Parallelization (4 waves, 5 parallel agents): ~8-10 hours wall-clock**
