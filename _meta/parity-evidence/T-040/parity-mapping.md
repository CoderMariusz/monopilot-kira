# T-040 — Allergen Cascade widget + Override modal — Parity evidence

## Prototype anchors (verified: `wc -l`)

- `prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-118` (file = 147 lines) — `allergen_cascade`
- `prototypes/design/Monopilot Design System/npd/modals.jsx:389-428` (file = 766 lines) — `allergen_override_modal`

## Production components

| Prototype region | Production component |
|---|---|
| `AllergenCascade` (allergen-screens.jsx:5-118) | `apps/web/app/(npd)/fa/[productCode]/_components/allergen-cascade-widget.tsx` |
| `AllergenOverrideModal` (modals.jsx:389-428) | `apps/web/app/(npd)/_modals/allergen-override-modal.tsx` |
| Server prefetch + slot | `apps/web/app/(npd)/fa/[productCode]/allergens/page.tsx` |

## Structural parity — widget (allergen-screens.jsx:5-118)

| Prototype JSX | Production | Notes |
|---|---|---|
| 3-column cascade grid (① RM, ② Process, ③ FA Final) | 3 `@monopilot/ui` `Card` sections | The production `fa_allergen_cascade` VIEW aggregates RM∪process into one `derived_allergens` array, so prototype columns ① + ② collapse into one **Derived (RM + process)** card; column ② becomes the **Override deltas** card (additive deltas made explicit — MON-domain-npd: overrides are additive over the derived union); column ③ = **FA final** Contains + May-contain (1:1). See deviation D1. |
| `r.allergens.map(... badge fee2e2/991b1b)` | `Badge variant="danger"` per derived code | red-family "contains" badge |
| `p.may?.map(... badge-amber "may: X")` | `Badge variant="warning"` "May contain: X" in FA-final | amber may-contain |
| `a.manual && border 2px amber + "· Manual"` | `data-manual="true"` + `border-amber-400` + "· Manual" text | published ∖ derived ⇒ manual; a11y text not border-only |
| `select FA` / `Open FA →` | n/a (rendered per-FA route `[productCode]`) | FA selection is the route param; no in-widget `<select>` (red-line: no raw select) |
| `↻ Refresh` button | `Button` "↻ Refresh", debounced (600ms) → `refreshAllergenCascade` | risk red-line: debounced, not hammering server |
| `alert alert-blue` derivation note | `derivationNote` blue note region | |
| SVG cascade diagram + 30s poll (BL-NPD-05) | **deferred** (out_of_scope: no SVG animation) | deviation D2 |
| (new) source tooltip | `title` attr on every badge (`sourceRm`/`sourceProcess`/`sourceOverride`) | risk red-line: tooltip with allergen source present |
| (new) EU14 presence grid | 14-cell grid, `data-present` + ●/○ icon + Present/Absent text | a11y: color never sole signal |

## Structural parity — modal (modals.jsx:389-428)

| Prototype JSX | Production | Notes |
|---|---|---|
| `window.Modal size="default"` title/subtitle/foot | `@monopilot/ui` `Modal` (Radix dialog) + `Modal.Header/Body/Footer` | |
| `alert alert-amber` audit warning | amber `role="note"` alert (`auditWarning` key) | |
| `Field "Allergen"` readonly | read-only `<input readOnly>` (`override-allergen`) preselected | |
| `Field "Current auto-cascade"` readonly | read-only `<input readOnly>` (`override-current`) | |
| `["include","exclude"]` toggle buttons | two-button single-select → DB enum `add`/`remove` (no raw `<select>`) | |
| `ReasonInput minLength=10` (max 500) | `@monopilot/ui` `ReasonInput` (counter + sibling-submit aria-disabled) | mirrors server `z.string().trim().min(10)` |
| `disabled={!valid}` Save | `aria-disabled` Save; action NOT invoked while reason < 10 | AC3 |
| `Save override` → write | injected `setAllergenOverride` (T-039) via `submitAllergenOverride` adapter | |

## Interaction / state parity (all 5 states + optimistic)

Captured DOM snapshots in this directory:
- `T-040-loading.html` (role=status)
- `T-040-empty.html`
- `T-040-error.html` (role=alert)
- `T-040-permission-denied.html` (role=alert; RBAC server-gated — Refresh/Override omitted)
- `T-040-ready.html` (3 sections + EU14 grid + tooltips)
- `T-040-optimistic-refreshing.html` (Refresh button → "Refreshing…" pending state)
- `T-040-override-modal.html`

## a11y baseline

- Color never sole signal: EU14 cells = icon (●/○) + text (Present/Absent); manual badge = text "· Manual" (not border-only).
- `role="status"` (loading), `role="alert"` (error / forbidden), `role="note"` (audit warning).
- Widget region `aria-labelledby`; every badge has `title` + `aria-label` carrying its source.
- Modal = Radix dialog (focus trap, ESC/click-outside) via `@monopilot/ui` Modal.
- **axe blocker:** `@axe-core/playwright` + a Playwright config + browsers are NOT installed in this worktree. Programmatic structural a11y assertions are the documented fallback (see `allergen-cascade-widget.evidence.test.tsx`).

## Playwright blocker

No `apps/web/playwright.config.*`, no `@axe-core/*`, no `~/Library/Caches/ms-playwright` browsers in this worktree. Per T-040 AC4 + `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`, RTL + per-state DOM-snapshot evidence (this directory) is the recorded fallback.
