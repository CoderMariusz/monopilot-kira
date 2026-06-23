# WAVE E9 — Freight UI parity evidence + deviation log

Screens: `/planning/carriers` and `/planning/suppliers/[id]/scorecard`.

## Prototype source declaration

`prototype_match: false` (spec-driven, per UI-PROTOTYPE-PARITY-POLICY §1.2).

No JSX prototype exists for carriers / freight / supplier-scorecard. Verified by
sweeping `prototypes/design/Monopilot Design System/planning/` and `.../planning-ext/`
— zero matches for carrier / freight / scorecard (same result as the
`/planning/reorder-thresholds` and `/planning/mrp` screens, which are likewise
spec-driven). Nearest reusable prototype pattern: `plan_reorder_thresholds`
(list + add/edit Modal) and the `plan_dashboard` KPI-tile grid. Presentation
therefore follows the locked MON-design-system conventions (PageHeader +
card/table/badge/empty-state + `@monopilot/ui` Modal/Button/Input/Select),
identical density/spacing/component family to the sibling planning screens.

## Required UI states — evidence artifacts (per-state DOM snapshots)

| State | Artifact |
|---|---|
| Carriers — loading | `carriers-01-loading.html` |
| Carriers — table (populated) | `carriers-02-table.html` |
| Carriers — add/edit dialog (optimistic submit) | `carriers-03-dialog.html` |
| Carriers — per-carrier transport-lanes panel | `carriers-04-lanes-panel.html` |
| Carriers — empty | `carriers-05-empty.html` |
| Carriers — permission-denied | `carriers-06-denied.html` |
| Carriers — error | `carriers-07-error.html` |
| Scorecard — KPI tiles + recent-POs table | `scorecard-01-kpis-and-recent.html` |
| Scorecard — empty | `scorecard-02-empty.html` |

Generator: `_evidence-harness.tsx.txt` (archived here, kept out of the asserted
test glob). Re-run by copying it back to `carriers/__tests__/_evidence.test.tsx`
and running `pnpm --filter web exec vitest run --config vitest.ui.config.ts _evidence`.

## Test evidence

- RTL: `pnpm --filter web exec vitest run --config vitest.ui.config.ts carriers scorecard`
  → 2 files, 13 tests passed (9 carriers + 4 scorecard).
- Regression: suppliers suite 18 tests still pass (the new `scorecardHref`/`scorecard`
  props are optional).
- `pnpm --filter web typecheck` → clean (tsc --noEmit, 0 errors).

## a11y baseline

- Every dialog field has a visible `<label>` wrapping its `@monopilot/ui` Input/Select.
- Modals use the `@monopilot/ui` Modal (Radix Dialog) → focus trap + Esc/click-outside
  close by default.
- `role="note"` (denied) / `role="alert"` (error + form errors) for assistive tech.
- Tables use `<th>` header cells; status uses badge text (`Active`/`Late`) + colour,
  never colour alone.

Playwright trace + axe report: not captured in this run — a full live Playwright
pass needs the Supabase/Vercel stack the task scoped out (`Do NOT run build`,
typecheck + tests only). Documented blocker; the structural-parity DOM snapshots
above stand in for the per-state screenshots for this UI-only, no-prototype lane.

## Deviations from the spec/pattern

1. **Permission-denied via a thrown `forbidden` seam, not a `{ok:false}` result.**
   The agreed contract returns `listCarriers()` as a bare `CarrierRow[]` (no result
   envelope). To still surface the mandatory permission-denied state, the client
   `load()` maps a rejected list promise whose `Error.message === 'forbidden'` to the
   denied panel. Write gating (`npd.planning.write`) is enforced server-side inside
   `upsertCarrier` / `upsertTransportLane` and surfaced as inline dialog errors.

2. **`freight-actions.ts` is a UI-lane stub at the agreed path.** The freight backend
   lane owns `planning/_actions/freight-actions.ts` and builds it concurrently. This
   file implements the EXACT exported signatures over the mig-316 tables so the screens
   typecheck + render against real data today; it is defensively guarded (SQLSTATE
   42P01 → empty/safe result) so a pre-migration environment shows the honest
   empty/error state instead of a 500. The backend lane replaces this file in place;
   the UI imports are unchanged. Marked `TODO(E9-backend)` at the top of the file.

3. **Scorecard `on_time` / `qty_variance_pct` computed in SQL** (received-date vs
   expected-delivery; received-qty vs ordered-qty over `purchase_order_lines`). NCR
   counts are best-effort against `public.ncrs` and degrade to zero if that table is
   absent. No mock data.
