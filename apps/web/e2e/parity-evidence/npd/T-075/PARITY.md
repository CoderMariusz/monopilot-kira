# T-075 CostingScreen — parity evidence

Prototype anchor (verified): `prototypes/design/Monopilot Design System/npd/other-stages.jsx:83-163` (`CostingScreen`).
File length: 537 lines (`wc -l`) — anchor in range. Index entry: `prototype-index-npd.json#costing_screen` (lines "83-163").

Production components:
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/page.tsx` (RSC loader, real data via withOrgContext/RLS)
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_components/costing-screen.tsx` (client)
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_components/waterfall-bar.tsx` (client)
- `packages/ui/src/Slider.tsx` (new shadcn-equivalent Slider primitive)

## Structural mapping (prototype JSX region -> production)

| Prototype (other-stages.jsx) | Region | Production translation |
|---|---|---|
| 100-111 | Card head: title "Cost breakdown — <name>" + subtitle + unit pills (Per kg / Per pack / Per batch) | `<header>` h1 `{title} — {productName}` + subtitle; unit `Button` group (`aria-pressed`), i18n `unitPerKg/unitPerPack/unitPerBatch` |
| 113-124 | `.waterfall` 9 `.waterfall-bar` rows (cumulative fill + label + €value) | `<ol data-testid="costing-waterfall">` of `WaterfallBar` (`data-testid="waterfall-step"` x9), bold TOTAL = step 9 (Retail) |
| 127-141 | "Margin vs target price" table: 3 scenarios (Pessimistic/Target/Optimistic), Target row highlighted | `Table data-testid="scenario-table"`, 3 `scenario-row`s, Target row `bg-sky-50`; margin €/% color-coded |
| 138-140 | amber alert "7.5% below NPD minimum of 15%" | `margin-warn-note` (role=note), threshold from `Reference.AlertThresholds#costing_margin_warn_pct` |
| 143-159 | "What-if sliders" card: 3 `<input type=range>` + value labels | `what-if-card`: 3 `Slider` (role=slider) + Scenario name input + Save scenario CTA |

## V07 warn / hard-fail (§17.11.3)
- Margin `< warn threshold` (default 15%, read from AlertThresholds) -> yellow `Margin warn` Badge on the scenario row (`margin-warn-badge`). Target scenario 7.5% < 15% -> warns (parity with prototype amber alert).
- Margin `< 0%` -> destructive `hard-fail-banner` (role=alert) + `Margin hard fail` Badge on the row; **Save is disabled** while the current params hard-fail (red-line: "Do not allow Save when margin < 0%").

## Money / NUMERIC
All money & percent values render from decimal STRINGS bound from NUMERIC columns (`::text` in SQL). No `Number()`/float on any monetary value for display; the only numeric coercions are layout-only (bar fill %, slider thumb position). Margin € (= revenue − COGS) computed via exact 4-dp BigInt decimal helpers in the loader.

## Required UI states (per-state DOM captured here)
loading.html · empty.html · populated.html · error.html · permission_denied.html. (Optimistic feedback: Save shows `Saving…` then `Scenario saved.` / error `role=alert` — exercised by the save-scenario RTL tests.)

## a11y
- Waterfall bars: `role="img"` with `aria-label="<label>: <€value>"`; color never the sole signal (text label + €value always present).
- Sliders: native `role="slider"` keyboard widget (ArrowKeys/Home/End/PageUp/Down), explicit `<label htmlFor>` each.
- Scenario status uses Badge text (`Margin warn` / `Margin hard fail` / `±x.x%`) — never color alone.
- Unit pills are `Button` with `aria-pressed`; banners use `role="alert"`/`role="note"`.

## Deviation log
1. **Slider primitive built in `packages/ui`** rather than pulling `@radix-ui/react-slider`. Reason: `@radix-ui/react-slider` is not installed and `@radix-ui/*` is restricted to `packages/ui`; the new `Slider` is a self-contained accessible `role="slider"` widget that satisfies the red-line "no raw `<input type=range>`" while keeping the radix/app boundary. Functionally equivalent to the shadcn Slider for the what-if use case.
2. **Prototype 3-scenario figures are hardcoded mocks** (pork 82%, yield 22%, €18.40, etc.). Production derives every scenario row from real `costing_breakdowns` + `costing_waterfall_steps` (T-070/T-073), one row per named scenario; cost €/kg = the Logistics/COGS cumulative step (step 6), revenue = stored `target_price_eur`, margin € = revenue − COGS, margin % = stored snapshot column.
3. **Unit pills (kg/pack/batch)** are a client-only display toggle (state) in this read screen; per-pack/per-batch multiplier conversion is deferred (no pack-size source wired into the costing read model yet) — pills toggle `aria-pressed` for parity; values remain per-kg. Documented, not silently dropped.
4. **Playwright happy-path** requires a running Next server + Supabase auth + seeded costing rows (module-level Gate-5). Per AC4, the RTL/DOM-snapshot harness (`costing-screen.evidence.test.tsx`) provides the per-state fallback evidence; live click-through is captured at the NPD module Gate-5 sign-off, not at this component task.

## axe
No automated axe run at the component-task layer (same Playwright/server blocker as above). a11y baseline enforced structurally (labels, roles, text-not-color, keyboard slider) and asserted in RTL. axe-clean to be confirmed at module Gate-5.
