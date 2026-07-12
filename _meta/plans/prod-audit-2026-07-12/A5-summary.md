# Wave A5 — Implementation summary (prod-audit 2026-07-12)

Worktree: `/Users/mariuszkrawczyk/Projects/monopilot-worktrees/A5` · branch `fix/A5` · **uncommitted** (per instruction).

## Gates (evidence)

| Gate | Result |
|------|--------|
| `pnpm --filter web exec tsc --noEmit` | **PASS** (clean) |
| `pnpm --filter web run build` | **PASS** (after fixing broken import in `allergen-cascade.tsx`) |
| Touched vitest (default config) | **PASS 43 / FAIL 0** |
| Touched vitest (UI config) | **PASS 14 / FAIL 0** (`allergen-cascade-widget.test.tsx`) |
| `packages/db` migration 486 test | **PASS 1 / FAIL 0** |

Test command bundle (web):

```bash
pnpm exec vitest run lib/npd/__tests__/allergen-empty-cascade-s20.test.ts \
  lib/quality/__tests__/resolve-inspection-parameters.test.ts \
  lib/production/__tests__/consumption-progress.test.ts \
  app/(npd)/pipeline/_actions/__tests__/advance-checklist-gate.test.ts \
  "app/[locale]/(app)/(modules)/quality/_actions/__tests__/inspection-actions.test.ts"

pnpm exec vitest run --config vitest.ui.config.ts \
  "app/(npd)/fa/[productCode]/_components/__tests__/allergen-cascade-widget.test.tsx"
```

---

## S15 (P1) — Inspection for new material has zero parameters; Pass/Fail/Hold blocked

### Prod repro

1. Create/receive a new material with no inspection snapshot on `quality_inspections.parameters` (`[]`).
2. Open the inspection detail screen.
3. Parameter table is empty; decision buttons are unusable.

### Root cause

`fetchInspectionDetail` returned only the persisted JSON snapshot. New incoming inspections are created with `parameters = []` and never hydrated from the product's active incoming quality specification.

### Fix (shared choke point)

- **New** `apps/web/lib/quality/resolve-inspection-parameters.ts` — resolves parameters from active `quality_specifications` + `quality_spec_parameters` when stored snapshot is empty.
- **Updated** `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts` — calls resolver in `fetchInspectionDetail`; exposes `parameterResolution` on `InspectionDetail`.
- **UI** `inspection-detail.client.tsx` — `missing_template` gate with link to `/quality/specifications`; disables Pass/Fail/Hold until parameters exist.
- Contracts/labels: `inspection-contracts.ts`, `labels.ts`.

### Diff locations

- `apps/web/lib/quality/resolve-inspection-parameters.ts` (new)
- `apps/web/lib/quality/__tests__/resolve-inspection-parameters.test.ts` (new)
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts`
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/__tests__/inspection-actions.test.ts`
- `apps/web/app/[locale]/(app)/(modules)/quality/inspections/[inspectionId]/_components/inspection-detail.client.tsx`
- `apps/web/app/[locale]/(app)/(modules)/quality/inspections/_components/inspection-contracts.ts`
- `apps/web/app/[locale]/(app)/(modules)/quality/inspections/_components/labels.ts`

### Test

- `resolve-inspection-parameters.test.ts` — stored vs resolved vs missing_template paths.
- `inspection-actions.test.ts` — S15 block: empty stored params + active spec → resolved parameters on detail.

### NEW raw SQL (PREPARE-check)

```sql
select qs.id::text as spec_id,
       qsp.parameter_name,
       qsp.target_value::text,
       qsp.min_value::text,
       qsp.max_value::text,
       qsp.unit
  from public.quality_specifications qs
  join public.quality_spec_parameters qsp
    on qsp.specification_id = qs.id
   and qsp.org_id = qs.org_id
 where qs.org_id = app.current_org_id()
   and qs.product_id = $1::uuid
   and qs.status = 'active'
   and qs.applies_to in ('incoming', 'all')
   and (qs.effective_from is null or qs.effective_from <= current_date)
   and (qs.effective_until is null or qs.effective_until >= current_date)
 order by qsp.sort_order asc, qsp.parameter_name asc
```

---

## S16 (P1) — Missing downtime & waste categories block pause + waste

### Prod repro

1. Fresh org (or org with zero rows in `downtime_categories` / `waste_categories`).
2. Attempt WO pause (downtime reason required) or waste registration.
3. Flow hard-fails — no selectable category (FK NOT NULL from migration 183).

### Root cause

Category taxonomy was never seeded per org. Pause/waste UI requires at least one active category row.

### Fix

**LOUD: additive migration 486** (next free after 485) — idempotent cross-join seed for every org:

- 9 `downtime_categories` (4P/lean kinds: planned / unplanned / changeover)
- 6 `waste_categories` (mirrors migration 274 pattern)

Files:

- `packages/db/migrations/486-production-downtime-waste-category-seed.sql`
- `packages/db/src/migrations/486-production-downtime-waste-category-seed.sql` (mirror)
- `packages/db/__tests__/486-downtime-waste-category-seed.test.ts`

### Diff locations

- Migration 486 (both paths above)
- Test asserts `ON CONFLICT DO NOTHING` idempotency + expected code sets

### Test

`486-downtime-waste-category-seed.test.ts` — verifies seed statements and uniqueness constraints.

### NEW raw SQL (PREPARE-check) — full migration 486

```sql
insert into public.downtime_categories (org_id, code, name, kind, is_active)
select o.id, c.code, c.name, c.kind, true
  from public.organizations o
 cross join (
   values
     ('PEOPLE_BREAK', 'Operator break', 'planned'),
     ('PEOPLE_MISSING', 'Operator missing', 'unplanned'),
     ('PEOPLE_TRAINING', 'Operator training', 'planned'),
     ('PROCESS_MATERIAL_WAIT', 'Material wait', 'unplanned'),
     ('PROCESS_UPSTREAM', 'Upstream delay', 'unplanned'),
     ('PROCESS_QUALITY_HOLD', 'Quality hold', 'unplanned'),
     ('PLANT_BREAKDOWN', 'Equipment breakdown', 'unplanned'),
     ('PLANT_CHANGEOVER', 'Changeover', 'changeover'),
     ('PLANT_CLEANING', 'Cleaning / sanitation', 'planned')
 ) as c(code, name, kind)
on conflict on constraint downtime_categories_org_code_unique do nothing;

insert into public.waste_categories (org_id, code, name, is_active)
select o.id, c.code, c.name, true
  from public.organizations o
 cross join (
   values
     ('TRIM', 'Trim / offcut'),
     ('SPILL', 'Spill'),
     ('QUALITY', 'Quality reject'),
     ('EXPIRED', 'Expired'),
     ('CONTAMINATION', 'Contamination'),
     ('OTHER', 'Other')
 ) as c(code, name)
on conflict on constraint waste_categories_org_code_unique do nothing;
```

---

## S7 (P2) — Consumption indicator sums kg + pcs

### Prod repro

1. WO with BOM lines in mixed UoMs (e.g. flour in kg, labels in pcs).
2. WO detail consumption bar shows a single % derived from adding unlike units.

### Root cause

`consumptionPct` was computed as `sum(consumed) / sum(planned)` across all lines regardless of `uom`, producing nonsense when units differ.

### Fix (shared choke point)

- **New** `apps/web/lib/production/consumption-progress.ts` — `summarizeConsumptionProgress()` aggregates per-UoM; never sums unlike UoMs; returns `consumptionPct: number | null`, `consumptionMixedUnits`, `consumptionByUom`.
- **Updated** `get-wo-runtime-state.ts`, `get-work-order-detail.ts` — use summarizer.
- **UI** `wo-detail-screen.tsx`, `page.tsx` — when `consumptionMixedUnits`, render per-UoM progress bars instead of one scalar bar.

### Diff locations

- `apps/web/lib/production/consumption-progress.ts` (new)
- `apps/web/lib/production/__tests__/consumption-progress.test.ts` (new)
- `apps/web/lib/production/get-wo-runtime-state.ts`
- `apps/web/app/[locale]/(app)/(modules)/production/_actions/get-work-order-detail.ts`
- `apps/web/app/[locale]/(app)/(modules)/production/wos/[id]/_components/wo-detail-screen.tsx`
- `apps/web/app/[locale]/(app)/(modules)/production/wos/[id]/page.tsx`

### Test

`consumption-progress.test.ts` — mixed UoM → `consumptionPct === null`, `consumptionMixedUnits === true`, per-UoM map correct; single-UoM unchanged.

### NEW raw SQL

None (pure TypeScript aggregation over existing action query results).

---

## S18 (P1) — NPD gate advanced with 0/3 required checklist items

### Prod repro

1. NPD project at gate G1→G2 with 3 required checklist items, 0 completed.
2. Advance gate without override.
3. Gate advanced anyway (0/3 silently passed).

### Root cause

`evaluateStageGate` enforced documents, allergens, BOM, etc., but treated `gate_checklist_items` as advisory-only (`gate-helpers.ts` comment). Required incomplete items were not in `softMissing`.

### Fix (shared choke point)

- **Updated** `advance-project-gate.ts` — `incompleteRequiredChecklistItems()` added to soft-missing list inside `evaluateStageGate` (override path unchanged).
- **Updated** `gate-helpers.ts` — comment reflects checklist is now enforced.

### Diff locations

- `apps/web/app/(npd)/pipeline/_actions/advance-project-gate.ts`
- `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts`
- `apps/web/app/(npd)/pipeline/_actions/__tests__/advance-checklist-gate.test.ts` (new)
- `apps/web/app/(npd)/pipeline/_actions/__tests__/gate-actions.integration.test.ts`

### Test

- `advance-checklist-gate.test.ts` — 0/N required incomplete → `SOFT_GATE_BLOCKED` with checklist labels in `missing`.
- `gate-actions.integration.test.ts` — G0 advance with incomplete checklist now expects block (not pass).

### NEW raw SQL (PREPARE-check)

```sql
select gci.item_text
  from public.gate_checklist_items gci
 where gci.org_id = app.current_org_id()
   and gci.project_id = $1::uuid
   and gci.gate_code = $2::text
   and gci.required = true
   and gci.completed_at is null
 order by gci.item_text asc
```

---

## S20 (P2) — Allergen remediation link has no accept mechanism

### Prod repro

1. NPD criterion links to allergen remediation page for a product with no cascade row yet.
2. Page renders empty/error widget (`data: null`) — declaration accept checkbox never shown.
3. Criterion C5 cannot be cleared.

### Root cause

`loadAllergenCascade` returned `data: null` when `readAllergenCascade` yielded `NOT_FOUND` (empty allergen arrays), causing `AllergenCascadeWidget` to early-return before the declaration section. Declaration accept permission was also tied only to `canWrite` (override RBAC), not the broader accept permission OR-list.

### Fix

- **New** `apps/web/lib/npd/build-allergen-cascade-data.ts` — pure helper building widget data even when cascade read is null.
- **Updated** `fg/[productCode]/_lib/allergen-cascade.tsx` — `readProductExists`, `readCanAcceptDeclaration` (permission OR-list); keeps `data` when product exists; separate `canAcceptDeclaration` from `canWrite`.
- **Updated** `allergen-cascade-widget.tsx` — `canAcceptDeclaration` prop; final/declaration section renders on ready state with empty cascade; non-ready states still use `StateNotice`; derived/delta panels hidden when no cascade content.
- **Updated** `allergens/page.tsx`, `fg/[productCode]/page.tsx` — pass `canAcceptDeclaration` in fallbacks.

### Diff locations

- `apps/web/lib/npd/build-allergen-cascade-data.ts` (new)
- `apps/web/lib/npd/__tests__/allergen-empty-cascade-s20.test.ts` (new)
- `apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_lib/allergen-cascade.tsx`
- `apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/allergens/page.tsx`
- `apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/page.tsx`
- `apps/web/app/(npd)/fa/[productCode]/_components/allergen-cascade-widget.tsx`
- `apps/web/app/(npd)/fa/[productCode]/_components/__tests__/allergen-cascade-widget.test.tsx`

### Test

- `allergen-empty-cascade-s20.test.ts` — `buildAllergenCascadeData` + loader contract for empty cascade.
- `allergen-cascade-widget.test.tsx` — S20 case: empty cascade + `canAcceptDeclaration` → checkbox visible.

### NEW raw SQL (PREPARE-check)

Product existence (new in S20 loader):

```sql
select product_code
  from public.product
 where product_code = $1
   and org_id = app.current_org_id()
   and deleted_at is null
 limit 1
```

Declaration state (pre-existing, now reachable on empty cascade):

```sql
select p.allergens_declaration_accepted as accepted,
       coalesce(u.display_name, u.name, p.allergens_declaration_accepted_by::text) as accepted_by,
       p.allergens_declaration_accepted_at::text as accepted_at
  from public.product p
  left join public.users u on u.id = p.allergens_declaration_accepted_by
 where p.product_code = $1
   and p.org_id = app.current_org_id()
   and p.deleted_at is null
 limit 1
```

---

## Discipline notes

- **`withOrgContext`**: inspection resolve and allergen reads are read-only; gate advance throws on hard failures — no partial-write regressions introduced.
- **`'use server'`**: new pure helpers live under `apps/web/lib/`; `allergen-cascade.tsx` import moved to top (fixed mid-file import that broke `next build`).
- **Mass rounding**: consumption changes are display-layer only; no kg integer rounding before persistence.
- **Migration 486**: additive, idempotent, safe to apply on live DBs with existing partial seeds (`ON CONFLICT DO NOTHING`).

## Git state

Modified + untracked files only; **no `git add` / no commit** per instruction. Run `git status` in worktree for full file list.
