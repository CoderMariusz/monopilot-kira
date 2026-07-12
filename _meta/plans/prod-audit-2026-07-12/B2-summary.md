# Wave B2 — Implementation Summary (2026-07-12)

Worktree: `fix/B2` @ `/Users/mariuszkrawczyk/Projects/monopilot-worktrees/B2`  
Spec: `_meta/plans/prod-audit-2026-07-12/B2-spec.md`  
Next free migration: **487** (unused — **no new migration SQL in this wave**)

## Repro summary (owner audit)

| ID | Severity | Symptom | Fix headline |
|----|----------|---------|--------------|
| B2a | P1 | WO complete modal showed green yield gate while backend rejected at 2.6% yield; no override/e-sign path | Pre-evaluate strict gate server-side; modal reacts to `closed_production_strict_failed` with override UI |
| B2b | P1 | Incoming inspection specs could not target RM items (picker FG/WIP only); INSP-* for ING-FLOUR had 0 parameters | ItemPicker + `createSpec` honor `applies_to`; incoming → rm/ingredient/packaging types |
| B2c | P2 | Quality inspection/hold lists stale after mutations until manual reload | `revalidateLocalized` on list + detail routes after create/record/decision/release |
| B2d | P2 | Allergen cascade Override buttons unresponsive | Permission alignment (`npd.allergen.write`), correct revalidate paths, `router.refresh()`, refresh gated on `refreshAction` not override |

---

## B2a — Yield-gate override path

### Root cause
1. `getWoActionContext` set `yieldGateGreen` from **primary output qty > 0 only**, ignoring `evaluateClosedProductionStrict` consumption/yield tolerance that `completeWo` enforces.
2. `CompleteModal` had no override reason / e-sign PIN / e-sign reason fields and did not react to handler `closed_production_strict_failed` by surfacing gate details + override affordance.

### Fix (choke points)
- `get-wo-action-context.ts`: `yieldGateGreen = primaryGreen && strictGate.within_tolerance`.
- `shared.tsx` (`CompleteModal`): gate status banner (`data-gate-green`), strict-gate detail panel on failure, override reason `Select` + PIN + e-sign reason; resubmit includes `overrideReasonCode`, `overrideSignerUserId`, `overridePin`, `overrideEsignReason`.
- `use-wo-action.ts` / `types.ts`: propagate `details` + `message` from 409 responses.
- `wo-actions.tsx`: pass `signerUserId` + `locale` into complete modal.
- `wo-modal-labels.ts` + `i18n/en.json`: new complete-modal strings.

### Diff locations
- `apps/web/app/[locale]/(app)/(modules)/production/_actions/get-wo-action-context.ts`
- `apps/web/app/[locale]/(app)/(modules)/production/wos/_components/modals/shared.tsx`
- `apps/web/app/[locale]/(app)/(modules)/production/wos/_components/modals/types.ts`
- `apps/web/app/[locale]/(app)/(modules)/production/wos/_components/modals/use-wo-action.ts`
- `apps/web/app/[locale]/(app)/(modules)/production/wos/_components/modals/wo-actions.tsx`
- `apps/web/app/[locale]/(app)/(modules)/production/_actions/wo-modal-labels.ts`
- `apps/web/i18n/en.json`

### Test
`apps/web/app/[locale]/(app)/(modules)/production/wos/_components/modals/__tests__/wo-actions.test.tsx` — describe `Complete modal — yield-gate override path (B2a)` (2 cases).

---

## B2b — Incoming spec RM product picker

### Root cause
1. `spec-create-modal.client.tsx` hardcoded `ItemPicker` to `['fg', 'intermediate']`.
2. `createSpec` INSERT always used `applies_to = 'all'` despite UI applies-to pills.

### Fix (choke points)
- `itemTypesForSpecAppliesTo()`: incoming → `rm|ingredient|packaging`; final → `fg|intermediate`; in_process → all searchable types.
- Modal sends `appliesTo` in create payload; clears incompatible product on applies-to change.
- `spec-actions.ts` + `spec-actions-contract.ts`: Zod + INSERT bind `applies_to` from input (default `all`).
- `spec-list.client.tsx`: broadened list search item types.

### Diff locations
- `apps/web/app/[locale]/(app)/(modules)/quality/specifications/_components/spec-create-modal.client.tsx`
- `apps/web/app/[locale]/(app)/(modules)/quality/specifications/_components/spec-actions-contract.ts`
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/spec-actions.ts`
- `apps/web/app/[locale]/(app)/(modules)/quality/specifications/_components/spec-list.client.tsx`

### Tests
- `specs.test.tsx` — describe `B2b — incoming spec product picker includes RM items`
- `lib/quality/__tests__/resolve-inspection-parameters.test.ts` — `B2b: resolves incoming spec parameters for an RM product id`

---

## B2c — Stale quality lists after mutations

### Root cause
- `inspection-actions.ts` only revalidated `/quality` (not inspections list/detail).
- `hold-actions.ts` had **no** `revalidateLocalized` after create/release.

### Fix (choke points)
- `revalidateInspectionRoutes(id?)` → `/quality`, `/quality/inspections`, `/quality/inspections/{id}` on create / record results / submit decision.
- `revalidateHoldRoutes(id?)` → `/quality`, `/quality/holds`, `/quality/holds/{id}` in `createHoldCore` + `releaseHoldCore`.

### Diff locations
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts`
- `apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts`

### Tests
- `inspection-actions.test.ts` — asserts revalidation on `createInspection`
- `hold-actions.test.ts` — asserts revalidation on hold create

*(Products list revalidation deferred to Wave B3 per spec.)*

---

## B2d — Allergen cascade Override buttons

### Root cause
1. **Permission mismatch**: page `canWrite` uses `npd.allergen.write`; `setAllergenOverride` only allowed `technical.write` / `quality.write` → server FORBIDDEN (click appeared dead).
2. **Wrong revalidate paths**: `/npd/fg/...` vs actual `/{locale}/fg/...` and `/allergen-cascade`.
3. **Widget**: no `router.refresh()` after successful override/refresh; refresh button incorrectly gated on `setAllergenOverrideAction` instead of `refreshAction`.

### Fix (choke points)
- `set-allergen-override.ts`: add `npd.allergen.write` to `WRITE_PERMISSIONS`.
- **NEW** `revalidate-allergen-cascade-routes.ts` — shared helper with canonical paths.
- `submit-allergen-override.ts`, `refresh-allergen-cascade.ts`: use shared revalidate helper.
- `allergen-cascade-widget.tsx`: `router.refresh()` after override/refresh; `handleOpenOverride` / `handleSubmitOverride`; refresh button when `canWrite && refreshAction`; override when `canWrite && setAllergenOverrideAction`.

### Diff locations
- `apps/web/app/(npd)/fa/actions/set-allergen-override.ts`
- `apps/web/app/(npd)/fa/[productCode]/allergens/_actions/revalidate-allergen-cascade-routes.ts` *(new)*
- `apps/web/app/(npd)/fa/[productCode]/allergens/_actions/submit-allergen-override.ts`
- `apps/web/app/(npd)/fa/[productCode]/allergens/_actions/refresh-allergen-cascade.ts`
- `apps/web/app/(npd)/fa/[productCode]/_components/allergen-cascade-widget.tsx`

### Test
`allergen-cascade-widget.test.tsx` — describe `AllergenCascadeWidget — override action (B2d)`

---

## New / changed raw SQL

**None.** All fixes are application-layer (Server Actions, UI, revalidation). Existing `quality_specifications.applies_to` column used; no migration 487 required.

---

## Verification gates

### `git diff --stat`
```
23 files changed, 550 insertions(+), 65 deletions(-)
(+ untracked revalidate-allergen-cascade-routes.ts)
```

### TypeScript
```
cd apps/web && pnpm exec tsc --noEmit
→ TypeScript: No errors found
```

### Vitest (touched)
```
pnpm exec vitest run --config vitest.ui.config.ts \
  "app/[locale]/(app)/(modules)/production/wos/_components/modals/__tests__/wo-actions.test.tsx" \
  "app/(npd)/fa/[productCode]/_components/__tests__/allergen-cascade-widget.test.tsx" \
  "app/[locale]/(app)/(modules)/quality/specifications/_components/__tests__/specs.test.tsx"
→ PASS (61) FAIL (0)

pnpm exec vitest run \
  lib/quality/__tests__/resolve-inspection-parameters.test.ts \
  "app/[locale]/(app)/(modules)/quality/_actions/__tests__/inspection-actions.test.ts" \
  "app/[locale]/(app)/(modules)/quality/_actions/__tests__/hold-actions.test.ts" \
  "app/[locale]/(app)/(modules)/quality/_actions/__tests__/spec-actions.test.ts"
→ PASS (57) FAIL (0)
```

### Full build (`'use server'` input shape changed on `createSpec`)
```
pnpm --filter web run build
→ exit 0 (Next.js production build succeeded)
```

---

## Notes
- Changes left **uncommitted** in working tree per campaign instructions.
- Only `en.json` updated for new complete-modal keys; `pl/ro/uk` fall back via next-intl until a follow-up i18n sweep.
