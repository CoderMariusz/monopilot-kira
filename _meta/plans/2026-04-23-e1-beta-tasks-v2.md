# E-1 Settings-a Track S-β — Reference Data (v2)

Generated: 2026-04-23
Tasks: T-02SETa-011, 012, 013, 014, 015, 025
Track: S-β Reference Data

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
```
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

3. Dopisz do wygenerowanego SQL (na końcu pliku):
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
```

---

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
```
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

2. Wstaw `reference_schemas` (definicje kolumn) dla każdej tabeli:
   - `units_of_measure`: `code TEXT is_required=true`, `label TEXT is_required=true`, `symbol TEXT`
   - `currencies`: `code TEXT is_required=true` (ISO 4217), `name TEXT is_required=true`, `symbol TEXT`
   - `countries`: `code TEXT is_required=true` (ISO 3166-1 alpha-2), `name TEXT is_required=true`
   - `vat_rates`: `code TEXT is_required=true`, `rate_pct INTEGER is_required=true`, `label TEXT`
   - `document_types`: `code TEXT is_required=true`, `label TEXT is_required=true`, `requires_signature BOOLEAN`
   - `warehouse_zones`: `code TEXT is_required=true`, `label TEXT is_required=true`, `zone_type TEXT`
   - `production_shift_types`: `code TEXT is_required=true`, `label TEXT is_required=true`, `start_time TEXT`, `end_time TEXT`

3. Wstaw `reference_rows` Forza baseline data:
   - `units_of_measure` (5 wierszy): `{ code: 'kg', label: 'Kilogram', symbol: 'kg' }`, `{ code: 'g', label: 'Gram', symbol: 'g' }`, `{ code: 'L', label: 'Litre', symbol: 'L' }`, `{ code: 'mL', label: 'Millilitre', symbol: 'mL' }`, `{ code: 'pcs', label: 'Pieces', symbol: 'pcs' }`
   - `currencies` (4 wiersze): `{ code: 'PLN', name: 'Polish Zloty', symbol: 'zł' }`, `{ code: 'EUR', name: 'Euro', symbol: '€' }`, `{ code: 'USD', name: 'US Dollar', symbol: '$' }`, `{ code: 'GBP', name: 'British Pound', symbol: '£' }`
   - `countries` (5 wierszy): `{ code: 'PL', name: 'Poland' }`, `{ code: 'DE', name: 'Germany' }`, `{ code: 'GB', name: 'United Kingdom' }`, `{ code: 'FR', name: 'France' }`, `{ code: 'US', name: 'United States' }`
   - `vat_rates` (4 wiersze): `{ code: 'PL_0', rate_pct: 0, label: '0% (exempt)' }`, `{ code: 'PL_5', rate_pct: 5, label: '5%' }`, `{ code: 'PL_8', rate_pct: 8, label: '8%' }`, `{ code: 'PL_23', rate_pct: 23, label: '23% (standard)' }`
   - `document_types` (5 wierszy): `{ code: 'invoice', label: 'Invoice', requires_signature: false }`, `{ code: 'delivery_note', label: 'Delivery Note', requires_signature: true }`, `{ code: 'quality_cert', label: 'Quality Certificate', requires_signature: true }`, `{ code: 'purchase_order', label: 'Purchase Order', requires_signature: false }`, `{ code: 'return_note', label: 'Return Note', requires_signature: true }`
   - `warehouse_zones` (3 wiersze): `{ code: 'raw_material', label: 'Raw Material', zone_type: 'input' }`, `{ code: 'work_in_progress', label: 'Work in Progress', zone_type: 'production' }`, `{ code: 'finished_goods', label: 'Finished Goods', zone_type: 'output' }`
   - `production_shift_types` (3 wiersze): `{ code: 'morning', label: 'Morning Shift', start_time: '06:00', end_time: '14:00' }`, `{ code: 'afternoon', label: 'Afternoon Shift', start_time: '14:00', end_time: '22:00' }`, `{ code: 'night', label: 'Night Shift', start_time: '22:00', end_time: '06:00' }`

4. Dodaj snapshot name jako komentarz na początku pliku: `// Snapshot: settings-reference-forza-baseline`
   Zaktualizuj `row_count` w `reference_tables` po wstawieniu wierszy:
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
```

---
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
```
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
```

---

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
```
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

4. Utwórz page components:
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
```

---
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
```
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

4. Uruchom `pnpm drizzle-kit migrate` aby zastosować migrację 022.

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
```

---

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
```
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

3. Uruchom testy lokalnie i upewnij się że wszystkie przechodzą:
   ```bash
   pnpm playwright apps/web/e2e/settings/reference-tables.spec.ts
   pnpm vitest apps/web/app/actions/settings/__tests__/reference-actions.integration.test.ts
   pnpm test:smoke
   ```

4. Jeśli jakiś test failuje: sprawdź logi, zidentyfikuj problem (brakujący fixture, wrong selector, RLS policy gap) i napraw.

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
```

---
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
