# Monopilot Tuning — Dispatch Plan for 3 Parallel Opus Agents

Paired with `TUNING-PATTERN.md`. This doc says WHAT per module. The pattern doc says HOW.

---

## §1 Scope summary

- **Modules:** 15
- **Total code sampled:** ~59,500 lines of JSX/CSS across modules
- **Avg per module:** ~3,970 lines
- **Largest:** maintenance (4,959), planning (4,918), scanner (4,760), npd (4,546), shipping (4,185)
- **Smallest:** oee (2,861), technical (3,181), production (3,363)
- **Existing BACKLOG.md:** 100+ BL-* items across modules (separate list — most are feature/data
  gaps, not tuning)
- **Shared layer:** `_shared/` has modals, placeholders, shared CSS — NO tuning primitives yet
- **Tuning gap count (across 15 modules):** 178 discrete gaps identified (§2)

Common pattern observed: every module is **visually decent** and uses the same base tokens
(`colors_and_type.css`), but each module re-invents patterns that should be shared:
- 6 of 15 CSS files declare `tabular-nums` locally instead of inheriting globally
- 0 of 15 modules have an `<EmptyState/>` primitive
- Only scanner has a full dark-first palette (intentional)
- Sparklines / run-strips appear in ~4 modules (production, reporting, oee, planning-ext) but
  each uses a local implementation
- Tabs with counts present inconsistently (kanban in quality, pills in warehouse, tabs in
  reporting) — no shared component
- Sidebar badges: production nav-count exists, most other modules don't badge

---

## §2 Module-by-module findings

### §2.1 NPD (01) — 4,546 lines — Effort: MEDIUM

**Current state.** Rich module with 14 screen files (Brief, FA, Formulation, Allergen, Docs,
D365, Pipeline, Project, Recipe). Uses `npd.css` with full chrome (sidebar, topbar, sub-nav).
Many long forms (Brief has C1–C37 fields).

**Top-3 tuning gaps.**
1. **Sticky step header on Brief Detail + FA Detail** — long forms scroll far past primary
   "Save" / "Submit" action. Add sticky header with step indicator + primary CTA. Touch:
   `brief-screens.jsx`, `fa-screens.jsx`, `npd.css`.
2. **Empty states missing on all list screens** — Pipeline (no FAs), Brief list, FA list,
   Docs list all render empty `<tbody>`. Add `<EmptyState/>` throughout.
3. **Sidebar count badges** — no badge for "briefs awaiting signoff" on sidebar. Add count of
   `open + awaiting_signoff` briefs as red/amber badge.

**BACKLOG overlap (tuning-scope items only).** BL-NPD-05 (allergen cascade SVG static — low
priority; animating counts as tuning — include). BL-NPD-06 responsive breakpoints — OUT of scope
for this wave. BL-NPD-01..04 are feature/data — OUT.

---

### §2.2 Settings (02) — 3,663 lines — Effort: MEDIUM

**Current state.** 12 screen files across access/account/admin/data/integrations/ops/org.
Uses Stripe-style settings-nav (240px secondary rail). Dense forms (`.sg-row` grid).

**Top-3 tuning gaps.**
1. **Dry-run button on rules activation + feature-flag toggles** — currently "Activate" is
   immediate. Add dry-run preview modal showing affected objects/rules.
2. **Surface-2 for nested form groups** — `.sg-section` inside `.sg-section` has duplicate
   borders. Replace inner border with `--surface-2` bg.
3. **Empty state for integrations / users / API keys** lists (high-likelihood-empty lists).

**BACKLOG overlap.** BL-SET-01/02/03/04 are feature wizards (OUT). BL-SET-09 MFA modal (OUT —
feature). BL-SET-12 duplicate `const BomsScreen` — fix during tuning pass IF in touched file;
otherwise leave for backend.

---

### §2.3 Technical (03) — 3,181 lines — Effort: LOW

**Current state.** BOM list + BOM detail + product spec + shelf-life screens. Dense table
chrome (`.bom-grid`, `.tree-row`). Already has mono + good table density.

**Top-3 tuning gaps.**
1. **Tabs with counts on BOM list** — no filter tabs; every BOM shown flat. Add TabsCounted
   All / Draft / Active / Deprecated.
2. **Sticky header on BOM Detail tree** — tree can scroll 50+ rows past the "Save / Publish"
   action.
3. **tabular-nums missing on tree cost columns** — `.tree-row` child cells use no font-variant.

**BACKLOG overlap.** BL-TEC-01 D365 mapping red banner — already present, unchanged. BL-TEC-02
traceability static — OUT (data). BL-TEC-04 shelf-life preset — OUT (feature).

---

### §2.4 Planning (04) — 4,918 lines — Effort: HIGH

**Current state.** Largest module after maintenance. Full chrome. 10+ screens: WO list, WO
detail, PO list, PO detail, TO, Cascade, Gantt, dashboard. Already has alert-cols pattern (3
columns — red/amber/orange).

**Top-3 tuning gaps.**
1. **GHA auto-expand on WO list** — overdue WOs collapsed with rest. Auto-expand
   overdue+running.
2. **Dry-run on Cascade Generate** — generating a cascade is destructive (creates WOs). Add
   "Preview cascade" before "Generate".
3. **RunStrip on WO detail header** — per-period WO output isn't summarised; add 8-shift
   outcome strip.

**Plus:** Planning has 10+ modals — all use same `.modal-*` classes from shared.css (good).
Filter bar has 5+ filters visible on WO list — collapse to "More ▾".

**BACKLOG overlap.** Q2 Cascade DAG upgrade is a feature, OUT. BL-PLAN-* are all feature/data.

---

### §2.5 Warehouse (05) — 3,820 lines — Effort: HIGH

**Current state.** 7 screen files. Modals file is ~3,611 lines (largest). LP status pills,
expiry colour coding, ltree breadcrumb, kpi-locked. Dashboard dense.

**Top-3 tuning gaps.**
1. **TabsCounted on LP list** — currently `.lp-status` shown per-row but no top-level filter
   tabs. Add All / Available / Reserved / Blocked / Expired.
2. **CompactActivity on Movement list** — currently flat list, hundreds of movements. Group
   by LP / WO correlation id.
3. **EmptyState on Bin grid + GRN list + Cycle Count list** — currently empty tbody.

**Modals (3,611 lines) specific:** LP Picker modal needs tabular-nums on qty column; GRN create
modal needs dry-run ("Post → Preview GRN lines"); destructive LP-merge confirm missing reason
input (already patterned in MODAL-SCHEMA.md §9).

**BACKLOG overlap.** BL-WH-01 cycle count workflow (OUT — feature). BL-WH-05 ltree hierarchy
(OUT — feature). BL-WH-04 ZPL rendering (OUT).

---

### §2.6 Scanner (06) — 4,760 lines — Effort: LOW (dark-first already)

**Current state.** Already dark-first with its own token namespace (`--sc-*`). Mobile device
frame. 6 flow files + login + home. Very polished already.

**Top-3 tuning gaps.**
1. **tabular-nums on scanner qty / LP / counts** — scanner uses `-apple-system`, not Inter;
   apply tabular-nums explicitly on numeric cells.
2. **EmptyState (scanner variant)** — dark-mode variant of `<EmptyState/>`; applies to
   "No items to pick", "No pending LPs to receive", "Queue empty".
3. **RunStrip on login screen recent-activity** — shows last 8 session outcomes for the user
   (visual audit).

**Scanner-specific gotcha.** Do NOT port the desktop light palette here. The dark palette is
ergonomic (glare reduction on handhelds) — documented in README. Only polish: tabular-nums,
surface contrast within dark, consistent component shapes.

**BACKLOG overlap.** BL-SCN-01..08 are mostly feature (camera, offline, PIN setup). BL-SCN-07
i18n — OUT (data). None tuning-scope.

---

### §2.7 Planning-Ext (07) — 3,595 lines — Effort: MEDIUM

**Current state.** Advanced Scheduler premium module. Solver chip, solver progress, solver
phase, scenarios, sequencing, forecast, matrix, run history.

**Top-3 tuning gaps.**
1. **Dry-run on Optimizer Run** — solver has dry-run / preview chip already in CSS but no
   dedicated button surfaced on Scheduler page. Expose it as primary secondary action.
2. **RunStrip on Run History screen** — run history is a table; compress 8-outcome strip per
   scenario for at-a-glance quality.
3. **GHA auto-expand failed runs** on run history — failed runs collapsed same as successful;
   auto-expand failed + running.

**BACKLOG overlap.** BL-PEXT-05 hour-level Gantt zoom (broken toggle) — fix during tuning since
it's a visual-only bug in already-rendered component. BL-PEXT-08 undo-approval 60s timer — add
countdown ring (tuning-scope, visual). BL-PEXT-01/02 feature — OUT.

---

### §2.8 Production (08) — 3,363 lines — Effort: LOW

**Current state.** Most-polished module visually. Already has:
- KPI cards with `tabular-nums`
- Line cards with border-top status colour (running/paused/down/changeover/idle)
- `.refresh-dot` pulse animation
- `nav-count` badges in sub-nav (rare — only production has this)
- Timeline feed

**Top-3 tuning gaps.**
1. **CompactActivity on live feed** — timeline feed is flat; group by WO invocation.
2. **RunStrip on line cards** — line-card footer has no trend; add 8-shift OEE outcome strip.
3. **`.btn-danger` fallback bug** — BL-PROD-05 flagged HIGH: `.btn-danger` referenced in
   MODAL-SCHEMA but missing from production.css (currently inherits from npd.css). Move
   `.btn-danger` to `_shared/shared.css` during tuning so all modules share.

**BACKLOG overlap.** BL-PROD-05 (tuning-scope, HIGH). BL-PROD-01..04 feature/data — OUT.

---

### §2.9 Quality (09) — 4,046 lines — Effort: MEDIUM

**Current state.** 8 screen files: NCR, specs, holds, HACCP, inspections, dashboard. Rich badge
palette (15 variants). Kanban strip for NCR. Uses `.kanban-col` with `tabular-nums` already.

**Top-3 tuning gaps.**
1. **Badge palette consolidation** — 15 `.badge-*` variants — many duplicate (e.g.
   `.badge-pass` + `.badge-released` both green). Consolidate to 5 semantic tones; keep legacy
   class names as aliases.
2. **GHA auto-expand on NCR list** — overdue/escalated NCRs collapsed alongside closed; auto-
   expand.
3. **Sticky header on NCR Detail** — investigation + CAPA sections make NCR Detail tall.

**BACKLOG overlap.** BL-QA-01..04 are all P2 feature (CAPA, Batch Release, CoA) — OUT.
BL-QA-05 onboarding overlay — OUT. BL-QA-06 virtual keypad — OUT (feature).

---

### §2.10 Finance (10) — 3,594 lines — Effort: MEDIUM

**Current state.** Variance-centric. `.var-badge` (fav/unfav/warn/crit), `.cost-status`, cost
breakdown stacked bars, waterfall. Already uses tabular-nums on `.kpi-fin-big`.

**Top-3 tuning gaps.**
1. **TabsCounted on Variance screen** — currently shows All; add All / Favorable /
   Unfavorable / Critical with counts.
2. **Dry-run on Close Period action** — currently closes immediately; wrap with preview modal
   showing variance impact.
3. **RunStrip on Standard Costs screen** — trend per standard cost (last 8 weeks).

**BACKLOG overlap.** BL-FIN-03 BOM cost rollup — OUT (feature). BL-FIN-07 dual sign-off
warning — tuning-scope IF only visual warning polish (no modal rework). Everything else P2.

---

### §2.11 Shipping (11) — 4,185 lines — Effort: HIGH

**Current state.** SO, Shipment, Pick, Pack, BOL, Customer screens. 12 status colours (heaviest
status palette). Wave kanban.

**Top-3 tuning gaps.**
1. **Status palette consolidation** — 12 colours → 5 semantic tones (keep semantic meaning of
   picking/packing/packed distinct). Standardise the currently-divergent amber family (picking
   uses `#b45309` while packing uses `#9a3412` — align).
2. **GHA auto-expand on SO list** — held SOs / short-picks collapsed; auto-expand.
3. **CompactActivity on Shipment Detail timeline** — currently flat; group by event type.

**BACKLOG overlap.** BL-SHIP-03 wave edit modal stub — tuning-scope (add proper empty modal
or disable with tooltip). BL-SHIP-07 bulk SSCC reprint — OUT (feature). BL-SHIP-11 global
search — OUT. Rest P2.

---

### §2.12 Reporting (12) — 3,906 lines — Effort: MEDIUM

**Current state.** Catalog cards (3-col grid), freshness strip, KPI rows (3/4/5 variants),
drill-down breadcrumb, filter chips.

**Top-3 tuning gaps.**
1. **RunStrip on every KPI card** — KPI has value + change, no trend strip. Add 8-period strip
   at card footer.
2. **EmptyState on every scaffolded P2 catalog card tap target** — BL-RPT-01: currently shows
   toast only. Render EmptyState with "Coming in P2" + CTA back to catalog.
3. **tabular-nums on KPI values** — already has `.kpi-value` but `.kpi-fin-big` and a few
   others override without re-declaring.

**BACKLOG overlap.** BL-RPT-01 (tuning-scope, P2 placeholder routes). BL-RPT-03 zero-state
variants (tuning-scope, use `<EmptyState/>`). BL-RPT-04 `@media print` — OUT. BL-RPT-09 KPI
tile drag editor — OUT (feature).

---

### §2.13 Maintenance (13) — 4,959 lines — Effort: HIGH (largest module)

**Current state.** Dashboard, assets, PM schedules, spares, mWO. Has `loto-badge`, `mwo-status`,
`pri` severity, `ast-status`. Already uses dry-run-like patterns elsewhere.

**Top-3 tuning gaps.**
1. **TabsCounted on mWO list** — All / Requested / Open / In Progress / Overdue with counts.
2. **RunStrip on Asset Detail** — asset 8-PM outcome strip.
3. **GHA auto-expand on mWO list** — overdue + in-progress auto-expanded.

**Modals (4,674 lines — largest modals file):** Spare Reorder modal needs dry-run preview.
Asset Create has very long form — apply sticky header.

**BACKLOG overlap.** BL-MAINT-01 IoT sensors (P2, OUT). BL-MAINT-02 LOTO photo
"Recommended"/"Required" toggle — OUT. BL-MAINT-05 Skills Matrix PDF button stub — tuning-scope
(wire to toast or EmptyState).

---

### §2.14 Multi-site (14) — 4,122 lines — Effort: MEDIUM

**Current state.** Site switcher dropdown (signature pattern), IST screens, replication,
sites, admin, dashboard.

**Top-3 tuning gaps.**
1. **RunStrip on lane health row** — lanes currently show status pill only; add 8-IST outcome
   strip per lane.
2. **GHA auto-expand on IST failed/running** — currently all flat.
3. **Sidebar count badge "degraded sites"** — dashboard shows degraded status on SITE-OFF but
   sidebar has no count.

**BACKLOG overlap.** BL-MS-01 Map View (OUT — feature). BL-MS-05 real chart rendering —
tuning-scope IF switching CSS placeholders to inline SVG sparklines (yes, in-scope). BL-MS-06
heartbeat simulator (OUT).

---

### §2.15 OEE (15) — 2,861 lines — Effort: LOW (smallest)

**Current state.** Arc gauges, heatmap, trend chart, shift summary. Inherits production chrome.
Already has tabular-nums in oee.css.

**Top-3 tuning gaps.**
1. **RunStrip per heatmap row** — trailing 7-shift strip per row beside the day columns (BL-OEE
   spec already alludes).
2. **Sidebar badge "lines below target"** — no count badge.
3. **Empty states** — if no data for selected shift/date range, shows blank.

**BACKLOG overlap.** BL-OEE-01 incremental chart append — OUT. BL-OEE-03 colour-blind mode —
OUT (accessibility phase). BL-OEE-05 compare-weeks diff — OUT. BL-OEE-08 localStorage
persistence — tuning-scope (tiny).

---

## §3 Wave assignments

Balanced by total lines-of-code per agent (~19,000–20,500 LOC each) AND by effort complexity.
Each wave pairs one HIGH-effort module with 2–3 LOW/MEDIUM so the agent's workload is balanced.

### Wave A — Agent A (~19,900 LOC)

| Module | LOC | Effort |
|---|---|---|
| npd | 4,546 | MEDIUM |
| settings | 3,663 | MEDIUM |
| technical | 3,181 | LOW |
| planning | 4,918 | HIGH |
| oee | 2,861 | LOW |
| **Total** | **19,169** | |

**Rationale.** NPD + Technical + Planning are a natural cluster (data-flow chain: NPD designs →
Technical publishes BOM → Planning schedules). Settings is standalone; OEE (low-effort) balances
Planning (high).

### Wave B — Agent B (~19,900 LOC)

| Module | LOC | Effort |
|---|---|---|
| warehouse | 3,820 | HIGH |
| scanner | 4,760 | LOW (dark-first already) |
| planning-ext | 3,595 | MEDIUM |
| production | 3,363 | LOW |
| quality | 4,046 | MEDIUM |
| **Total** | **19,584** | |

**Rationale.** Warehouse + Scanner + Production are the shop-floor chain. Planning-ext bridges
Planning (Wave A) — but the tuning patterns are isolated enough to split. Quality touches
Production's output. Scanner is dark-first → agent must understand not to light-ify it.

### Wave C — Agent C (~20,800 LOC) + owns `_shared/` primitive creation

| Module | LOC | Effort |
|---|---|---|
| shipping | 4,185 | HIGH |
| reporting | 3,906 | MEDIUM |
| maintenance | 4,959 | HIGH |
| multi-site | 4,122 | MEDIUM |
| finance | 3,594 | MEDIUM |
| **Total** | **20,766** | |

**Plus Agent C is on the critical path.** Before any wave starts, Agent C lands:
- `_shared/primitives.jsx` with `<RunStrip/>`, `<EmptyState/>`, `<TabsCounted/>`,
  `<CompactActivity/>`, `<DryRunButton/>`
- `_shared/shared.css` additions: surface tokens, semantic tokens, `.btn-danger` (BL-PROD-05),
  sticky-header utility class
- `colors_and_type.css` global `font-variant-numeric: tabular-nums`

Wave A and Wave B wait for this foundation (est. 1 session). Then all 3 waves run in parallel.

**Rationale.** Wave C modules are the "outer rim" (shipping to customers, reporting to
executives, maintenance to engineers, multi-site to corp, finance to accounting) — they each
have the strongest need for RunStrip + CompactActivity which Agent C is building anyway.
Maintenance is the single biggest module — Agent C absorbs it balanced by Finance (low-MEDIUM).

---

## §4 Coordination rules — avoid merge conflicts

1. **`_shared/` is owned by Agent C.** Agents A and B do NOT edit `_shared/modals.jsx`,
   `_shared/shared.css`, `_shared/primitives.jsx`, or `colors_and_type.css`. If they need a
   new primitive, they open an issue → Agent C adds it → they rebase.

2. **Module boundaries are hard.** Agent A touches only `npd/`, `settings/`, `technical/`,
   `planning/`, `oee/`. Agent B only its 5. Agent C only its 5.

3. **CSS load order.** Module CSS imports `colors_and_type.css` → `_shared/shared.css` →
   module CSS. Module CSS must not redefine surface tokens or semantic tokens — use the
   shared ones.

4. **Shared component import path.** All modules import shared primitives from `_shared/
   primitives.jsx`:
   ```html
   <script type="text/babel" src="../_shared/primitives.jsx"></script>
   ```
   Load order: after `modals.jsx`, before any module screen files.

5. **Data files are frozen.** No edits to any `data.jsx`. If tuning needs new mock fields (e.g.
   `runHistory: ["ok","ok","bad"]`), add a `deriveRunHistory(entity)` helper in the module's
   shell/dashboard file — do not mutate `data.jsx`.

6. **Modal contracts frozen.** `onConfirm(payload)` signatures unchanged. Modal primitives
   (`<Modal/>`, `<Stepper/>`, `<Field/>`, `<ReasonInput/>`, `<Summary/>`) unchanged.
   MODAL-SCHEMA.md is the contract.

7. **Git branches.** `tune/wave-a`, `tune/wave-b`, `tune/wave-c-primitives`, `tune/wave-c-modules`.
   Wave C primitives merges first. Then A/B/C-modules merge in any order — no file overlap means
   no conflicts.

8. **PR size budget.** Target ~1,500–2,500 LOC diff per module. Larger → split into multiple PRs
   per module (e.g., `tune/wave-a-planning-1-tabs` + `tune/wave-a-planning-2-gantt`).

9. **No commits in this planning session.** The user reviews TUNING-PLAN.md first, then dispatches
   agents.

---

## §5 Done criteria — per module

Each module's tuning is DONE when:

- [ ] `TUNING-PATTERN.md §4` 15-item checklist filled, all items either ticked or marked
      `N/A (reason)`
- [ ] Smoke test: module HTML loads without console errors; all previously-working routes
      render; all existing modals still open and close
- [ ] Visual diff screenshots (before/after) for 3 key screens attached to PR description
- [ ] `data.jsx` hash unchanged (`sha256sum data.jsx` equal pre/post)
- [ ] Modal `onConfirm` signature matrix unchanged (grep `onConfirm={` — count stable)
- [ ] BACKLOG.md BL-*-TUNE items addressed in this wave are checked off with commit ref
- [ ] Module README.md (if exists) footer updated with "Tuned 2026-04-XX" line

Wave is DONE when:
- All 5 modules in the wave have per-module DONE
- No merge conflicts with adjacent waves
- `_shared/primitives.jsx` usage count > 0 in every module of the wave
- BACKLOG.md global updated with wave-level TUNE line

---

## §6 Risks & flags

| Risk | Mitigation |
|---|---|
| Scanner's dark palette is intentional; an agent might try to light-ify it | `TUNING-PATTERN.md §5` lists scanner as OUT of scope for palette; README explicit. Also flagged in Wave B description. |
| OEE uses custom colour philosophy (heatmap cell colour = OEE score gradient) | Keep heatmap colour ramp as-is; apply only structural tuning (RunStrip, EmptyState, sidebar badge). Flagged in §2.15. |
| Quality has 15 badge variants; consolidation risks breaking QA screens that rely on specific subtle hue differences | Keep legacy class names as aliases that point to the 5 semantic tones; don't delete classes. |
| Shipping has 12 status colours, some tightly tied to spec (amber picking vs orange packing distinction) | Semantic tones allow distinguishing within info family (info-1, info-2); don't collapse picking/packing/packed into single colour. |
| Agent C depends on Agent C-primitives landing first; blocks A and B | Agent C-primitives session is sequential (est. 1 focused session). Agents A and B start immediately after. |
| `data.jsx` freeze may block adding `runHistory` field needed by RunStrip | Use `deriveRunHistory(entity)` in shell/dashboard — pure derivation, no data file edit. |
| `_shared/shared.css` change (adding `.btn-danger`) could shift existing production styling | `.btn-danger` currently inherited from `npd.css` — moving to shared is additive; no visual diff expected. Run smoke test per module. |
| BACKLOG.md already has 100+ items; tuning adds more | Tuning adds `BL-*-TUNE-001..003` per module (max 45 new items). Tag them clearly so backend phase doesn't re-visit. |

---

## §7 Estimated wall-clock

Assuming each Opus agent session = ~4 hours of focused coding:

| Wave | Modules | Est wall-clock | Notes |
|---|---|---|---|
| C-primitives (blocking) | `_shared/` | 3–4 h | 1 agent, must finish first |
| A | 5 | 6–8 h | parallel to B and C-modules |
| B | 5 | 6–8 h | parallel to A and C-modules |
| C-modules | 5 | 7–9 h | slightly longer due to maintenance + shipping |

Total wall-clock with 3 parallel agents: **~10–13 hours** (vs ~30+ hours sequential).

---

## §8 Ready flag

**TUNING AGENTS CAN START after Agent C finishes `_shared/primitives.jsx` + shared CSS extension.**

User should review:
1. Wave assignments in §3 (approve or rebalance)
2. `_shared/` ownership by Agent C (approve or reassign)
3. BACKLOG.md item selection per module (which BL-* are "tuning scope")
4. Risk flags in §6 (any show-stoppers)

Once approved, dispatch:
- Session 1 (solo): Agent C → primitives + shared CSS
- Session 2 (parallel × 3): Agents A, B, C-modules

Each agent receives:
- This `TUNING-PLAN.md`
- `TUNING-PATTERN.md`
- Their 5-module list from §3
- Instruction: "Follow TUNING-PATTERN.md §4 checklist per module. Touch only your 5 modules.
  Do not edit `_shared/` unless you are Agent C. Open one PR per module."
