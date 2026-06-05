# Parity Audit — 03-technical (2026-06-05)

Read-only audit. Source code was NOT modified. Evidence = the actual `page.tsx`
files opened (line-level) + `_meta/prototype-labels/prototype-index-technical.json`
+ `apps/web/i18n/en.json`. The prototype JSX files themselves were NOT line-by-line
diffed (the prototype dir is space-named and the index JSON is the labeled SSOT);
anchor-line claims below are checked against the index ranges, not re-derived from
the raw JSX. This is a structural/code-level parity audit, not a rendered-pixel one.

## Coverage
- **Screens audited: 16 / 20 built** page.tsx fully read end-to-end:
  `page.tsx` (dashboard), `items/page.tsx`, `items/[item_code]/page.tsx` (partial — first 90 lines),
  `items/import/page.tsx`, `bom/page.tsx`, `bom/[itemCode]/page.tsx`, `bom/[itemCode]/graph/page.tsx` (partial),
  `bom/diff/[productId]/page.tsx` (partial), `boms/snapshots/page.tsx`, `cost/page.tsx`,
  `costs/d365-import/page.tsx`, `factory-specs/page.tsx`, `shelf-life/page.tsx`, `sensory/page.tsx`,
  `tooling/page.tsx`, `compliance/page.tsx`, `lab-results/page.tsx`, `allergens-config/page.tsx`,
  `allergens/overrides/page.tsx`, `routings/page.tsx`.
  (That is actually 20 files opened; 4 of them — item-detail, bom-graph, bom-diff — were read only partially,
  hence "16 fully / 20 touched". I am being explicit so the count is honest.)
- **Prototype files referenced by built pages:** `technical/other-screens.jsx`, `technical/bom-list.jsx`,
  `technical/bom-detail.jsx`, `technical/modals.jsx`, `technical/spec-driven-screens.jsx`,
  plus the `settings/data-screens.jsx` borrow noted in the index.
- **Screens with no locatable / mismatched anchor:** `items` & `items/[item_code]` (no dedicated item-master
  prototype — both honestly self-flag and borrow `MaterialsListScreen`/`MaterialDetailScreen`); `sensory`
  (no sensory prototype — borrows `lab_results_log_screen` layout primitive); `tooling` (derived view, borrows
  `tooling_screen` but data model is routings-derived, not a `tooling_items` table). All four are HONESTLY declared
  in the page headers as deviations, which is policy-compliant.

## Findings (table)

| ID | route/screen | prototype anchor (file:lines) | dimension | severity | cause-class | prototype shows | code renders | note |
|----|--------------|-------------------------------|-----------|----------|------------|-----------------|--------------|------|
| TEC-P-001 | bom/[itemCode] (detail) | bom-detail.jsx:3-65 (index: bom_detail_page 3-60) | structural | P1 | missing-feature | 7 tabs: tree / routing / params / costs / versions / graph / sheet | 7 tabs: components / co-products / snapshots / versions / approval / where-used / recipe-sheet | Tab SET diverges materially. Routing, Process-Params, Costs, and Graph tabs from the prototype are absent in-page; replaced by co-products / snapshots / approval / where-used (schema-real). Costs/Graph live on separate routes or are dropped. Defensible (built tabs map to real SSOT tables) but it is NOT 1:1 — costs breakdown + process-params + routing inline tabs are a genuine prototype feature gap on this screen. |
| TEC-P-002 | items, items/[item_code] | (none — borrows other-screens.jsx MaterialsListScreen / MaterialDetailScreen) | structural | P2 | missing-feature | dedicated item-master not prototyped | item-master list + 8-tab detail with 7 tabs stubbed/deferred | item-detail header explicitly: "the other seven [tabs] deferred until their owning slices land". So 7/8 detail tabs are placeholder shells. Honest, but a real coverage gap vs the PRD TEC-012 8-tab contract. |
| TEC-P-003 | (module-wide) | n/a | data | P1 | data-wiring | n/a | i18n namespace split across `technical.*` AND `Technical.*` (capital T) | factory-specs/sensory/shelf-life/releaseBundle resolve under `Technical.*`; everything else under `technical.*`. Both exist in en.json so nothing 404s today, but it is a fragile inconsistency: one rename/merge drops half the labels to English fallback silently. Systemic. |
| TEC-P-004 | shelf-life | header cites other-screens.jsx:587-633; index shelf_life_screen = 715-758 | structural | P3 | one-off-execution | shelf_life_screen | KPI + table + override modal (correct content) | Anchor LINE NUMBERS in the page header do not match the labeled index ranges. Content parity is fine; the citation is stale. Recurs across many pages (see systemic). |
| TEC-P-005 | cost | header cites other-screens.jsx:633-692 / 536-585; index cost_history=761-820, costing=664-712 | structural | P3 | one-off-execution | CostHistoryScreen + CostingScreen | sparkline + history table + edit modal w/ >20% variance gate | Content + dual-owner + NUMERIC-exact red-line all correct. Anchor lines stale vs index. |
| TEC-P-006 | routings | header cites other-screens.jsx:4-34 (ok) + other-screens.jsx:1270-1287 (INVALID — file is ~1051 lines) | structural | P3 | one-off-execution | RoutingsScreen | item picker + version list + op editor + cost preview | Second cited anchor (1270-1287) does not exist in the file. Phantom anchor. |
| TEC-P-007 | sensory | header cites spec-driven-screens.jsx:472-569; index lab_results_log_screen = 451-546 | structural | P3 | one-off-execution | lab_results_log_screen (borrowed primitive) | read-only banner + KPI + verdict table + source note | Borrow is honest & declared; anchor lines stale. |
| TEC-P-008 | items/[item_code] | header cites other-screens.jsx:354-477 MaterialDetailScreen; index material_detail_screen = 483-605 | structural | P3 | one-off-execution | MaterialDetailScreen | 8-tab detail shell | Anchor lines stale; also claims "1:1" while 7 tabs are stubs (see TEC-P-002). |
| TEC-P-009 | factory-specs | other-screens.jsx:40-75 cited; index SpecsScreen = 74-108 | visual | P3 | one-off-execution | SpecsScreen table | Card+Table, Customer column folded, Actions+Review CTA added | Deviation (folded Customer col, added Actions) is declared in header — policy OK. Anchor lines stale. |
| TEC-P-010 | tooling | other-screens.jsx:314-352 (matches index) | data | P2 | missing-feature | tooling_screen (stock / reorder / cost / type=Tooling/Consumable) | routings-DERIVED list (machine/line setups), no stock/reorder/min-stock columns | Built screen is a routings projection, NOT the prototype's tooling-inventory (stock<min → Reorder) screen. Columns differ substantially: no stock count, no reorder status, no consumable lifecycle. Declared as "derived from routings" — but it does not deliver the prototype's reorder-management feature. |
| TEC-P-011 | (all list/table screens) | various | a11y | P2 | systemic-pattern | — | tables use `scope="col"`, role="alert"/"status"/"note" banners, aria-busy skeletons | a11y is GENERALLY GOOD (scope cols, alert roles, aria-busy). BUT no evidence of axe runs in the pages themselves; allergen-matrix vertical-rl header SR-order + AllergenMatrix cell aria-labels (prototype index calls these out) were not verifiable in `allergens-config/page.tsx` shell (logic is in the .client island, not audited). Flagged as coverage gap, not a confirmed defect. |
| TEC-P-012 | bom/[itemCode]/graph | bom-detail.jsx:471-544 (matches index) | visual | P2 | missing-feature | BOM graph (DAG, drag-pan/zoom, CCP nodes, legend) | layered flow tab (raw→sub→process→output) with explode/where-used direction | Index translation note specifies react-flow DAG w/ pan/zoom. Built version is a static layered list (no react-flow, no pan/zoom, no CCP node styling). Reduced-fidelity but functional; matches the prototype's *information* not its *interaction*. |

## Systemic patterns (KEY)

1. **`stale/phantom-prototype-anchor` — class: one-off-execution — ≥7 screens**
   (shelf-life P-004, cost P-005, routings P-006, sensory P-007, item-detail P-008, factory-specs P-009,
   and by inspection the dashboard header range too). Page-header anchor LINE NUMBERS were written from an
   earlier prototype revision and never reconciled against `prototype-index-technical.json`; one (routings
   1270-1287) points past EOF. Content parity is unaffected — this is a **traceability/evidence** defect, not a
   visual one. **FIX = per-screen EXECUTION** (mechanical: re-point each header to the index range) but the
   ROOT CAUSE is the absence of an anchor-lint gate → a SKILL/CI fix (add a check that every `prototypes/...:N-M`
   citation resolves to a real index entry) prevents recurrence.

2. **`prototype-feature-dropped-for-schema-reality` — class: missing-feature — ≥3 screens**
   (bom-detail tab set P-001, tooling-inventory→routings-projection P-010, bom-graph DAG→layered-list P-012;
   item-detail 7 stub tabs P-002 is adjacent). The team consistently substituted the prototype's richer
   interaction (inline cost/param/routing tabs, react-flow DAG, stock-reorder inventory) with a thinner, real-data
   surface keyed to the actual SSOT tables. Each is HONESTLY declared in the page header — so it is policy-compliant
   *deviation*, not a hidden regression — but collectively it means the 03-technical UI is **functionally a tier
   below the prototype** on detail/graph/tooling. **FIX = per-screen EXECUTION** (build the missing tabs/DAG/inventory),
   tracked as feature backlog, not a token/skill change.

3. **`dual-namespace-casing` — class: data-wiring — module-wide (1 systemic instance, touches ≥4 screens)**
   `technical.*` vs `Technical.*` split (P-003). Both exist so no live break, but it is a latent silent-fallback
   trap. **FIX = SKILL/convention** (mandate a single lowercase `technical.*` root + a lint) then a one-off
   EXECUTION migration of the 4 `Technical.*` screens.

## Top P0/P1 blockers (max 10)
- **None P0.** No FA-not-FG leak, no `tenant_id`, no mock-data screens, no D365 write-path were found — every
  page reads real Supabase via `withOrgContext` + RLS, D365 surfaces are import/pull/export-only and honor R15.
  The four hard red-lines are CLEAN across all audited screens.
- **P1 — TEC-P-001:** BOM-detail tab set diverges from prototype (routing/params/costs/graph tabs missing in-page).
- **P1 — TEC-P-002:** Item-detail 8-tab shell has 7 tabs stubbed/deferred (only Overview wired).
- **P1 — TEC-P-003:** `technical.*` / `Technical.*` i18n namespace split (latent silent-English-fallback risk).

## Honest coverage gaps
- I did **NOT** open any `_components/*.client.tsx` or `_tabs/*` islands. All validation, disabled/loading inside
  modals, optimistic states, allergen-matrix cell a11y, the cost >20% approver modal, and the bulk-import wizard
  step machine live in those islands and were **inferred from the server page + headers, not verified**. A11y
  findings (TEC-P-011) are therefore provisional.
- I did **NOT** line-diff the raw prototype JSX (used the labeled index as SSOT). Anchor-line findings compare
  header citations to the index, not to the JSX. Pixel/density/spacing visual parity was **not** assessed (no
  rendered screenshots taken — this was a static code audit).
- `items/[item_code]`, `bom/.../graph`, `bom/diff/...` were read only partially (first ~60-90 lines); their
  tail rendering + tab panels were not fully audited.
- No test runs or Playwright captures were performed (read-only mandate); "states are rendered" claims are
  based on JSX branch presence (error/empty/ready/denied branches all visibly present in every page), which is
  strong but not a runtime proof.
