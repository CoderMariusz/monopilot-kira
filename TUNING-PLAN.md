# Monopilot Tuning — Dispatch Plan for 8 Parallel Opus Agents

Paired with `TUNING-PATTERN.md`. This doc says WHAT per module. The pattern doc says HOW.

**2026-04-23 rebalance.** Original plan was 3 waves (A/B/C). User rebalanced to 6 agents, then
split Tune-5 and Tune-6 → final **8 tuning agents** (plus Agent C primitives blocker). Rationale:
parallelism reduces wall-clock from ~10-13h to ~4-6h and isolates HIGH modules (maintenance,
planning, shipping, warehouse) from MED/LOW pairings. See §3 for final matrix.

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

## §3 Agent assignments (8-agent final, post 2026-04-23 rebalance)

Balanced by LOC + effort + domain coherence. Each agent owns 1-2 modules (vs original 5-module
waves). HIGH-effort modules (maintenance, planning, shipping, warehouse) each get dedicated or
near-dedicated agents.

### Agent C primitives (sequential blocker, ~3-4h)

Blocks all 8 tuning agents. Must land first and be merged to `main` before tuning agents dispatch.

**Builds:**
- `_shared/primitives.jsx` with `<RunStrip/>`, `<EmptyState/>`, `<TabsCounted/>`,
  `<CompactActivity/>`, `<DryRunButton/>`
- `_shared/shared.css` additions: surface tokens, semantic tokens, `.btn-danger` (BL-PROD-05),
  sticky-header utility class
- `colors_and_type.css` global `font-variant-numeric: tabular-nums`
- `deriveRunHistory(entity)` helper exported from shell (bo `data.jsx` freeze)

**Branch:** `tune/wave-c-primitives` → merge to `main` → all Tune-N agents rebase on new main.

### Tuning matrix — 8 parallel agents

| Agent | Modules | LOC | Effort mix | Domain theme |
|---|---|---|---|---|
| Tune-1 | maintenance + npd | 6,559 | HIGH + MED | Largest module + NPD design |
| Tune-2 | planning + oee | 7,779 | HIGH + LOW | Scheduling + OEE (related) |
| Tune-3 | shipping + settings | 6,098 | HIGH + MED | Customer-facing + config |
| Tune-4 | scanner + finance | 7,760 | LOW(dark) + MED | **Scanner dark-constraint agent** |
| Tune-5a | warehouse | 3,820 | HIGH solo | Heavy modals.jsx (3,611 LOC) — solo |
| Tune-5b | technical + production | 6,544 | LOW + LOW | Shop-floor already-polished pair |
| Tune-6a | planning-ext + quality | 7,641 | MED + MED | Production-phase pair |
| Tune-6b | reporting + multi-site | 8,028 | MED + MED | Outer-rim pair |

**Totals:** 8 agents, 15 modules, 54,229 LOC tuning workload (Agent C primitives separate).

### Rationale per agent

- **Tune-1 (maintenance + npd).** Maintenance is the largest module (4,959 LOC + 4,674 LOC modals).
  Paired with NPD (MED) for balance. Both touch long-form detail screens with sticky-header needs.
- **Tune-2 (planning + oee).** Planning is HIGH (dry-run + GHA expand + RunStrip). OEE is smallest
  module (2,861 LOC, LOW) — the two are operationally coupled (OEE reads planning outcomes).
- **Tune-3 (shipping + settings).** Shipping 12-color palette consolidation + settings dry-run on
  rules activation. Both have "destructive action needs preview" patterns.
- **Tune-4 (scanner + finance).** **Scanner has intentional dark palette — do NOT light-ify.**
  Agent receives explicit instruction on this. Finance (MED) fills the rest of the agent's budget.
- **Tune-5a (warehouse solo).** Warehouse modals.jsx is 3,611 LOC (heaviest modal file). HIGH
  effort with dry-run on GRN, LP-merge reason, CompactActivity on movements. Solo agent.
- **Tune-5b (technical + production).** Both LOW — already polished. Technical needs TabsCounted
  + sticky on BOM detail. Production needs RunStrip + CompactActivity (btn-danger move handled
  by Agent C primitives).
- **Tune-6a (planning-ext + quality).** Both MED, both production-phase. Planning-ext needs
  dry-run on Optimizer, quality needs 15→5 badge consolidation with aliases.
- **Tune-6b (reporting + multi-site).** Both MED, both "outer rim" dashboards. RunStrip-heavy
  (KPI cards on reporting, lane health on multi-site).

---

## §4 Coordination rules — avoid merge conflicts

1. **`_shared/` is owned by Agent C primitives.** Tune-1..Tune-6b do NOT edit
   `_shared/modals.jsx`, `_shared/shared.css`, `_shared/primitives.jsx`, or `colors_and_type.css`.
   If they need a new primitive mid-flight, they flag it in the PR — Agent C primitives runs a
   second pass post-tuning (not expected for Foundation wave).

2. **Module boundaries are hard.** Each Tune-N agent touches only its 1-2 modules from §3 matrix.
   No cross-module edits. No shared-layer edits.

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

7. **Git branches.**
   - `tune/wave-c-primitives` (merges first, blocker)
   - `tune/tune-1-maintenance-npd`
   - `tune/tune-2-planning-oee`
   - `tune/tune-3-shipping-settings`
   - `tune/tune-4-scanner-finance`
   - `tune/tune-5a-warehouse`
   - `tune/tune-5b-technical-production`
   - `tune/tune-6a-planning-ext-quality`
   - `tune/tune-6b-reporting-multisite`

   After primitives merge, all Tune-N branches rebase on new `main` and merge in any order — no
   file overlap means no conflicts.

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

| Phase | Agents | Est wall-clock | Notes |
|---|---|---|---|
| Agent C primitives (blocking) | 1 | 3–4 h | sequential, must finish + merge first |
| Tune-1..6b parallel | 8 | 3–4 h | all run in parallel; longest = Tune-1 (maint+npd 6.5k) |

Total wall-clock with 8 parallel agents: **~6–8 hours** (vs ~30+ hours sequential, vs ~10-13h
original 3-wave plan).

**Per-agent LOC ranges from 3,820 (Tune-5a warehouse) to 8,028 (Tune-6b reporting+multisite)** —
all well under single-session budget.

---

## §8 Ready flag

**Status 2026-04-23: APPROVED for dispatch.**

User approved on 2026-04-23:
- §3 8-agent matrix (with Tune-5/Tune-6 splits)
- Agent C primitives as sequential blocker
- 6 risk flags in §6 (scanner dark intentional, OEE heatmap keep, quality 15→5 with aliases,
  shipping picking/packing/packed distinct, data.jsx freeze, Agent C critical path)
- BACKLOG.md tuning-scope selections per §2 (wholesale approve)

Dispatch sequence:
- **Session 1 (solo, sequential):** Agent C primitives → `_shared/primitives.jsx` + shared CSS
  extension + `.btn-danger` move + `deriveRunHistory` helper. Merge to `main`.
- **Session 2 (parallel × 8):** Tune-1..Tune-6b dispatched simultaneously after primitives merge.

Each tuning agent receives:
- This `TUNING-PLAN.md`
- `TUNING-PATTERN.md`
- Their 1-2 module list from §3
- `_shared/primitives.jsx` usage examples (from Agent C output)
- Instruction: "Follow TUNING-PATTERN.md §4 checklist per module. Touch only your modules.
  Do not edit `_shared/` or any other module. Open one PR per module (or split if >2,500 LOC diff)."
